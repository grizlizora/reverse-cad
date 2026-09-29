// ==============================================================================
// src/kernel/step/validation/topology/shell-topology-aggregator.ts — Shell Topology Aggregator
// Aggregates edges, open boundary cracks, and vertex keys across decomposed shells in O(E).
// ==============================================================================

import { GeometricEdgeInfo } from '../types.js';

export interface ShellTopologyAggregation {
  shellEdgeSets: Array<Set<string>>;
  shellVertexSets: Array<Set<string>>;
  shellOpenEdgeCounts: Int32Array;
}

/**
 * Single-pass O(E) edge and vertex aggregation across all shells simultaneously.
 */
export function aggregateShellTopology(
  edgeMap: Map<string, GeometricEdgeInfo>,
  faceShellId: Int32Array,
  shellCount: number
): ShellTopologyAggregation {
  const shellEdgeSets: Array<Set<string>> = new Array(shellCount);
  const shellVertexSets: Array<Set<string>> = new Array(shellCount);
  const shellOpenEdgeCounts = new Int32Array(shellCount);

  for (let s = 0; s < shellCount; s++) {
    shellEdgeSets[s] = new Set<string>();
    shellVertexSets[s] = new Set<string>();
  }

  for (const [edgeKey, edgeInfo] of edgeMap.entries()) {
    const numOcc = edgeInfo.occurrences.length;
    if (numOcc === 0) continue;

    for (let i = 0; i < numOcc; i++) {
      const occ = edgeInfo.occurrences[i];
      const s = faceShellId[occ.faceIndex];
      if (s >= 0) {
        if (occ.kA) shellVertexSets[s].add(occ.kA);
        if (occ.kB) shellVertexSets[s].add(occ.kB);
      }
    }

    if (edgeInfo.isCircularSeam) continue;

    if (numOcc === 1) {
      const s = faceShellId[edgeInfo.occurrences[0].faceIndex];
      if (s >= 0) {
        shellEdgeSets[s].add(edgeKey);
        shellOpenEdgeCounts[s]++;
      }
    } else if (numOcc === 2) {
      const s0 = faceShellId[edgeInfo.occurrences[0].faceIndex];
      const s1 = faceShellId[edgeInfo.occurrences[1].faceIndex];

      if (s0 >= 0) shellEdgeSets[s0].add(edgeKey);
      if (s1 >= 0 && s1 !== s0) shellEdgeSets[s1].add(edgeKey);

      if (s0 !== s1) {
        // Edge shared between two different shells -> boundary tear/crack for both shells
        if (s0 >= 0) shellOpenEdgeCounts[s0]++;
        if (s1 >= 0) shellOpenEdgeCounts[s1]++;
      }
    } else {
      // Non-manifold edge (numOcc > 2): count occurrences per shell
      const occByShell = new Map<number, number>();
      for (let i = 0; i < numOcc; i++) {
        const s = faceShellId[edgeInfo.occurrences[i].faceIndex];
        if (s >= 0) {
          occByShell.set(s, (occByShell.get(s) || 0) + 1);
        }
      }
      for (const [s, count] of occByShell.entries()) {
        shellEdgeSets[s].add(edgeKey);
        if (count === 1) {
          shellOpenEdgeCounts[s]++;
        }
      }
    }
  }

  return { shellEdgeSets, shellVertexSets, shellOpenEdgeCounts };
}
