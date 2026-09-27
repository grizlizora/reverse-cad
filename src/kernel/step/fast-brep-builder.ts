// ==============================================================================
// src/kernel/step/fast-brep-builder.ts — High-Throughput Buffered B-Rep STEP Synthesizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { BRepAssemblyResult } from './step-brep-builder.js';
import { SolidBodyConfig } from './step-types.js';
import { computeShellMetrics } from './brep-mesh-metrics.js';
import { BRepReportAggregator } from './brep-report-calculator.js';
import { computeOrthonormalBasis } from './step-orthonormal-basis.js';

/**
 * Builds multi-body topological B-Rep geometry using continuous block buffering.
 * Accumulates lines in memory and writes them in full 256KB chunks without per-triangle microtasks.
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

  // Buffer lines locally to flush in large 256KB chunks
  let chunkBuffer = '';
  const CHUNK_CHAR_LIMIT = 256 * 1024;

  const flushBuffer = async () => {
    if (chunkBuffer.length > 0) {
      await writer.writeBlock(chunkBuffer);
      chunkBuffer = '';
    }
  };

  const indices = mesh.indices;
  const triangleToSurfaceId = surfaceMapping.triangleToSurfaceId;

  for (let b = 0; b < targetShells.length; b++) {
    const shell = targetShells[b];
    const bDef = bodyDefinitions[b];
    const shellFaceIds: string[] = [];
    const triIndices = shell.triangleIndices;
    const triCount = triIndices.length;

    // Exact topological metrics via divergence theorem
    const metrics = computeShellMetrics(
      mesh,
      shell.triangleIndices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ
    );

    reportAggregator.addShell(metrics, bDef);

    // 1. Ensure all triangles have surface references allocated
    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      if (!triangleToSurfaceId.has(t)) {
        if (chunkBuffer.length > 0) await flushBuffer();
        const sRef = await surfaceMapping.getOrCreateFacetPlane(t);
        triangleToSurfaceId.set(t, sRef);
      }
    }

    // 2. Build shell-local edge adjacency map for coplanar quad merging
    const edgeToTris = new Map<string, number[]>();
    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      const t3 = t * 3;
      const v0 = indices[t3];
      const v1 = indices[t3 + 1];
      const v2 = indices[t3 + 2];

      const e0 = v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`;
      const e1 = v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`;
      const e2 = v2 < v0 ? `${v2}_${v0}` : `${v0}_${v2}`;

      let l0 = edgeToTris.get(e0);
      if (!l0) edgeToTris.set(e0, l0 = []);
      l0.push(t);

      let l1 = edgeToTris.get(e1);
      if (!l1) edgeToTris.set(e1, l1 = []);
      l1.push(t);

      let l2 = edgeToTris.get(e2);
      if (!l2) edgeToTris.set(e2, l2 = []);
      l2.push(t);
    }

    // 3. Pre-compute triangle normals and plane distances for shell-local coplanar clustering
    const triNormals = new Float32Array(triCount * 3);
    const triDists = new Float32Array(triCount);
    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      const t3 = t * 3;
      const i0 = indices[t3];
      const i1 = indices[t3 + 1];
      const i2 = indices[t3 + 2];
      const p0x = stepVerticesX[i0], p0y = stepVerticesY[i0], p0z = stepVerticesZ[i0];
      const p1x = stepVerticesX[i1], p1y = stepVerticesY[i1], p1z = stepVerticesZ[i1];
      const p2x = stepVerticesX[i2], p2y = stepVerticesY[i2], p2z = stepVerticesZ[i2];
      const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
      const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;
      let nx = e1y * e2z - e1z * e2y;
      let ny = e1z * e2x - e1x * e2z;
      let nz = e1x * e2y - e1y * e2x;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-12) {
        nx /= len; ny /= len; nz /= len;
      } else {
        nx = 0; ny = 0; nz = 1;
      }
      triNormals[k * 3] = nx;
      triNormals[k * 3 + 1] = ny;
      triNormals[k * 3 + 2] = nz;
      const cx = (p0x + p1x + p2x) / 3.0;
      const cy = (p0y + p1y + p2y) / 3.0;
      const cz = (p0z + p1z + p2z) / 3.0;
      triDists[k] = nx * cx + ny * cy + nz * cz;
    }

    const triToK = new Map<number, number>();
    for (let k = 0; k < triCount; k++) {
      triToK.set(triIndices[k], k);
    }

    const mergedTris = new Uint8Array(mesh.triangleCount);

    // Helper: fallback to pair-wise convex quads and single triangles for a subset of triangles
    const emitFallbackQuads = (compTris: number[]) => {
      if (compTris.length === 1) {
        const tA = compTris[0];
        if (mergedTris[tA]) return;
        mergedTris[tA] = 1;
        const tA3 = tA * 3;
        const vA0 = indices[tA3];
        const vA1 = indices[tA3 + 1];
        const vA2 = indices[tA3 + 2];
        const surfA = triangleToSurfaceId.get(tA)!;
        const senseA = surfaceMapping.triangleSameSense[tA];
        const sameSense = senseA === 1 ? '.T.' : '.F.';
        const polyLoopId = allocator.nextId();
        chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${pointIds[vA0]}, ${pointIds[vA1]}, ${pointIds[vA2]}));\n`;
        const faceBoundId = allocator.nextId();
        chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
        const faceId = allocator.nextId();
        chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfA}, ${sameSense});\n`;
        shellFaceIds.push(faceId);
        return;
      }

      const compSet = new Set(compTris);
      for (let cIdx = 0; cIdx < compTris.length; cIdx++) {
        const tA = compTris[cIdx];
        if (mergedTris[tA]) continue;

        const tA3 = tA * 3;
        const vA0 = indices[tA3];
        const vA1 = indices[tA3 + 1];
        const vA2 = indices[tA3 + 2];
        const surfA = triangleToSurfaceId.get(tA)!;
        const senseA = surfaceMapping.triangleSameSense[tA];

        let mergedQuad: [number, number, number, number] | null = null;
        let matchedNeighbor = -1;

        const candidateEdges = [
          [vA0, vA1, vA2],
          [vA1, vA2, vA0],
          [vA2, vA0, vA1]
        ];

        for (let eIdx = 0; eIdx < 3; eIdx++) {
          const [edgeU, edgeV, oppA] = candidateEdges[eIdx];
          const edgeKey = edgeU < edgeV ? `${edgeU}_${edgeV}` : `${edgeV}_${edgeU}`;
          const adjacent = edgeToTris.get(edgeKey);
          if (!adjacent || adjacent.length !== 2) continue;

          const tB = adjacent[0] === tA ? adjacent[1] : adjacent[0];
          if (!compSet.has(tB)) continue;
          if (mergedTris[tB]) continue;
          if (triangleToSurfaceId.get(tB) !== surfA) continue;
          if (surfaceMapping.triangleSameSense[tB] !== senseA) continue;

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
          if (cosAlign < 0.9998) continue;

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

        const sameSense = senseA === 1 ? '.T.' : '.F.';
        if (mergedQuad && matchedNeighbor !== -1) {
          mergedTris[tA] = 1;
          mergedTris[matchedNeighbor] = 1;
          const [q0, q1, q2, q3] = mergedQuad;
          const polyLoopId = allocator.nextId();
          chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${pointIds[q0]}, ${pointIds[q1]}, ${pointIds[q2]}, ${pointIds[q3]}));\n`;
          const faceBoundId = allocator.nextId();
          chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
          const faceId = allocator.nextId();
          chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfA}, ${sameSense});\n`;
          shellFaceIds.push(faceId);
        } else {
          mergedTris[tA] = 1;
          const polyLoopId = allocator.nextId();
          chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${pointIds[vA0]}, ${pointIds[vA1]}, ${pointIds[vA2]}));\n`;
          const faceBoundId = allocator.nextId();
          chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
          const faceId = allocator.nextId();
          chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfA}, ${sameSense});\n`;
          shellFaceIds.push(faceId);
        }
      }
    };

    // 4. Group connected coplanar triangles into unified planar B-Rep faces with outer and inner loops
    const visitedComp = new Uint8Array(triCount);

    for (let k = 0; k < triCount; k++) {
      if (visitedComp[k]) continue;

      const comp: number[] = [];
      const queue: number[] = [k];
      visitedComp[k] = 1;

      const baseT = triIndices[k];
      const surfBase = triangleToSurfaceId.get(baseT)!;
      const senseBase = surfaceMapping.triangleSameSense[baseT];
      const nxBase = triNormals[k * 3];
      const nyBase = triNormals[k * 3 + 1];
      const nzBase = triNormals[k * 3 + 2];
      const distBase = triDists[k];

      let qHead = 0;
      while (qHead < queue.length) {
        const currK = queue[qHead++];
        const currT = triIndices[currK];
        comp.push(currT);

        const t3 = currT * 3;
        const v0 = indices[t3], v1 = indices[t3 + 1], v2 = indices[t3 + 2];
        const eKeys = [
          v0 < v1 ? `${v0}_${v1}` : `${v1}_${v0}`,
          v1 < v2 ? `${v1}_${v2}` : `${v2}_${v1}`,
          v2 < v0 ? `${v2}_${v0}` : `${v0}_${v2}`
        ];

        for (let e = 0; e < 3; e++) {
          const adj = edgeToTris.get(eKeys[e]);
          if (!adj) continue;
          for (let a = 0; a < adj.length; a++) {
            const neighborT = adj[a];
            const neighborK = triToK.get(neighborT);
            if (neighborK === undefined || visitedComp[neighborK]) continue;

            if (triangleToSurfaceId.get(neighborT) !== surfBase) continue;
            if (surfaceMapping.triangleSameSense[neighborT] !== senseBase) continue;

            const nDot =
              nxBase * triNormals[neighborK * 3] +
              nyBase * triNormals[neighborK * 3 + 1] +
              nzBase * triNormals[neighborK * 3 + 2];
            if (nDot < 0.9998) continue;

            const dDiff = Math.abs(distBase - triDists[neighborK]);
            if (dDiff > 0.05) continue;

            visitedComp[neighborK] = 1;
            queue.push(neighborK);
          }
        }
      }

      if (comp.length === 1) {
        emitFallbackQuads(comp);
      } else {
        // Multi-triangle coplanar component: extract boundary half-edges
        const compHalfEdges = new Map<string, number>();
        for (let c = 0; c < comp.length; c++) {
          const t = comp[c];
          const t3 = t * 3;
          const v0 = indices[t3], v1 = indices[t3 + 1], v2 = indices[t3 + 2];
          compHalfEdges.set(`${v0}_${v1}`, (compHalfEdges.get(`${v0}_${v1}`) || 0) + 1);
          compHalfEdges.set(`${v1}_${v2}`, (compHalfEdges.get(`${v1}_${v2}`) || 0) + 1);
          compHalfEdges.set(`${v2}_${v0}`, (compHalfEdges.get(`${v2}_${v0}`) || 0) + 1);
        }

        const nextMap = new Map<number, number>();
        const inDegree = new Map<number, number>();
        let hasPinch = false;

        for (const [eKey] of compHalfEdges.entries()) {
          const sep = eKey.indexOf('_');
          const u = parseInt(eKey.substring(0, sep), 10);
          const v = parseInt(eKey.substring(sep + 1), 10);

          if (!compHalfEdges.has(`${v}_${u}`)) {
            if (nextMap.has(u)) {
              hasPinch = true;
              break;
            }
            nextMap.set(u, v);
            inDegree.set(v, (inDegree.get(v) || 0) + 1);
            if (inDegree.get(v)! > 1) {
              hasPinch = true;
              break;
            }
          }
        }

        if (hasPinch || nextMap.size === 0) {
          emitFallbackQuads(comp);
          continue;
        }

        const visitedNodes = new Set<number>();
        const loops: number[][] = [];
        let traceFailed = false;

        for (const start of nextMap.keys()) {
          if (visitedNodes.has(start)) continue;
          const loop: number[] = [start];
          visitedNodes.add(start);
          let curr = nextMap.get(start)!;
          while (curr !== start) {
            if (!nextMap.has(curr) || visitedNodes.has(curr)) {
              traceFailed = true;
              break;
            }
            loop.push(curr);
            visitedNodes.add(curr);
            curr = nextMap.get(curr)!;
          }
          if (traceFailed || loop.length < 3) {
            traceFailed = true;
            break;
          }
          loops.push(loop);
        }

        if (traceFailed || loops.length === 0) {
          emitFallbackQuads(comp);
          continue;
        }

        // Calculate 2D signed area of each loop
        const basis = computeOrthonormalBasis([nxBase, nyBase, nzBase]);
        const dirZ = basis.dirZ;
        const dirX = basis.dirX;
        const dirY: [number, number, number] = [
          dirZ[1] * dirX[2] - dirZ[2] * dirX[1],
          dirZ[2] * dirX[0] - dirZ[0] * dirX[2],
          dirZ[0] * dirX[1] - dirZ[1] * dirX[0]
        ];

        const oV = indices[comp[0] * 3];
        const oX = stepVerticesX[oV], oY = stepVerticesY[oV], oZ = stepVerticesZ[oV];

        interface LoopDescriptor {
          loop: number[];
          boundId: string;
          isOuter: boolean;
        }

        const loopDescriptors: LoopDescriptor[] = [];
        let outerCount = 0;

        for (let l = 0; l < loops.length; l++) {
          const lp = loops[l];
          let area2 = 0;
          const len = lp.length;
          for (let i = 0; i < len; i++) {
            const vCurr = lp[i];
            const vNext = lp[(i + 1) % len];
            const dxC = stepVerticesX[vCurr] - oX, dyC = stepVerticesY[vCurr] - oY, dzC = stepVerticesZ[vCurr] - oZ;
            const dxN = stepVerticesX[vNext] - oX, dyN = stepVerticesY[vNext] - oY, dzN = stepVerticesZ[vNext] - oZ;
            const xC = dxC * dirX[0] + dyC * dirX[1] + dzC * dirX[2];
            const yC = dxC * dirY[0] + dyC * dirY[1] + dzC * dirY[2];
            const xN = dxN * dirX[0] + dyN * dirX[1] + dzN * dirX[2];
            const yN = dxN * dirY[0] + dyN * dirY[1] + dzN * dirY[2];
            area2 += (xC * yN - xN * yC);
          }
          const area = 0.5 * area2;
          const isOuter = senseBase === 1 ? area > 0 : area < 0;
          if (isOuter) outerCount++;

          const polyLoopId = allocator.nextId();
          const ptList = lp.map(v => pointIds[v]).join(', ');
          chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${ptList}));\n`;
          const boundId = allocator.nextId();
          if (isOuter) {
            chunkBuffer += `${boundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
          } else {
            chunkBuffer += `${boundId} = FACE_BOUND('', ${polyLoopId}, .T.);\n`;
          }
          loopDescriptors.push({ loop: lp, boundId, isOuter });
        }

        if (outerCount === 1) {
          for (let c = 0; c < comp.length; c++) {
            mergedTris[comp[c]] = 1;
          }
          loopDescriptors.sort((a, b) => (b.isOuter ? 1 : 0) - (a.isOuter ? 1 : 0));
          const boundsStr = loopDescriptors.map(d => d.boundId).join(', ');
          const faceId = allocator.nextId();
          const sameSense = senseBase === 1 ? '.T.' : '.F.';
          chunkBuffer += `${faceId} = FACE_SURFACE('', (${boundsStr}), ${surfBase}, ${sameSense});\n`;
          shellFaceIds.push(faceId);
        } else {
          emitFallbackQuads(comp);
        }
      }

      if (chunkBuffer.length >= CHUNK_CHAR_LIMIT) {
        await flushBuffer();
      }
    }

    if (chunkBuffer.length > 0) await flushBuffer();
    if (shellFaceIds.length === 0) continue;

    // Stream CLOSED_SHELL in chunks without giant 12MB string concatenation
    const closedShellId = allocator.nextId();
    chunkBuffer += `${closedShellId} = CLOSED_SHELL('', (\n`;
    for (let fIdx = 0; fIdx < shellFaceIds.length; fIdx++) {
      chunkBuffer += shellFaceIds[fIdx];
      chunkBuffer += fIdx === shellFaceIds.length - 1 ? '));\n' : ', ';
      if (chunkBuffer.length >= CHUNK_CHAR_LIMIT) {
        await flushBuffer();
      }
    }
    if (chunkBuffer.length > 0) await flushBuffer();

    const brepId = allocator.nextId();
    await writer.writeLine(`${brepId} = MANIFOLD_SOLID_BREP('${bDef.name}', ${closedShellId});`);
    solidBRepIds.push(brepId);

    const styleId = bodyPresentationStyles[b];
    if (styleId) {
      const styledItemId = allocator.nextId();
      await writer.writeLine(`${styledItemId} = STYLED_ITEM('', (${styleId}), ${brepId});`);
      allStyledItemIds.push(styledItemId);
    }
  }

  return {
    solidBRepIds,
    allStyledItemIds,
    report: reportAggregator.buildReport()
  };
}
