// ==============================================================================
// src/stages/segmentation/coaxial-stitcher.ts — Coaxial Cylinder Arc Stitcher
// ==============================================================================

import { RawMesh, CylinderSurface, SurfacePrimitive } from '../../types/geometry.js';
import { computeCylinderAngularMetrics } from './angular-metrics.js';

/**
 * Coaxial Cylinder Arc Stitching Pass (unifies split cylinder arcs into full cylinders).
 */
export function stitchCoaxialCylinders(
  surfaces: SurfacePrimitive[],
  mesh: RawMesh,
  centroids: Float32Array,
  normals: Float32Array
): SurfacePrimitive[] {
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    const cylinders = surfaces.filter((s): s is CylinderSurface => s.type === 'cylinder');

    for (let i = 0; i < cylinders.length; i++) {
      const c1 = cylinders[i];
      if ((c1 as any)._merged) continue;

      for (let j = i + 1; j < cylinders.length; j++) {
        const c2 = cylinders[j];
        if ((c2 as any)._merged) continue;

        // Same internal/external orientation
        if (c1.isInternal !== c2.isInternal) continue;

        // Same radius (< 0.35 mm diff or < 12%)
        const maxRadDiff = Math.max(0.35, Math.min(c1.radius, c2.radius) * 0.12);
        if (Math.abs(c1.radius - c2.radius) > maxRadDiff) continue;

        // Parallel axes |dot(a1, a2)| > 0.98
        const dotA = Math.abs(
          c1.axisDirection[0] * c2.axisDirection[0] +
          c1.axisDirection[1] * c2.axisDirection[1] +
          c1.axisDirection[2] * c2.axisDirection[2]
        );
        if (dotA < 0.98) continue;

        // Perpendicular distance between axis lines
        const u = c1.axisDirection;
        const w = [
          c2.axisOrigin[0] - c1.axisOrigin[0],
          c2.axisOrigin[1] - c1.axisOrigin[1],
          c2.axisOrigin[2] - c1.axisOrigin[2]
        ];
        const proj = w[0] * u[0] + w[1] * u[1] + w[2] * u[2];
        const perpX = w[0] - proj * u[0];
        const perpY = w[1] - proj * u[1];
        const perpZ = w[2] - proj * u[2];
        const perpDist = Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
        const maxPerpDist = Math.max(0.35, Math.min(c1.radius, c2.radius) * 0.12);
        if (perpDist > maxPerpDist) continue;

        // Merge inliers and recompute angular metrics
        const mergedInliers = Array.from(new Set([...c1.inlierIndices, ...c2.inlierIndices]));
        const mergedMetrics = computeCylinderAngularMetrics(
          mesh,
          centroids,
          normals,
          mergedInliers,
          c1.axisOrigin,
          c1.axisDirection
        );

        // If merging improves coverage or completes the cylinder:
        if (mergedMetrics.angularSpanRad > Math.max(c1.angularSpanRad ?? 0, c2.angularSpanRad ?? 0)) {
          c1.inlierIndices = mergedInliers;
          c1.area = c1.area + c2.area;
          c1.angularSpanRad = mergedMetrics.angularSpanRad;
          c1.maxAngularGapRad = mergedMetrics.maxAngularGapRad;
          c1.angularBinCoverage = mergedMetrics.angularBinCoverage;
          c1.subType = mergedMetrics.subType;
          c1.height = Math.max(c1.height, c2.height, mergedMetrics.calculatedHeight);
          (c2 as any)._merged = true;
          mergedAny = true;
          break;
        }
      }
      if (mergedAny) break;
    }

    // Remove merged surfaces
    for (let k = surfaces.length - 1; k >= 0; k--) {
      if ((surfaces[k] as any)._merged) {
        surfaces.splice(k, 1);
      }
    }
  }

  return surfaces;
}
