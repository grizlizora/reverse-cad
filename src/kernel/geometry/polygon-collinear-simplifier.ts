// ==============================================================================
// src/kernel/geometry/polygon-collinear-simplifier.ts — Safe 2D Collinear Reducer
// ==============================================================================

import { isPolygonSimple2D } from './polygon2d-simplicity.js';

/**
 * Safely prunes collinear intermediate vertices from a closed 2D polygon loop
 * relative to the last kept vertex (preventing finely tessellated small circular holes
 * from being erased) with automatic simplicity fallback.
 */
export function simplifyCollinearLoop2D(
  loop: readonly number[],
  coords2D: readonly [number, number][],
  collinearTol: number
): { loop: number[]; coords2D: [number, number][] } {
  const len = loop.length;
  if (len <= 3 || collinearTol <= 0) {
    return { loop: loop.slice(), coords2D: coords2D.slice() };
  }

  const simplifiedLoop: number[] = [];
  const simplifiedCoords: [number, number][] = [];
  let lastKept = coords2D[len - 1];

  for (let i = 0; i < len; i++) {
    const pCurr = coords2D[i];
    const pNext =
      i === len - 1 && simplifiedCoords.length > 0
        ? simplifiedCoords[0]
        : coords2D[(i + 1) % len];

    const dx = pNext[0] - lastKept[0];
    const dy = pNext[1] - lastKept[1];
    const dLen = Math.hypot(dx, dy);

    if (dLen < 1e-9) {
      continue;
    }

    const cross = Math.abs((pCurr[0] - lastKept[0]) * dy - (pCurr[1] - lastKept[1]) * dx) / dLen;
    const dot = ((pCurr[0] - lastKept[0]) * dx + (pCurr[1] - lastKept[1]) * dy) / (dLen * dLen);

    if (cross < collinearTol && dot > 0.0 && dot < 1.0) {
      continue;
    }

    simplifiedLoop.push(loop[i]);
    simplifiedCoords.push(pCurr);
    lastKept = pCurr;
  }

  if (simplifiedLoop.length < 3 || !isPolygonSimple2D(simplifiedCoords)) {
    return { loop: loop.slice(), coords2D: coords2D.slice() };
  }

  return { loop: simplifiedLoop, coords2D: simplifiedCoords };
}
