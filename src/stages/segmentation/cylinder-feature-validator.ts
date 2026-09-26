// ==============================================================================
// src/stages/segmentation/cylinder-feature-validator.ts — Cylinder Feature Rules
// ==============================================================================

import { RawMesh, Vector3D, Point3D } from '../../types/geometry.js';
import { CylinderAngularMetrics } from './angular-metrics.js';

export interface CylinderValidationResult {
  isValid: boolean;
  isOrthogonalAxis: boolean;
}

/**
 * Validates whether a detected cylinder candidate meets genuine engineering feature criteria
 * (e.g. valid hole, fillet, or orthogonal functional cylinder).
 */
export function validateCylinderFeature(
  metrics: CylinderAngularMetrics,
  axisDir: Vector3D
): CylinderValidationResult {
  const isOrthogonalAxis =
    Math.abs(axisDir[0]) > 0.90 ||
    Math.abs(axisDir[1]) > 0.90 ||
    Math.abs(axisDir[2]) > 0.90;

  // Helical thread detection: 60-degree V-threads have flankNormalRms >= 0.040 (typically 0.055-0.082)
  // whereas true cylinders have flankNormalRms <= 0.010.
  // Reject helical threads from cylinder segmentation to preserve crisp planar facets in STEP AP242.
  if (metrics.flankNormalRms > 0.035) {
    return { isValid: false, isOrthogonalAxis };
  }

  const isGenuineHole =
    metrics.angularSpanRad >= (180 * Math.PI / 180) &&
    metrics.angularBinCoverage >= 0.45 &&
    metrics.areaDensity >= 0.40;

  const isGenuineFillet =
    metrics.subType === 'fillet' &&
    metrics.angularSpanRad >= (40 * Math.PI / 180) &&
    metrics.angularSpanRad <= (140 * Math.PI / 180) &&
    metrics.areaDensity >= 0.20;

  if (!isGenuineHole && !isGenuineFillet) {
    return { isValid: false, isOrthogonalAxis };
  }

  if (!isOrthogonalAxis && metrics.angularSpanRad < (270 * Math.PI / 180)) {
    return { isValid: false, isOrthogonalAxis };
  }

  return { isValid: true, isOrthogonalAxis };
}

/**
 * Prunes cylinder inliers that deviate radially or axially before STEP generation.
 */
export function pruneCylinderInliers(
  mesh: RawMesh,
  inliers: number[],
  axisOrigin: Point3D,
  axisDir: Vector3D,
  radius: number,
  radialTol: number = 0.35
): number[] {
  const validInliers: number[] = [];
  const positions = mesh.positions;
  const indices = mesh.indices;

  for (let i = 0; i < inliers.length; i++) {
    const t = inliers[i];
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    // Centroid of triangle
    const cx = (positions[i0] + positions[i1] + positions[i2]) / 3.0;
    const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3.0;
    const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3.0;

    const dx = cx - axisOrigin[0];
    const dy = cy - axisOrigin[1];
    const dz = cz - axisOrigin[2];
    const proj = dx * axisDir[0] + dy * axisDir[1] + dz * axisDir[2];

    const perpX = dx - proj * axisDir[0];
    const perpY = dy - proj * axisDir[1];
    const perpZ = dz - proj * axisDir[2];
    const dist = Math.hypot(perpX, perpY, perpZ);

    if (Math.abs(dist - radius) <= radialTol) {
      validInliers.push(t);
    }
  }

  return validInliers.length >= 8 ? validInliers : inliers;
}
