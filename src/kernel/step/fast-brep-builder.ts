// ==============================================================================
// src/kernel/step/fast-brep-builder.ts — High-Throughput Modular B-Rep Synthesizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { BRepAssemblyResult } from './step-brep-builder.js';
import { SolidBodyConfig } from './step-types.js';
import { computeShellMetrics } from './brep-mesh-metrics.js';
import { BRepReportAggregator } from './brep-report-calculator.js';
import { TopologyEdgeIndexer } from './topology-edge-indexer.js';
import { StepFaceEmitter } from './step-face-emitter.js';
import { clusterCoplanarTriangles, extractJordanFacesFromCluster } from './planar/index.js';

/**
 * Cooperative Event Loop Yielding Controller (16ms quantum).
 * Ensures Node.js worker threads remain 100% responsive to heartbeats, IPC, and AbortSignals.
 */
class CooperativeYieldController {
  private lastYield: number = Date.now();
  private readonly quantumMs: number;

  constructor(quantumMs: number = 16) {
    this.quantumMs = quantumMs;
  }

  public async maybeYield(): Promise<void> {
    const now = Date.now();
    if (now - this.lastYield >= this.quantumMs) {
      await new Promise<void>(resolve => setImmediate(resolve));
      this.lastYield = Date.now();
    }
  }
}

/**
 * Deterministic fallback: decomposes un-peeled clusters into convex planar quads and single triangles.
 */
