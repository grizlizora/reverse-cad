// ==============================================================================
// src/rsvs/chordal-bias.ts — Signed Curvature Chordal Bias Volume Integral
// ==============================================================================

import { RawMesh, SurfacePrimitive, CylinderSurface } from '../types/geometry.js';

export interface ChordalCompensationResult {
  rawVolumeMm3: number;
  expectedChordalDiscrepancyMm3: number;
  effectiveVolumeMm3: number;
  curvatureRatio: number; // Ratio of curved surface area to total area
}

/**
 * Calculates signed curvature tensor chordal bias compensation for volume verification.
 * Convex outer faces under-estimate volume, while concave inner bores over-estimate.
 * This prevents naive error cancellation and provides an exact volume check.
 */
export function computeChordalVolumeCompensation(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  measuredVolumeMm3: number
): ChordalCompensationResult {
  let expectedDiscrepancy = 0;
  let curvedArea = 0;
  let totalArea = 0;

  for (const s of surfaces) {
    totalArea += s.area;

    if (s.type === 'cylinder') {
      const cyl = s as CylinderSurface;
      curvedArea += cyl.area;

      // Dynamically estimate facet count N from inlier triangles
      const inliersCount = cyl.inlierIndices ? cyl.inlierIndices.length : 32;
      const estimatedSegments = Math.max(8, Math.min(128, Math.round(inliersCount / 2)));

      // Exact chordal sagitta: delta = r * (1 - cos(pi / N))
      // Discrepancy per unit patch area: (2/3) * delta
      const sagitta = cyl.radius * (1 - Math.cos(Math.PI / estimatedSegments));
      const patchDiscrepancy = cyl.area * (2 / 3) * sagitta;

      // Sign: convex outer faces under-estimate volume (+), concave inner bores over-estimate (-)
      const sign = cyl.isInternal ? -1.0 : 1.0;
      expectedDiscrepancy += sign * patchDiscrepancy;
    }
  }

  const effectiveVolume = measuredVolumeMm3 + expectedDiscrepancy;
  const curvatureRatio = totalArea > 0 ? curvedArea / totalArea : 0;

  return {
    rawVolumeMm3: measuredVolumeMm3,
    expectedChordalDiscrepancyMm3: expectedDiscrepancy,
    effectiveVolumeMm3: effectiveVolume,
    curvatureRatio
  };
}
