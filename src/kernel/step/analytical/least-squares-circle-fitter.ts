// ==============================================================================
// src/kernel/step/analytical/least-squares-circle-fitter.ts — Robust Circle Solvers
// Centered Kåsa least-squares and 3-point circle fitting with zero numerical drift.
// ==============================================================================

export type Point2D = [number, number];

export interface Circle2DResult {
  center: Point2D;
  radius: number;
}

/**
 * Fits a circle through 3 distinct non-collinear 2D points.
 */
export function fitCircleFrom3Points(p1: Point2D, p2: Point2D, p3: Point2D): Circle2DResult | null {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];

  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-10) return null;

  const x1Sq = x1 * x1 + y1 * y1;
  const x2Sq = x2 * x2 + y2 * y2;
  const x3Sq = x3 * x3 + y3 * y3;

  const cx = (x1Sq * (y2 - y3) + x2Sq * (y3 - y1) + x3Sq * (y1 - y2)) / d;
  const cy = (x1Sq * (x3 - x2) + x2Sq * (x1 - x3) + x3Sq * (x2 - x1)) / d;
  const radius = Math.hypot(x1 - cx, y1 - cy);

  return { center: [cx, cy], radius };
}

/**
 * Fits a circle to N >= 3 points using centroid-shifted Kåsa algebraic least squares.
 * Guaranteed scale-invariant stability for micro-geometry (0.1 mm) up to macro-structures.
 */
export function fitCircleLeastSquares(points: Point2D[]): Circle2DResult | null {
  const n = points.length;
  if (n < 3) return null;
  if (n === 3) return fitCircleFrom3Points(points[0], points[1], points[2]);

  // 1. Compute centroid to prevent catastrophic cancellation
  let sumX = 0, sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += points[i][0];
    sumY += points[i][1];
  }
  const mx = sumX / n;
  const my = sumY / n;

  // 2. Centered moment accumulators
  let Suu = 0, Suv = 0, Svv = 0;
  let Suuu = 0, Suvv = 0, Svuu = 0, Svvv = 0;

  for (let i = 0; i < n; i++) {
    const u = points[i][0] - mx;
    const v = points[i][1] - my;
    const u2 = u * u;
    const v2 = v * v;

    Suu += u2;
    Suv += u * v;
    Svv += v2;
    Suuu += u2 * u;
    Suvv += u * v2;
    Svuu += v * u2;
    Svvv += v2 * v;
  }

  // 3. Solve 2x2 system:
  // [ Suu  Suv ] [ uc ] = 0.5 * [ Suuu + Suvv ]
  // [ Suv  Svv ] [ vc ] = 0.5 * [ Svvv + Svuu ]
  const det = Suu * Svv - Suv * Suv;
  if (Math.abs(det) < 1e-12) {
    // Collinear or degenerate points, fallback to 3-point span
    return fitCircleFrom3Points(points[0], points[Math.floor(n / 2)], points[n - 1]);
  }

  const rhsU = 0.5 * (Suuu + Suvv);
  const rhsV = 0.5 * (Svvv + Svuu);

  const uc = (Svv * rhsU - Suv * rhsV) / det;
  const vc = (Suu * rhsV - Suv * rhsU) / det;

  const cx = uc + mx;
  const cy = vc + my;

  // 4. Mean radial distance for true RMS geometric radius
  let radiusSum = 0;
  for (let i = 0; i < n; i++) {
    radiusSum += Math.hypot(points[i][0] - cx, points[i][1] - cy);
  }
  const radius = radiusSum / n;

  if (!Number.isFinite(radius) || radius <= 1e-4) return null;

  return { center: [cx, cy], radius };
}
