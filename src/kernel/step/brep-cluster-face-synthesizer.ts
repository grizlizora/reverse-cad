// ==============================================================================
// src/kernel/step/brep-cluster-face-synthesizer.ts — Coplanar Cluster Face Emitter
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { TopologyEdgeIndexer } from './topology-edge-indexer.js';
import { StepFaceEmitter, JordanFaceDefinition } from './step-face-emitter.js';
import { emitFallbackQuadsAndTris } from './brep-fallback-planar-emitter.js';
import {
  CoplanarCluster,
  extractJordanFacesFromCluster,
  extractUnifiedCoplanarBoundary
} from './planar/index.js';

export { emitFallbackQuadsAndTris };

/**
 * Synthesizes B-Rep faces for a single coplanar cluster with Jordan cycle extraction,
 * unified half-edge fallback, boundary edge completeness verification, and exact triangle fallback.
 */
export async function synthesizeClusterFaces(
  cluster: CoplanarCluster,
  mesh: RawMesh,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  edgeIndexer: TopologyEdgeIndexer,
  mergedTris: Uint8Array,
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  emitter: StepFaceEmitter,
  surfaceMapping: SurfaceStepMapping,
  nonPlaneStepIds: Set<string>
): Promise<string[]> {
  const indices = mesh.indices;
  const clusterTris = cluster.triangleIndices;
  let hasMerged = false;
  for (let i = 0; i < clusterTris.length; i++) {
    if (mergedTris[clusterTris[i]]) { hasMerged = true; break; }
  }
  const comp = hasMerged ? clusterTris.filter(t => !mergedTris[t]) : clusterTris;
  if (comp.length === 0) return [];

  if (comp.length === 1) {
    return emitFallbackQuadsAndTris(
      comp, indices, stepVerticesX, stepVerticesY, stepVerticesZ,
      writer, allocator, mergedTris, emitter, surfaceMapping
    );
  }

  const sameSenseBool = cluster.sameSense === 1;
  let jordanFaces: JordanFaceDefinition[] | null = extractJordanFacesFromCluster(
    cluster, indices, stepVerticesX, stepVerticesY, stepVerticesZ, edgeIndexer
  );

  if (!jordanFaces || jordanFaces.length === 0) {
    const unified = extractUnifiedCoplanarBoundary(
      comp, indices, mesh.positions, cluster.normal, cluster.originPoint, 0
    );
    if (unified && unified.length > 0) {
      jordanFaces = unified.map(u => ({
        outerLoop: u.outerLoop,
        holeLoops: u.holeLoops && u.holeLoops.length > 0 ? u.holeLoops : undefined,
        surfaceId: cluster.surfaceId,
        sameSense: sameSenseBool
      }));
    }
  }

  if (jordanFaces && jordanFaces.length > 0) {
    let totalLoopEdges = 0;
    for (let j = 0; j < jordanFaces.length; j++) {
      totalLoopEdges += jordanFaces[j].outerLoop.length;
      const holes = jordanFaces[j].holeLoops;
      if (holes) {
        for (let h = 0; h < holes.length; h++) totalLoopEdges += holes[h].length;
      }
    }
    if (totalLoopEdges !== edgeIndexer.extractComponentBoundaryHalfEdges(comp).length) {
      jordanFaces = null;
    }
  }

  if (jordanFaces && jordanFaces.length > 0) {
    const emittedIds: string[] = [];
    for (let i = 0; i < comp.length; i++) mergedTris[comp[i]] = 1;
    for (let fIdx = 0; fIdx < jordanFaces.length; fIdx++) {
      const jf = jordanFaces[fIdx];
      let surfStepId = (jf.surfaceId && surfaceMapping.surfaceToStepId.get(jf.surfaceId)) || jf.surfaceId;
      if (!surfStepId || !surfStepId.startsWith('#') || nonPlaneStepIds.has(surfStepId)) {
        await emitter.flush();
        surfStepId = await surfaceMapping.getOrCreateFacetPlane(comp[0]);
      }
      emittedIds.push(await emitter.emitJordanFace({ ...jf, surfaceId: surfStepId }));
    }
    return emittedIds;
  }

  return emitFallbackQuadsAndTris(
    comp, indices, stepVerticesX, stepVerticesY, stepVerticesZ,
    writer, allocator, mergedTris, emitter, surfaceMapping
  );
}