async function emitFallbackQuadsAndTris(
  compTris: number[],
  indices: Uint32Array,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  surfaceId: string,
  sameSenseBool: boolean,
  edgeIndexer: TopologyEdgeIndexer,
  mergedTris: Uint8Array,
  emitter: StepFaceEmitter,
  triangleToSurfaceId?: Map<number, string>,
  triangleSameSense?: Uint8Array
): Promise<string[]> {
  const faceIds: string[] = [];
  const compSet = new Set(compTris);

  for (let cIdx = 0; cIdx < compTris.length; cIdx++) {
    const tA = compTris[cIdx];
    if (mergedTris[tA]) continue;

    const tA3 = tA * 3;
    const vA0 = indices[tA3];
    const vA1 = indices[tA3 + 1];
    const vA2 = indices[tA3 + 2];

    let mergedQuad: [number, number, number, number] | null = null;
    let matchedNeighbor = -1;

    const candidateEdges: Array<[number, number, number]> = [
      [vA0, vA1, vA2],
      [vA1, vA2, vA0],
      [vA2, vA0, vA1]
    ];

    for (let eIdx = 0; eIdx < 3; eIdx++) {
      const [edgeU, edgeV, oppA] = candidateEdges[eIdx];
      const adj = edgeIndexer.getAdjacentTriangleList(edgeU, edgeV);
      if (!adj || adj.length !== 2) continue;

      const tB = adj[0] === tA ? adj[1] : adj[0];
      if (!compSet.has(tB) || mergedTris[tB]) continue;

      const tB3 = tB * 3;
      const b0 = indices[tB3];
      const b1 = indices[tB3 + 1];
      const b2 = indices[tB3 + 2];

      let oppB = -1;
      if (b0 === edgeV && b1 === edgeU) oppB = b2;
      else if (b1 === edgeV && b2 === edgeU) oppB = b0;
      else if (b2 === edgeV && b0 === edgeU) oppB = b1;
      if (oppB === -1 || oppB === oppA) continue;

      const p0x = stepVerticesX[oppA], p0y = stepVerticesY[oppA], p0z = stepVerticesZ[oppA];
      const p1x = stepVerticesX[edgeU], p1y = stepVerticesY[edgeU], p1z = stepVerticesZ[edgeU];
      const p2x = stepVerticesX[oppB], p2y = stepVerticesY[oppB], p2z = stepVerticesZ[oppB];
      const p3x = stepVerticesX[edgeV], p3y = stepVerticesY[edgeV], p3z = stepVerticesZ[edgeV];

      const d10x = p1x - p0x, d10y = p1y - p0y, d10z = p1z - p0z;
      const d30x = p3x - p0x, d30y = p3y - p0y, d30z = p3z - p0z;
      const nAx = d10y * d30z - d10z * d30y;
      const nAy = d10z * d30x - d10x * d30z;
      const nAz = d10x * d30y - d10y * d30x;
      const lenA = Math.hypot(nAx, nAy, nAz);
      if (lenA < 1e-12) continue;

      const d32x = p3x - p2x, d32y = p3y - p2y, d32z = p3z - p2z;
      const d12x = p1x - p2x, d12y = p1y - p2y, d12z = p1z - p2z;
      const nBx = d32y * d12z - d32z * d12y;
      const nBy = d32z * d12x - d32x * d12z;
      const nBz = d32x * d12y - d32y * d12x;
      const lenB = Math.hypot(nBx, nBy, nBz);
      if (lenB < 1e-12) continue;

      const cosAlign = (nAx * nBx + nAy * nBy + nAz * nBz) / (lenA * lenB);
      if (cosAlign < 0.950) continue;

      const d21x = p2x - p1x, d21y = p2y - p1y, d21z = p2z - p1z;
      const d01x = p0x - p1x, d01y = p0y - p1y, d01z = p0z - p1z;
      const c1x = d21y * d01z - d21z * d01y;
      const c1y = d21z * d01x - d21x * d01z;
      const c1z = d21x * d01y - d21y * d01x;

      const d03x = p0x - p3x, d03y = p0y - p3y, d03z = p0z - p3z;
      const d23x = p2x - p3x, d23y = p2y - p3y, d23z = p2z - p3z;
      const c3x = d03y * d23z - d03z * d23y;
      const c3y = d03z * d23x - d03x * d23z;
      const c3z = d03x * d23y - d03y * d23x;

      const dotC1 = c1x * nAx + c1y * nAy + c1z * nAz;
      const dotC3 = c3x * nAx + c3y * nAy + c3z * nAz;

      if (dotC1 > 1e-7 && dotC3 > 1e-7) {
        mergedQuad = [oppA, edgeU, oppB, edgeV];
        matchedNeighbor = tB;
        break;
      }
    }

    const faceSurfaceId = triangleToSurfaceId?.get(tA) || surfaceId;
    const faceSameSense = triangleSameSense ? (triangleSameSense[tA] !== 0) : sameSenseBool;

    if (mergedQuad && matchedNeighbor !== -1) {
      mergedTris[tA] = 1;
      mergedTris[matchedNeighbor] = 1;
      const faceId = await emitter.emitQuadFace(
        mergedQuad[0],
        mergedQuad[1],
        mergedQuad[2],
        mergedQuad[3],
        faceSurfaceId,
        faceSameSense
      );
      faceIds.push(faceId);
    } else {
      mergedTris[tA] = 1;
      const faceId = await emitter.emitTriangleFace(vA0, vA1, vA2, faceSurfaceId, faceSameSense);
      faceIds.push(faceId);
    }
  }

  return faceIds;
}

/**
 * Builds multi-body topological B-Rep geometry using clean modular components,
 * zero-string integer edge indexing, and non-blocking 16ms event loop yielding.
 */
