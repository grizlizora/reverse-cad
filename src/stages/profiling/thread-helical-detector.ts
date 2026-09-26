// ==============================================================================
// src/stages/profiling/thread-helical-detector.ts — Helical & Catalog Thread Detection
// ==============================================================================

import { RawMesh, CylinderSurface } from '../../types/geometry.js';
import { matchMetricThread, matchTappedHolePair } from '../../standards/thread-catalog.js';

export interface HelicalDetectionResult {
  standard: 'ISO_METRIC';
  designation: string;
  nominalDiameter: number;
  pitch: number;
  tapDrillDiameter: number;
  flankNormalRms: number;
  radialDeltaMm: number;
}

/**
 * Mathematically examines surface normals and radial deviations of mesh triangles
 * in a cylinder to detect genuine 3D-modeled helical thread ridges and grooves.
 */
export function detectHelicalThread(
  mesh: RawMesh,
  cyl: CylinderSurface
): HelicalDetectionResult | null {
  const inliers = cyl.inlierIndices;
  if (!inliers || inliers.length < 20) return null;

  const ax = cyl.axisDirection[0], ay = cyl.axisDirection[1], az = cyl.axisDirection[2];
  const positions = mesh.positions;
  const indices = mesh.indices;

  // Re-center transverse axis origin to the true inlier centroid to eliminate RANSAC seed eccentricity
  let meanX = 0, meanY = 0, meanZ = 0;
  for (let i = 0; i < inliers.length; i++) {
    const t3 = inliers[i] * 3;
    const i0 = indices[t3] * 3;
    const i1 = indices[t3 + 1] * 3;
    const i2 = indices[t3 + 2] * 3;
    meanX += (positions[i0] + positions[i1] + positions[i2]) / 3;
    meanY += (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3;
    meanZ += (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3;
  }
  const ox = meanX / inliers.length;
  const oy = meanY / inliers.length;
  const oz = meanZ / inliers.length;

  let sumAxialSq = 0;
  let rMin = Infinity;
  let rMax = -Infinity;

  for (let i = 0; i < inliers.length; i++) {
    const t = inliers[i];
    const t3 = t * 3;
    const i0 = indices[t3] * 3;
    const i1 = indices[t3 + 1] * 3;
    const i2 = indices[t3 + 2] * 3;

    // Normal calculation
    const e1x = positions[i1] - positions[i0];
    const e1y = positions[i1 + 1] - positions[i0 + 1];
    const e1z = positions[i1 + 2] - positions[i0 + 2];

    const e2x = positions[i2] - positions[i0];
    const e2y = positions[i2 + 1] - positions[i0 + 1];
    const e2z = positions[i2 + 2] - positions[i0 + 2];

    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (len > 1e-12) {
      const dotA = (cx * ax + cy * ay + cz * az) / len;
      sumAxialSq += dotA * dotA;
    }

    // Radial distances from axis
    for (let v = 0; v < 3; v++) {
      const vi = indices[t3 + v] * 3;
      const dx = positions[vi] - ox;
      const dy = positions[vi + 1] - oy;
      const dz = positions[vi + 2] - oz;
      const proj = dx * ax + dy * ay + dz * az;
      const rx = dx - proj * ax;
      const ry = dy - proj * ay;
      const rz = dz - proj * az;
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
    }
  }

  const flankNormalRms = Math.sqrt(sumAxialSq / inliers.length);
  const radialDeltaMm = rMax > rMin ? rMax - rMin : 0;

  // On smooth cylinders, flankNormalRms < 0.015 and radialDeltaMm < 0.20 mm.
  // On 60-deg metric threads, flankNormalRms >= 0.040 and radialDeltaMm >= 0.20 mm.
  if (flankNormalRms < 0.040 || radialDeltaMm < 0.20) {
    return null; // Smooth cylinder — definitively not a helical thread
  }

  const diaMin = rMin * 2.0;
  const diaMax = rMax * 2.0;
  const match = matchTappedHolePair(diaMin, diaMax, 1.35) ||
                matchMetricThread(diaMin, cyl.isInternal, 0.45) ||
                matchMetricThread(diaMax, cyl.isInternal, 0.45) ||
                matchMetricThread(cyl.radius * 2.0, cyl.isInternal, 0.45);
  if (match) {
    return {
      standard: 'ISO_METRIC',
      designation: match.designation,
      nominalDiameter: match.nominalDiameter,
      pitch: match.pitch,
      tapDrillDiameter: match.tapDrillDiameter,
      flankNormalRms,
      radialDeltaMm
    };
  }

  return null;
}
