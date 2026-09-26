// ==============================================================================
// src/stages/profiling/counterbore-detector.ts — Step-Face & Counterbore Analysis
// ==============================================================================

import { CylinderSurface, Point3D, Vector3D } from '../../types/geometry.js';
import { CADHole, CADThread } from '../../types/features.js';
import { matchMetricThread, matchTappedHolePair } from '../../standards/thread-catalog.js';

export interface CounterboreMatchResult {
  isCounterbore: boolean;
  mainBore?: CylinderSurface;
  counterBore?: CylinderSurface;
  counterboreDiameter?: number;
  counterboreDepth?: number;
  totalDepth?: number;
}

/**
 * Evaluates whether a pair of coaxial cylinders forms a counterbore or countersink according to DIN 74 / ISO 4762.
 */
export function evaluateCounterborePair(
  c1: CylinderSurface,
  c2: CylinderSurface,
  axialProjectionDistance: number
): CounterboreMatchResult {
  const [smaller, larger] = c1.radius < c2.radius ? [c1, c2] : [c2, c1];
  const diaSmaller = smaller.radius * 2.0;
  const diaLarger = larger.radius * 2.0;
  const radDiff = larger.radius - smaller.radius;

  // Diameter ratio for standard socket head fasteners (DIN 74, ISO 4762) is typically 1.35x - 2.2x
  const ratio = diaLarger / Math.max(0.1, diaSmaller);
  const isValidRatio = ratio >= 1.30 && ratio <= 2.50;

  // Minimum physical depth for counterbore shoulder:
  // Support small M2/M2.5/M3 fasteners where radDiff >= 0.5mm and height >= 1.0mm
  const isDepthValid = smaller.height >= 1.0 && larger.height >= 1.0;
  const isRadValid = radDiff >= 0.50;

  if (isValidRatio && isDepthValid && isRadValid) {
    const totalDepth = smaller.height + larger.height;
    return {
      isCounterbore: true,
      mainBore: smaller,
      counterBore: larger,
      counterboreDiameter: parseFloat((larger.radius * 2.0).toFixed(2)),
      counterboreDepth: parseFloat(larger.height.toFixed(2)),
      totalDepth: parseFloat(totalDepth.toFixed(2))
    };
  }

  // Fallback to proportional difference if heights differ significantly
  if (radDiff >= 0.8 && (smaller.height < larger.height * 0.75 || larger.height < smaller.height * 0.75)) {
    const totalDepth = smaller.height + larger.height;
    return {
      isCounterbore: true,
      mainBore: smaller,
      counterBore: larger,
      counterboreDiameter: parseFloat((larger.radius * 2.0).toFixed(2)),
      counterboreDepth: parseFloat(larger.height.toFixed(2)),
      totalDepth: parseFloat(totalDepth.toFixed(2))
    };
  }

  return { isCounterbore: false };
}
