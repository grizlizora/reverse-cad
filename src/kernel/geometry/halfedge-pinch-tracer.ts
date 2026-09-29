// ==============================================================================
// src/kernel/geometry/halfedge-pinch-tracer.ts — 53-Bit Half-Edge & Keep-Left Tracer
// ==============================================================================

const VERTEX_SHIFT = 67108864; // 2^26 (exact 53-bit IEEE-754 safe integer packing, 0 BigInt allocations)

/**
 * Cancels compensated internal half-edges across a triangle cluster and returns
 * the directed boundary adjacency map (u -> outgoing boundary vertices v[]).
 */
export function extractBoundaryHalfEdgeAdjacency(
  triangles: readonly number[],
  indices: Uint32Array
): Map<number, number[]> {
  const edgeMap = new Map<number, number>();
  for (let i = 0; i < triangles.length; i++) {
    const t3 = triangles[i] * 3;
    const v0 = indices[t3];
    const v1 = indices[t3 + 1];
    const v2 = indices[t3 + 2];

    const e01 = v0 * VERTEX_SHIFT + v1;
    const e12 = v1 * VERTEX_SHIFT + v2;
    const e20 = v2 * VERTEX_SHIFT + v0;

    edgeMap.set(e01, (edgeMap.get(e01) || 0) + 1);
    edgeMap.set(e12, (edgeMap.get(e12) || 0) + 1);
    edgeMap.set(e20, (edgeMap.get(e20) || 0) + 1);
  }

  const adj = new Map<number, number[]>();
  for (const [edgeKey, count] of edgeMap.entries()) {
    if (count !== 1) continue;
    const u = Math.floor(edgeKey / VERTEX_SHIFT);
    const v = edgeKey % VERTEX_SHIFT;
    if (!edgeMap.has(v * VERTEX_SHIFT + u)) {
      let list = adj.get(u);
      if (!list) {
        list = [];
        adj.set(u, list);
      }
      list.push(v);
    }
  }

  return adj;
}

/**
 * Traces closed simple Jordan loops from a boundary half-edge adjacency map,
 * resolving pinch-point vertices (valency >= 4) via Keep-Left relative angular turn
 * and cleanly peeling closed sub-cycles without breaking the outer prefix path.
 */
export function traceKeepLeftJordanCycles2D(
  adj: Map<number, number[]>,
  getCoord2D: (vIdx: number) => [number, number]
): number[][] {
  const rawLoops: number[][] = [];
  const startNodes = Array.from(adj.keys());

  for (let s = 0; s < startNodes.length; s++) {
    const startNode = startNodes[s];
    while ((adj.get(startNode)?.length || 0) > 0) {
      const cycle: number[] = [];
      const posInCycle = new Map<number, number>();
      let curr: number | undefined = startNode;
      let prev: number | null = null;
      let safetyCounter = 0;
      const maxSteps = adj.size * 3 + 100;

      while (curr !== undefined && safetyCounter++ < maxSteps) {
        if (posInCycle.has(curr)) {
          const firstIdx = posInCycle.get(curr)!;
          const subLoop = cycle.splice(firstIdx);
          for (let k = 0; k < subLoop.length; k++) {
            posInCycle.delete(subLoop[k]);
          }
          if (subLoop.length >= 3) {
            rawLoops.push(subLoop);
          }
          if (cycle.length === 0) break;
          // Keep curr at the pinch vertex where subLoop closed; update prev to tip of prefix
          prev = cycle[cycle.length - 1];
        }

        posInCycle.set(curr, cycle.length);
        cycle.push(curr);

        const nextList = adj.get(curr);
        if (!nextList || nextList.length === 0) break;

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

        const nextNode = nextList.splice(bestIdx, 1)[0];
        prev = curr;
        curr = nextNode;
      }

      if (cycle.length >= 3) {
        rawLoops.push(cycle);
      }
    }
  }

  return rawLoops;
}
