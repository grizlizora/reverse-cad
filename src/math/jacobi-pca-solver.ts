// ==============================================================================
// src/math/jacobi-pca-solver.ts — Scale-Invariant Cyclic Jacobi Eigensolver (PCA)
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';

export interface PlaneFitResult {
  origin: Point3D;
  normal: Vector3D;
  curvature?: number;
}

/**
 * Robust, scale-invariant Cyclic Jacobi Eigensolver for 3x3 symmetric covariance matrix.
 * Finds the eigenvector corresponding to the MINIMUM eigenvalue (true plane normal).
 * Uses relative epsilon (epsRel = 1e-12 * trace) to guarantee convergence on micro-geometry
 * and large coordinate frames with zero trigonometric edge-case failures.
 */
export function fitPlanePCA(
  centroids: Float32Array,
  inliers: number[]
): PlaneFitResult {
  const n = inliers.length;
  if (n === 0) return { origin: [0, 0, 0], normal: [0, 0, 1], curvature: 0 };
  if (n === 1) {
    const idx = inliers[0] * 3;
    return { origin: [centroids[idx], centroids[idx + 1], centroids[idx + 2]], normal: [0, 0, 1], curvature: 0 };
  }

  let meanX = 0, meanY = 0, meanZ = 0;
  for (let i = 0; i < n; i++) {
    const idx = inliers[i] * 3;
    meanX += centroids[idx];
    meanY += centroids[idx + 1];
    meanZ += centroids[idx + 2];
  }
  meanX /= n;
  meanY /= n;
  meanZ /= n;

  let cxx = 0, cxy = 0, cxz = 0;
  let cyy = 0, cyz = 0, czz = 0;

  for (let i = 0; i < n; i++) {
    const idx = inliers[i] * 3;
    const dx = centroids[idx] - meanX;
    const dy = centroids[idx + 1] - meanY;
    const dz = centroids[idx + 2] - meanZ;
    cxx += dx * dx;
    cxy += dx * dy;
    cxz += dx * dz;
    cyy += dy * dy;
    cyz += dy * dz;
    czz += dz * dz;
  }

  cxx /= n; cxy /= n; cxz /= n;
  cyy /= n; cyz /= n; czz /= n;

  const trace = cxx + cyy + czz;
  if (trace < 1e-15) {
    return { origin: [meanX, meanY, meanZ], normal: [0, 0, 1], curvature: 0 };
  }

  // Eigenvector matrix V (columns)
  let v00 = 1, v01 = 0, v02 = 0;
  let v10 = 0, v11 = 1, v12 = 0;
  let v20 = 0, v21 = 0, v22 = 1;

  let d00 = cxx, d01 = cxy, d02 = cxz;
  let d10 = cxy, d11 = cyy, d12 = cyz;
  let d20 = cxz, d21 = cyz, d22 = czz;

  // Relative threshold to eliminate scale dependency
  const relEps = Math.max(1e-13 * trace, 1e-15);

  for (let sweep = 0; sweep < 20; sweep++) {
    const offDiag = Math.abs(d01) + Math.abs(d02) + Math.abs(d12);
    if (offDiag <= relEps) break;

    // Pair (0, 1)
    if (Math.abs(d01) > relEps * 0.1) {
      const theta = 0.5 * Math.atan2(2 * d01, d11 - d00);
      const c = Math.cos(theta), s = Math.sin(theta);
      const newD00 = c * c * d00 - 2 * s * c * d01 + s * s * d11;
      const newD11 = s * s * d00 + 2 * s * c * d01 + c * c * d11;
      d00 = newD00; d11 = newD11; d01 = 0; d10 = 0;
      const newD02 = c * d02 - s * d12;
      const newD12 = s * d02 + c * d12;
      d02 = newD02; d20 = newD02; d12 = newD12; d21 = newD12;
      const newV00 = c * v00 - s * v01; const newV01 = s * v00 + c * v01;
      const newV10 = c * v10 - s * v11; const newV11 = s * v10 + c * v11;
      const newV20 = c * v20 - s * v21; const newV21 = s * v20 + c * v21;
      v00 = newV00; v01 = newV01; v10 = newV10; v11 = newV11; v20 = newV20; v21 = newV21;
    }

    // Pair (0, 2)
    if (Math.abs(d02) > relEps * 0.1) {
      const theta = 0.5 * Math.atan2(2 * d02, d22 - d00);
      const c = Math.cos(theta), s = Math.sin(theta);
      const newD00 = c * c * d00 - 2 * s * c * d02 + s * s * d22;
      const newD22 = s * s * d00 + 2 * s * c * d02 + c * c * d22;
      d00 = newD00; d22 = newD22; d02 = 0; d20 = 0;
      const newD01 = c * d01 - s * d21;
      const newD21 = s * d01 + c * d21;
      d01 = newD01; d10 = newD01; d21 = newD21; d12 = newD21;
      const newV00 = c * v00 - s * v02; const newV02 = s * v00 + c * v02;
      const newV10 = c * v10 - s * v12; const newV12 = s * v10 + c * v12;
      const newV20 = c * v20 - s * v22; const newV22 = s * v20 + c * v22;
      v00 = newV00; v02 = newV02; v10 = newV10; v12 = newV12; v20 = newV20; v22 = newV22;
    }

    // Pair (1, 2)
    if (Math.abs(d12) > relEps * 0.1) {
      const theta = 0.5 * Math.atan2(2 * d12, d22 - d11);
      const c = Math.cos(theta), s = Math.sin(theta);
      const newD11 = c * c * d11 - 2 * s * c * d12 + s * s * d22;
      const newD22 = s * s * d11 + 2 * s * c * d12 + c * c * d22;
      d11 = newD11; d22 = newD22; d12 = 0; d21 = 0;
      const newD10 = c * d10 - s * d20;
      const newD20 = s * d10 + c * d20;
      d10 = newD10; d01 = newD10; d20 = newD20; d02 = newD20;
      const newV01 = c * v01 - s * v02; const newV02 = s * v01 + c * v02;
      const newV11 = c * v11 - s * v12; const newV12 = s * v11 + c * v12;
      const newV21 = c * v21 - s * v22; const newV22 = s * v21 + c * v22;
      v01 = newV01; v02 = newV02; v11 = newV11; v12 = newV12; v21 = newV21; v22 = newV22;
    }
  }

  // Find column corresponding to minimum eigenvalue
  let minCol = 0;
  let minVal = d00;
  if (d11 < minVal) { minVal = d11; minCol = 1; }
  if (d22 < minVal) { minVal = d22; minCol = 2; }

  let nx = minCol === 0 ? v00 : minCol === 1 ? v01 : v02;
  let ny = minCol === 0 ? v10 : minCol === 1 ? v11 : v12;
  let nz = minCol === 0 ? v20 : minCol === 1 ? v21 : v22;

  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  if (len > 1e-12) {
    nx /= len; ny /= len; nz /= len;
  } else {
    nx = 0; ny = 0; nz = 1;
  }

  const curvature = Math.max(0, minVal) / (trace || 1.0);

  return {
    origin: [meanX, meanY, meanZ],
    normal: [nx, ny, nz],
    curvature
  };
}
