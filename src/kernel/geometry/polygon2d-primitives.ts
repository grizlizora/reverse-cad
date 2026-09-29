// ==============================================================================
// src/kernel/geometry/polygon2d-primitives.ts — Pure 2D Computational Geometry Primitives
// ==============================================================================

export interface PolygonAABB2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes signed 2D area of a closed polygon loop using the Shoelace (Gauss) formula.
 * Positive (> 0) for counter-clockwise (CCW) winding, negative (< 0) for clockwise (CW).
 */
export function computeSignedArea2D(coords2D: readonly [number, number][]): number {
  const len = coords2D.length;
  if (len < 3) return 0;
  let area2 = 0;
  for (let i = 0; i < len; i++) {
    const [x0, y0] = coords2D[i];
    const [x1, y1] = coords2D[(i + 1) % len];
    area2 += x0 * y1 - x1 * y0;
  }
  return 0.5 * area2;
}

export const computePolygonArea2D = computeSignedArea2D;

/**
 * Computes the 2D Axis-Aligned Bounding Box (AABB) of a polygon loop in O(N) time.
 */
export function computePolygonAABB2D(coords2D: readonly [number, number][]): PolygonAABB2D {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < coords2D.length; i++) {
    const [x, y] = coords2D[i];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Fast O(1) check whether innerAABB lies completely within outerAABB (with tolerance eps).
 */
export function isAABBContained2D(inner: PolygonAABB2D, outer: PolygonAABB2D, eps: number = 1e-5): boolean {
  return (
    inner.minX >= outer.minX - eps &&
    inner.maxX <= outer.maxX + eps &&
    inner.minY >= outer.minY - eps &&
    inner.maxY <= outer.maxY + eps
  );
}

function ccw2D(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax);
}

/**
 * Exact 2D segment-segment intersection predicate (including collinear overlap).
 */
export function segmentsIntersect2D(
  p0x: number, p0y: number, p1x: number, p1y: number,
  p2x: number, p2y: number, p3x: number, p3y: number
): boolean {
  const d1 = ccw2D(p0x, p0y, p1x, p1y, p2x, p2y);
  const d2 = ccw2D(p0x, p0y, p1x, p1y, p3x, p3y);
  const d3 = ccw2D(p2x, p2y, p3x, p3y, p0x, p0y);
  const d4 = ccw2D(p2x, p2y, p3x, p3y, p1x, p1y);

  if (
    ((d1 > 1e-7 && d2 < -1e-7) || (d1 < -1e-7 && d2 > 1e-7)) &&
    ((d3 > 1e-7 && d4 < -1e-7) || (d3 < -1e-7 && d4 > 1e-7))
  ) {
    return true;
  }

  if (Math.abs(d1) <= 1e-7 && Math.abs(d2) <= 1e-7) {
    const minAx = Math.min(p0x, p1x), maxAx = Math.max(p0x, p1x);
    const minAy = Math.min(p0y, p1y), maxAy = Math.max(p0y, p1y);
    const minBx = Math.min(p2x, p3x), maxBx = Math.max(p2x, p3x);
    const minBy = Math.min(p2y, p3y), maxBy = Math.max(p2y, p3y);
    const spanX = Math.max(maxAx - minAx, maxBx - minBx);
    const spanY = Math.max(maxAy - minAy, maxBy - minBy);
    if (spanX >= spanY) {
      if (maxAx > minBx + 1e-6 && minAx < maxBx - 1e-6) return true;
    } else {
      if (maxAy > minBy + 1e-6 && minAy < maxBy - 1e-6) return true;
    }
  }

  return false;
}

/**
 * Even-odd ray-casting point-in-polygon test in 2D.
 */
export function isPointInPolygon2D(
  testX: number,
  testY: number,
  poly: readonly [number, number][]
): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect =
      yi > testY !== yj > testY &&
      testX < ((xj - xi) * (testY - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Tests whether a simple Jordan loop `innerCoords` lies inside `outerCoords` using edge midpoints.
 */
export function isLoopContainedInOuter2D(
  innerCoords: readonly [number, number][],
  outerCoords: readonly [number, number][]
): boolean {
  const n = innerCoords.length;
  if (n === 0 || outerCoords.length < 3) return false;

  const maxChecks = Math.min(n, 3);
  for (let k = 0; k < maxChecks; k++) {
    const [x0, y0] = innerCoords[k];
    const [x1, y1] = innerCoords[(k + 1) % n];
    if (isPointInPolygon2D(0.5 * (x0 + x1), 0.5 * (y0 + y1), outerCoords)) return true;
  }

  const [x0, y0] = innerCoords[0];
  return isPointInPolygon2D(x0, y0, outerCoords);
}

export const isLoopInsidePolygon2D = isLoopContainedInOuter2D;
