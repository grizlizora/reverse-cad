// ==============================================================================
// src/kernel/geometry/polygon-containment-forest.ts — Polygon Containment DAG
// ==============================================================================

import {
  PolygonAABB2D,
  computePolygonAABB2D,
  isAABBContained2D,
  isLoopContainedInOuter2D
} from './polygon2d-primitives.js';

/**
 * Containment Forest resolver: assigns each hole loop strictly to its direct (smallest-area)
 * enclosing outer loop, using O(1) AABB pre-filtering before Ray-Casting.
 * Prevents duplicate hole assignment when an island outer loop is nested inside another outer loop's cutout.
 */
export function assignHolesToEnclosingOuters<
  TOuter extends { coords2D: [number, number][]; area: number },
  THole extends { coords2D: [number, number][]; area: number }
>(
  outers: readonly TOuter[],
  holes: readonly THole[]
): Map<number, THole[]> {
  const result = new Map<number, THole[]>();
  const outerAABBs: PolygonAABB2D[] = new Array(outers.length);
  for (let oIdx = 0; oIdx < outers.length; oIdx++) {
    result.set(oIdx, []);
    outerAABBs[oIdx] = computePolygonAABB2D(outers[oIdx].coords2D);
  }

  for (let hIdx = 0; hIdx < holes.length; hIdx++) {
    const hole = holes[hIdx];
    const holeAbsArea = Math.abs(hole.area);
    const holeAABB = computePolygonAABB2D(hole.coords2D);
    let bestOuterIdx = -1;
    let bestOuterAbsArea = Infinity;

    for (let oIdx = 0; oIdx < outers.length; oIdx++) {
      const outer = outers[oIdx];
      const outerAbsArea = Math.abs(outer.area);
      if (outerAbsArea <= holeAbsArea || outerAbsArea >= bestOuterAbsArea) continue;
      if (!isAABBContained2D(holeAABB, outerAABBs[oIdx])) continue;

      if (isLoopContainedInOuter2D(hole.coords2D, outer.coords2D)) {
        bestOuterAbsArea = outerAbsArea;
        bestOuterIdx = oIdx;
      }
    }

    if (bestOuterIdx !== -1) {
      result.get(bestOuterIdx)!.push(hole);
    }
  }

  return result;
}

export interface ContainmentForestNode<TLoop extends { coords2D: [number, number][]; area: number }> {
  loop: TLoop;
  depth: number; // Even depth (0, 2, 4...) = Outer boundary / Island; Odd depth (1, 3...) = Hole
  parentIndex: number;
  childrenIndices: number[];
}

/**
 * Builds a complete Polygon Containment Forest (DAG) for arbitrary nesting depth
 * (e.g., Outer Plate -> Cutout Hole -> Inner Island -> Island Pin Hole).
 */
export function buildPolygonContainmentForest<
  TLoop extends { coords2D: [number, number][]; area: number }
>(loops: readonly TLoop[]): ContainmentForestNode<TLoop>[] {
  const n = loops.length;
  const aabbs = loops.map(l => computePolygonAABB2D(l.coords2D));
  const absAreas = loops.map(l => Math.abs(l.area));

  const nodes: ContainmentForestNode<TLoop>[] = loops.map(loop => ({
    loop,
    depth: 0,
    parentIndex: -1,
    childrenIndices: []
  }));

  for (let i = 0; i < n; i++) {
    let bestParent = -1;
    let bestParentArea = Infinity;
    let depth = 0;

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (absAreas[j] <= absAreas[i]) continue;
      if (!isAABBContained2D(aabbs[i], aabbs[j])) continue;

      if (isLoopContainedInOuter2D(loops[i].coords2D, loops[j].coords2D)) {
        depth++;
        if (absAreas[j] < bestParentArea) {
          bestParentArea = absAreas[j];
          bestParent = j;
        }
      }
    }

    nodes[i].depth = depth;
    nodes[i].parentIndex = bestParent;
    if (bestParent !== -1) {
      nodes[bestParent].childrenIndices.push(i);
    }
  }

  return nodes;
}
