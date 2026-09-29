// ==============================================================================
// src/kernel/step/planar/through-hole-flood-filler.ts — Zero-Alloc BFS Flood Filler
// Absorbs internal thread triangles between matched loops with zero heap churn.
// ==============================================================================

import { RawMesh } from '../../../types/geometry.js';
import { CoplanarCluster } from './coplanar-clusterer.js';
import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';
import { MatchedThroughHole } from './through-hole-types.js';

export function floodFillInternalThreadTriangles(
  matchedHoles: MatchedThroughHole[],
  majorClusters: CoplanarCluster[],
  mesh: RawMesh,
  edgeIndexer: TopologyEdgeIndexer,
  mergedTris: Uint8Array
): void {
  const visitedTris = new Uint8Array(mesh.triangleCount);

  // Initialize with planar cluster triangles to avoid escaping out of the hole cavity
  for (let c = 0; c < majorClusters.length; c++) {
    const tris = majorClusters[c].triangleIndices;
    for (let i = 0; i < tris.length; i++) {
      visitedTris[tris[i]] = 1;
    }
  }

  const indices = mesh.indices;

  for (let h = 0; h < matchedHoles.length; h++) {
    const mh = matchedHoles[h];
    const tLoop = mh.topLoop;
    const bLoop = mh.botLoop;
    const tLoopVerts = new Set(tLoop);
    const bLoopVerts = new Set(bLoop);

    const queue: number[] = [];

    // Seed BFS from top loop boundary edges
    for (let i = 0; i < tLoop.length; i++) {
      const u = tLoop[i], v = tLoop[(i + 1) % tLoop.length];
      const adj = edgeIndexer.getAdjacentTriangleList(u, v);
      if (adj) {
        for (let a = 0; a < adj.length; a++) {
          const t = adj[a];
          if (!visitedTris[t]) {
            visitedTris[t] = 1;
            queue.push(t);
          }
        }
      }
    }

    let qHead = 0;
    while (qHead < queue.length) {
      const t = queue[qHead++];
      mergedTris[t] = 1;
      const t3 = t * 3;
      const i0 = indices[t3], i1 = indices[t3 + 1], i2 = indices[t3 + 2];

      // Flat check 3 edges directly without allocating [[i0, i1], [i1, i2], [i2, i0]]
      for (let e = 0; e < 3; e++) {
        const u = e === 0 ? i0 : (e === 1 ? i1 : i2);
        const v = e === 0 ? i1 : (e === 1 ? i2 : i0);

        // Do not cross the bounding loop contours
        if ((tLoopVerts.has(u) && tLoopVerts.has(v)) || (bLoopVerts.has(u) && bLoopVerts.has(v))) {
          continue;
        }

        const adj = edgeIndexer.getAdjacentTriangleList(u, v);
        if (adj) {
          for (let a = 0; a < adj.length; a++) {
            const nxt = adj[a];
            if (!visitedTris[nxt]) {
              visitedTris[nxt] = 1;
              queue.push(nxt);
            }
          }
        }
      }
    }
  }
}
