// ==============================================================================
// src/kernel/step/validation/topology/shell-face-clusterer.ts — Flat BFS Face Clusterer
// Clusters B-Rep faces into connected topological shells with zero heap array allocation.
// ==============================================================================

export interface FaceClusterResult {
  shellFacesLists: number[][];
  faceShellId: Int32Array;
}

/**
 * Clusters faces into connected components via a flat Int32Array pointer-based BFS queue.
 */
export function clusterConnectedFaces(
  faceCount: number,
  faceAdjacency: Map<number, Set<number>>
): FaceClusterResult {
  if (faceCount === 0) {
    return { shellFacesLists: [], faceShellId: new Int32Array(0) };
  }

  const visitedFaces = new Uint8Array(faceCount);
  const faceShellId = new Int32Array(faceCount).fill(-1);
  const shellFacesLists: number[][] = [];

  // Pointer-based flat BFS queue (zero Array.shift() allocations)
  const queue = new Int32Array(faceCount);

  for (let f = 0; f < faceCount; f++) {
    if (visitedFaces[f]) continue;

    const currentShellIndex = shellFacesLists.length;
    const currentShellFaces: number[] = [];
    let head = 0;
    let tail = 0;

    queue[tail++] = f;
    visitedFaces[f] = 1;
    faceShellId[f] = currentShellIndex;

    while (head < tail) {
      const curr = queue[head++];
      currentShellFaces.push(curr);

      const neighbors = faceAdjacency.get(curr);
      if (neighbors) {
        for (const n of neighbors) {
          if (!visitedFaces[n]) {
            visitedFaces[n] = 1;
            faceShellId[n] = currentShellIndex;
            queue[tail++] = n;
          }
        }
      }
    }

    shellFacesLists.push(currentShellFaces);
  }

  return { shellFacesLists, faceShellId };
}