export async function buildFastMultiBodyBRep(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  targetShells: MeshShell[],
  bodyDefinitions: SolidBodyConfig[],
  bodyPresentationStyles: string[],
  surfaceMapping: SurfaceStepMapping,
  pointIds: string[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array
): Promise<BRepAssemblyResult> {
  const solidBRepIds: string[] = [];
  const allStyledItemIds: string[] = [];
  const reportAggregator = new BRepReportAggregator();

  const emitter = new StepFaceEmitter(writer, allocator, pointIds);
  const yieldCtrl = new CooperativeYieldController(16);

  const indices = mesh.indices;
  const triangleToSurfaceId = surfaceMapping.triangleToSurfaceId;

  for (let b = 0; b < targetShells.length; b++) {
    const shell = targetShells[b];
    const bDef = bodyDefinitions[b];
    const shellFaceIds: string[] = [];
    const triIndices = shell.triangleIndices;
    const triCount = triIndices.length;

    // 1. Exact topological metrics via divergence theorem
    const metrics = computeShellMetrics(
      mesh,
      triIndices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ
    );
    reportAggregator.addShell(metrics, bDef);

    // 2. Ensure all triangles have surface references allocated
    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      if (!triangleToSurfaceId.has(t)) {
        await emitter.flush();
        const sRef = await surfaceMapping.getOrCreateFacetPlane(t);
        triangleToSurfaceId.set(t, sRef);
      }
    }

    // 3. Build zero-string integer edge adjacency indexer
    const edgeIndexer = new TopologyEdgeIndexer(indices, triIndices);

    // 4. Group connected coplanar triangles into clusters using Float64 point-to-plane distance
    const clusters = clusterCoplanarTriangles(
      triIndices,
      indices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ,
      triangleToSurfaceId,
      surfaceMapping.triangleSameSense,
      edgeIndexer
    );

    const mergedTris = new Uint8Array(mesh.triangleCount);

    const singleTris: number[] = [];
    let singleSurfaceId = '';
    let singleSameSenseBool = true;

    // 5. Synthesize B-Rep faces from clusters
    for (let c = 0; c < clusters.length; c++) {
      await yieldCtrl.maybeYield();
      const cluster = clusters[c];
      const comp = cluster.triangleIndices;
      const sameSenseBool = cluster.sameSense === 1;

      if (comp.length === 1) {
        const t = comp[0];
        if (!mergedTris[t]) {
          singleTris.push(t);
          if (!singleSurfaceId) {
            singleSurfaceId = cluster.surfaceId;
            singleSameSenseBool = sameSenseBool;
          }
        }
        continue;
      }

      // Multi-triangle coplanar cluster: attempt Eulerian Jordan cycle extraction
      const jordanFaces = extractJordanFacesFromCluster(
        cluster,
        indices,
        stepVerticesX,
        stepVerticesY,
        stepVerticesZ,
        edgeIndexer
      );

      if (jordanFaces && jordanFaces.length > 0) {
        for (let i = 0; i < comp.length; i++) {
          mergedTris[comp[i]] = 1;
        }
        for (let fIdx = 0; fIdx < jordanFaces.length; fIdx++) {
          const faceId = await emitter.emitJordanFace(jordanFaces[fIdx]);
          shellFaceIds.push(faceId);
        }
      } else {
        // Fallback: pairwise convex quads and single triangles
        const fallbackFaceIds = await emitFallbackQuadsAndTris(
          comp,
          indices,
          stepVerticesX,
          stepVerticesY,
          stepVerticesZ,
          cluster.surfaceId,
          sameSenseBool,
          edgeIndexer,
          mergedTris,
          emitter
        );
        shellFaceIds.push(...fallbackFaceIds);
      }
    }

    // Process remaining single-triangle clusters into convex quads and triangles
    if (singleTris.length > 0) {
      await yieldCtrl.maybeYield();
      const fallbackFaceIds = await emitFallbackQuadsAndTris(
        singleTris,
        indices,
        stepVerticesX,
        stepVerticesY,
        stepVerticesZ,
        singleSurfaceId,
        singleSameSenseBool,
        edgeIndexer,
        mergedTris,
        emitter,
        triangleToSurfaceId,
        surfaceMapping.triangleSameSense
      );
      shellFaceIds.push(...fallbackFaceIds);
    }

    if (shellFaceIds.length === 0) continue;

    // 6. Stream CLOSED_SHELL in safe chunks
    const closedShellId = await emitter.emitClosedShell(shellFaceIds);

    // 7. Write MANIFOLD_SOLID_BREP & STYLED_ITEM
    const { brepId, styledItemId } = await emitter.emitSolidBrep(
      bDef.name,
      closedShellId,
      bodyPresentationStyles[b]
    );

    solidBRepIds.push(brepId);
    if (styledItemId) allStyledItemIds.push(styledItemId);
  }

  await emitter.flush();

  return {
    solidBRepIds,
    allStyledItemIds,
    report: reportAggregator.buildReport()
  };
}
