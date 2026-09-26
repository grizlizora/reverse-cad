// ==============================================================================
// src/stages/segmentation/plane-feature-validator.ts — Minor Plane Quality Gate
// ==============================================================================

/**
 * Validates whether a candidate planar cluster is a true flat mechanical face
 * or a spurious tangent strip on a curved surface (conical chamfer, cylinder, thread).
 * 
 * Rejection criteria:
 * 1. Low compactness (planeArea / diag² < 0.015): Rejects scattered dust across multiple holes.
 * 2. High normal deviation (max > 1.0° or RMS > 0.6°): Rejects curved tangent strips.
 * 3. High distance residual (mean > 0.02 mm): Rejects non-planar surface patches.
 */
export function validateMinorPlaneQuality(
  inliers: number[],
  planeArea: number,
  rOx: number,
  rOy: number,
  rOz: number,
  rNx: number,
  rNy: number,
  rNz: number,
  centroids: Float32Array,
  normals: Float32Array
): boolean {
  if (inliers.length < 3) return false;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let maxAngDev = 0;
  let totalDevSq = 0;
  let totalDistResid = 0;

  for (let k = 0; k < inliers.length; k++) {
    const t = inliers[k];
    const t3 = t * 3;
    const cx = centroids[t3], cy = centroids[t3 + 1], cz = centroids[t3 + 2];
    if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
    if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;

    const dotNorm = normals[t3] * rNx + normals[t3 + 1] * rNy + normals[t3 + 2] * rNz;
    const clampedDot = Math.max(-1.0, Math.min(1.0, dotNorm));
    const angDev = Math.acos(clampedDot);
    if (angDev > maxAngDev) maxAngDev = angDev;
    totalDevSq += angDev * angDev;

    const dPlane = Math.abs((cx - rOx) * rNx + (cy - rOy) * rNy + (cz - rOz) * rNz);
    totalDistResid += dPlane;
  }

  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  const compactness = planeArea / Math.max(1e-4, diag * diag);
  const rmsAngularDevDeg = (Math.sqrt(totalDevSq / inliers.length) * 180.0) / Math.PI;
  const maxAngularDevDeg = (maxAngDev * 180.0) / Math.PI;
  const meanDistResidMm = totalDistResid / inliers.length;

  // 1. Spatial compactness: reject scattered tangent dust across multiple holes
  if (compactness < 0.015) return false;

  // 2. Normal flatness: reject tangent strips on curved cylinders, cones, and helical threads
  if (maxAngularDevDeg > 1.0 || rmsAngularDevDeg > 0.6 || meanDistResidMm > 0.02) {
    return false;
  }

  return true;
}
