// ==============================================================================
// src/kernel/step/planar/through-hole-stitcher.ts — Topological Through-Hole Synthesizer Façade
// ==============================================================================

import { RawMesh } from '../../../types/geometry.js';
import { CoplanarCluster } from './coplanar-clusterer.js';
import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';
import { MatchedThroughHole, ThroughHoleStitchResult } from './through-hole-types.js';
import { findMatchingThroughHoles } from './through-hole-finder.js';
import { floodFillInternalThreadTriangles } from './through-hole-flood-filler.js';

export type { MatchedThroughHole, ThroughHoleStitchResult };

export {
  synthesizeThroughHoleBands,
  emitExactTrianglePlaneFace
} from './hole-cylinder-synthesizer.js';

/**
 * Identifies through-holes between opposing planar face clusters and absorbs
 * internal thread triangles via topological BFS.
 */
export function identifyAndAbsorbThroughHoles(
  clusters: CoplanarCluster[],
  mesh: RawMesh,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  edgeIndexer: TopologyEdgeIndexer,
  mergedTris: Uint8Array
): MatchedThroughHole[] {
  if (clusters.length < 2) return [];

  // 1. Filter to major planar clusters to prevent O(N^2) on tiny facet clusters
  const minTris = Math.min(50, Math.max(6, Math.floor(mesh.triangleCount * 0.005)));
  const majorClusters = clusters.filter(c => c.triangleIndices.length >= minTris);
  if (majorClusters.length < 2) return [];

  // Sort descending by triangle count so largest faces are checked first
  majorClusters.sort((a, b) => b.triangleIndices.length - a.triangleIndices.length);

  // 2. Identify opposing matching through-holes
  const matchedHoles = findMatchingThroughHoles(
    majorClusters,
    mesh,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ,
    edgeIndexer
  );

  if (matchedHoles.length === 0) return [];

  // 3. Topological BFS flood fill to absorb internal thread triangles
  floodFillInternalThreadTriangles(
    matchedHoles,
    majorClusters,
    mesh,
    edgeIndexer,
    mergedTris
  );

  return matchedHoles;
}
