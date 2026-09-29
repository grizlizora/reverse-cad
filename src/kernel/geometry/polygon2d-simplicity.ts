// ==============================================================================
// src/kernel/geometry/polygon2d-simplicity.ts — Accelerated Jordan Simplicity Check
// ==============================================================================

import { segmentsIntersect2D } from './polygon2d-primitives.js';

export interface PolygonSimplicityOptions {
  degeneracyToleranceSq?: number; // default: 1e-12
  hairpinThreshold?: number;       // default: 0.998001 (~177.4 deg)
  boxEpsilon?: number;             // default: 1e-7
}

/**
 * Validates whether a closed 2D polygon is a simple Jordan curve (no self-intersections,
 * no zero-length edges, and no hairpin reversals).
 * Uses flat Float64Array AABB pre-filtering to eliminate 95%+ of segment cross-product checks.
 */
export function isPolygonSimple2D(
  coords2D: readonly [number, number][],
  options: PolygonSimplicityOptions = {}
): boolean {
  const n = coords2D.length;
  if (n < 3) return false;

  const tolSq = options.degeneracyToleranceSq ?? 1e-12;
  const hairpinCosSq = options.hairpinThreshold ?? 0.998001;
  const boxEps = options.boxEpsilon ?? 1e-7;

  // 1. O(N) Local Geometry Check: Degenerate edges & Sharp Hairpins
  for (let i = 0; i < n; i++) {
    const [x0, y0] = coords2D[i];
    const [x1, y1] = coords2D[(i + 1) % n];
    const [x2, y2] = coords2D[(i + 2) % n];

    const d10x = x1 - x0, d10y = y1 - y0;
    const lenSq10 = d10x * d10x + d10y * d10y;
    if (lenSq10 < tolSq) return false;

    const d21x = x2 - x1, d21y = y2 - y1;
    const lenSq21 = d21x * d21x + d21y * d21y;
    if (lenSq21 < tolSq) return false;

    const dot = d10x * d21x + d10y * d21y;
    if (dot < 0 && dot * dot > hairpinCosSq * lenSq10 * lenSq21) return false;
  }

  // 2. Precompute Flat Segment Bounding Boxes: [minX, minY, maxX, maxY]
  const aabbs = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [x0, y0] = coords2D[i];
    const [x1, y1] = coords2D[(i + 1) % n];
    const o = i * 4;
    aabbs[o]     = (x0 < x1 ? x0 : x1) - boxEps;
    aabbs[o + 1] = (y0 < y1 ? y0 : y1) - boxEps;
    aabbs[o + 2] = (x0 > x1 ? x0 : x1) + boxEps;
    aabbs[o + 3] = (y0 > y1 ? y0 : y1) + boxEps;
  }

  // 3. Double-loop with Fast O(1) Bounding-Box Rejection
  for (let i = 0; i < n; i++) {
    const [a1x, a1y] = coords2D[i];
    const [a2x, a2y] = coords2D[(i + 1) % n];
    const oA = i * 4;
    const minAx = aabbs[oA], minAy = aabbs[oA + 1];
    const maxAx = aabbs[oA + 2], maxAy = aabbs[oA + 3];

    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;

      const oB = j * 4;
      // Fast AABB Overlap Rejection (4 scalar comparisons)
      if (minAx > aabbs[oB + 2] || maxAx < aabbs[oB] ||
          minAy > aabbs[oB + 3] || maxAy < aabbs[oB + 1]) {
        continue;
      }

      const [b1x, b1y] = coords2D[j];
      const [b2x, b2y] = coords2D[(j + 1) % n];

      if (segmentsIntersect2D(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y)) {
        return false;
      }
    }
  }

  return true;
}
