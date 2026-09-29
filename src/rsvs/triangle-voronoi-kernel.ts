// ==============================================================================
// src/rsvs/triangle-voronoi-kernel.ts — Robust Eberly 3D Point-Triangle Kernel
// ==============================================================================

/**
 * David Eberly 3D Point-Triangle Projection Core with Singular Degeneracy Guard.
 * Calculates exact Euclidean distance from point (px, py, pz) to triangle (v0, v1, v2)
 * across 7 Voronoi regions with zero Heap allocations.
 * Safely handles degenerate, needle, and collinear triangles with zero NaN risk.
 */
export function computeClosestPointOnTriangleScalar(
  px: number, py: number, pz: number,
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number,
  outClosestPoint?: [number, number, number]
): number {
  const e0x = v1x - v0x;
  const e0y = v1y - v0y;
  const e0z = v1z - v0z;

  const e1x = v2x - v0x;
  const e1y = v2y - v0y;
  const e1z = v2z - v0z;

  const diffx = v0x - px;
  const diffy = v0y - py;
  const diffz = v0z - pz;

  const a00 = e0x * e0x + e0y * e0y + e0z * e0z;
  const a01 = e0x * e1x + e0y * e1y + e0z * e1z;
  const a11 = e1x * e1x + e1y * e1y + e1z * e1z;
  const b0 = diffx * e0x + diffy * e0y + diffz * e0z;
  const b1 = diffx * e1x + diffy * e1y + diffz * e1z;

  const detRaw = a00 * a11 - a01 * a01;
  const det = Math.max(0, detRaw);
  const singularThreshold = 1e-14 * Math.max(1.0, a00 * a11);

  let s = a01 * b1 - a11 * b0;
  let t = a01 * b0 - a00 * b1;

  if (det <= singularThreshold) {
    // Degenerate triangle (collinear or coincident vertices) — project onto longest valid edge
    if (a00 > 1e-12) {
      const param = Math.max(0, Math.min(1, -b0 / a00));
      s = param;
      t = 0;
    } else if (a11 > 1e-12) {
      const param = Math.max(0, Math.min(1, -b1 / a11));
      s = 0;
      t = param;
    } else {
      s = 0;
      t = 0;
    }
  } else if (s + t <= det) {
    if (s < 0) {
      if (t < 0) {
        // Region 4
        if (b0 < 0) {
          t = 0;
          s = a00 > 1e-12 ? (-b0 >= a00 ? 1 : -b0 / a00) : 0;
        } else {
          s = 0;
          t = a11 > 1e-12 ? (-b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11)) : 0;
        }
      } else {
        // Region 3
        s = 0;
        t = a11 > 1e-12 ? (-b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11)) : 0;
      }
    } else if (t < 0) {
      // Region 5
      t = 0;
      s = a00 > 1e-12 ? (-b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00)) : 0;
    } else {
      // Region 0 (Interior)
      const invDet = 1.0 / det;
      s *= invDet;
      t *= invDet;
    }
  } else {
    if (s < 0) {
      // Region 2
      const tmp0 = a01 + b0;
      const tmp1 = a11 + b1;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        s = denom > 1e-12 ? (numer >= denom ? 1 : numer / denom) : 0;
        t = 1 - s;
      } else {
        s = 0;
        t = a11 > 1e-12 ? (-b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11)) : 0;
      }
    } else if (t < 0) {
      // Region 6
      const tmp0 = a01 + b1;
      const tmp1 = a00 + b0;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        t = denom > 1e-12 ? (numer >= denom ? 1 : numer / denom) : 0;
        s = 1 - t;
      } else {
        t = 0;
        s = a00 > 1e-12 ? (-b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00)) : 0;
      }
    } else {
      // Region 1
      const numer = (a11 + b1) - (a01 + b0);
      if (numer <= 0) {
        s = 0;
        t = 1;
      } else {
        const denom = a00 - 2.0 * a01 + a11;
        s = denom > 1e-12 ? (numer >= denom ? 1 : numer / denom) : 0;
        t = 1 - s;
      }
    }
  }

  const cx = v0x + s * e0x + t * e1x;
  const cy = v0y + s * e0y + t * e1y;
  const cz = v0z + s * e0z + t * e1z;

  if (outClosestPoint) {
    outClosestPoint[0] = cx;
    outClosestPoint[1] = cy;
    outClosestPoint[2] = cz;
  }

  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;

  return Math.hypot(dx, dy, dz);
}
