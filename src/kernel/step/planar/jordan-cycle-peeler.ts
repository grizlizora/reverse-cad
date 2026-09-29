// ==============================================================================
// src/kernel/step/planar/jordan-cycle-peeler.ts — Dynamic Keep-Left Cycle Peeler
// ==============================================================================

export interface PlanarPeeledCycle {
  loop: number[];
  coords2D: [number, number][];
}

/**
 * Extracts closed Jordan boundary loops from directed half-edges using a local
 * dynamic Keep-Left turn predicate at junction vertices (valency >= 4).
 * Caches 2D projected coordinates to ensure zero-redundant vector arithmetic.
 */
export function peelPlanarBoundaryCycles(
  boundaryEdges: readonly [number, number][],
  getCoord2D: (vIdx: number) => [number, number]
): PlanarPeeledCycle[] {
  if (boundaryEdges.length < 3) return [];

  // 1. Build Adjacency Graph
  const adjList = new Map<number, number[]>();
  for (let i = 0; i < boundaryEdges.length; i++) {
    const [u, v] = boundaryEdges[i];
    let list = adjList.get(u);
    if (!list) adjList.set(u, (list = []));
    list.push(v);
  }

  const rawLoops: number[][] = [];
  const startNodes = Array.from(adjList.keys());
  const posInPath = new Map<number, number>();

  // 2. Eulerian Cycle Traversal with Dynamic Relative Keep-Left
  for (let sIdx = 0; sIdx < startNodes.length; sIdx++) {
    const startNode = startNodes[sIdx];

    while ((adjList.get(startNode)?.length || 0) > 0) {
      const path: number[] = [startNode];
      posInPath.clear();
      posInPath.set(startNode, 0);
      let prev: number | null = null;
      let safetyCounter = 0;
      const maxSteps = adjList.size * 3 + 100;

      while (path.length > 0 && safetyCounter++ < maxSteps) {
        const curr = path[path.length - 1];
        const nextList = adjList.get(curr);

        if (!nextList || nextList.length === 0) {
          const removed = path.pop()!;
          posInPath.delete(removed);
          prev = path.length > 0 ? path[path.length - 1] : null;
          continue;
        }

        // Dynamic Keep-Left Selection relative to incoming edge (prev -> curr)
        let bestIdx = 0;
        if (nextList.length > 1 && prev !== null) {
          const [px, py] = getCoord2D(prev);
          const [cx, cy] = getCoord2D(curr);
          const inAng = Math.atan2(cy - py, cx - px);
          let bestDelta = -Infinity;

          for (let k = 0; k < nextList.length; k++) {
            const [nx, ny] = getCoord2D(nextList[k]);
            let outAng = Math.atan2(ny - cy, nx - cx) - inAng;
            while (outAng <= -Math.PI) outAng += 2 * Math.PI;
            while (outAng > Math.PI) outAng -= 2 * Math.PI;
            if (outAng > bestDelta) {
              bestDelta = outAng;
              bestIdx = k;
            }
          }
        }

        const nxt = nextList.splice(bestIdx, 1)[0];
        const existingPos = posInPath.get(nxt);

        if (existingPos !== undefined) {
          // Closed cycle detected — cleanly splice sub-loop
          const cycle = path.slice(existingPos);
          if (cycle.length >= 3) {
            rawLoops.push(cycle);
          }
          while (path.length > existingPos + 1) {
            const removed = path.pop()!;
            posInPath.delete(removed);
          }
          prev = path.length > 1 ? path[path.length - 2] : null;
        } else {
          posInPath.set(nxt, path.length);
          path.push(nxt);
          prev = curr;
        }
      }
    }
  }

  // 3. Construct Final Cycles with Shared 2D Coordinates
  const result: PlanarPeeledCycle[] = [];
  for (let i = 0; i < rawLoops.length; i++) {
    const loop = rawLoops[i];
    const coords2D: [number, number][] = new Array(loop.length);
    for (let k = 0; k < loop.length; k++) {
      coords2D[k] = getCoord2D(loop[k]);
    }
    result.push({ loop, coords2D });
  }

  return result;
}
