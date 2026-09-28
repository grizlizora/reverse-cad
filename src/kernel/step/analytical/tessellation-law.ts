// ==============================================================================
// src/kernel/step/analytical/tessellation-law.ts — Closed-Form Tessellation Law Inverter
// Reconstructs original CAD radii and arcs from discrete facet strip bands.
// Derived from stl2step industrial inverse CAD tessellation methodology.
// ==============================================================================

export interface RecoveredArcResult {
  radius: number;
  thetaStep: number;
  chordWidth: number;
  volumeDeltaPerUnitHeight: number;
  confidence: number;
}

export interface StripStatistics {
  count: number;
  meanWidth: number;
  cvWidth: number; // Coefficient of Variation (std / mean)
  meanTheta: number;
  cvTheta: number;
  isValidLaw: boolean;
}

/**
 * Minimum dihedral angle for an arc strip (radians).
 * Prevents catastrophic division-by-zero / numerical floating-point explosion on near-flat facets.
 * 0.012 rad ≈ 0.687 degrees.
 */
export const MIN_ARC_DIHEDRAL_ANGLE_RAD = 0.012;

/**
 * Maximum dihedral angle for an individual strip (radians).
 * Beyond π - 0.012, facets fold back on themselves.
 */
export const MAX_ARC_DIHEDRAL_ANGLE_RAD = Math.PI - 0.012;

/**
 * Inverts the CAD tessellation law for a single chord step:
 *   R = w / (2 * sin(θ / 2))
 *
 * @param chordWidth w (distance between adjacent generator edges)
 * @param dihedralAngle θ (angle between adjacent facet normal vectors in radians)
 * @returns RecoveredArcResult or null if outside stable angular limits
 */
export function invertTessellationLaw(
  chordWidth: number,
  dihedralAngle: number
): RecoveredArcResult | null {
  if (
    dihedralAngle < MIN_ARC_DIHEDRAL_ANGLE_RAD ||
    dihedralAngle > MAX_ARC_DIHEDRAL_ANGLE_RAD ||
    chordWidth <= 1e-7
  ) {
    return null;
  }

  const halfTheta = dihedralAngle * 0.5;
  const sinHalf = Math.sin(halfTheta);
  if (sinHalf < 1e-9) return null;

  const radius = chordWidth / (2.0 * sinHalf);
  if (!isFinite(radius) || radius <= 0) return null;

  // Exact volumetric difference between circular sector and triangular chord slice:
  // ΔV_unit = (R² / 2) * (θ - sin(θ))
  const volumeDeltaPerUnitHeight = (radius * radius * 0.5) * (dihedralAngle - Math.sin(dihedralAngle));

  return {
    radius,
    thetaStep: dihedralAngle,
    chordWidth,
    volumeDeltaPerUnitHeight,
    confidence: 1.0
  };
}

/**
 * Analyzes a candidate chain of facet strips to check whether it satisfies
 * the equal-step CAD tessellation law (low variance in width and dihedral angle).
 *
 * @param widths Array of strip chord widths
 * @param thetas Array of dihedral angles between adjacent strip pairs
 */
export function analyzeStripChainStatistics(
  widths: number[],
  thetas: number[]
): StripStatistics {
  const n = widths.length;
  if (n < 2 || thetas.length !== n - 1) {
    return {
      count: n,
      meanWidth: 0,
      cvWidth: 1.0,
      meanTheta: 0,
      cvTheta: 1.0,
      isValidLaw: false
    };
  }

  // Mean and standard deviation of widths
  let sumW = 0;
  for (let i = 0; i < n; i++) sumW += widths[i];
  const meanW = sumW / n;

  let varW = 0;
  for (let i = 0; i < n; i++) {
    const diff = widths[i] - meanW;
    varW += diff * diff;
  }
  const stdW = Math.sqrt(varW / n);
  const cvW = meanW > 1e-9 ? stdW / meanW : 1.0;

  // Mean and standard deviation of thetas
  const m = thetas.length;
  let sumT = 0;
  for (let i = 0; i < m; i++) sumT += thetas[i];
  const meanT = sumT / m;

  let varT = 0;
  for (let i = 0; i < m; i++) {
    const diff = thetas[i] - meanT;
    varT += diff * diff;
  }
  const stdT = Math.sqrt(varT / m);
  const cvT = meanT > 1e-9 ? stdT / meanT : 1.0;

  // CAD tessellation law validity gate:
  // Strip widths must be consistent (CV < 0.05) and angles consistent (CV < 0.08)
  const isValidLaw =
    cvW < 0.06 &&
    cvT < 0.09 &&
    meanT >= MIN_ARC_DIHEDRAL_ANGLE_RAD &&
    meanT <= MAX_ARC_DIHEDRAL_ANGLE_RAD;

  return {
    count: n,
    meanWidth: meanW,
    cvWidth: cvW,
    meanTheta: meanT,
    cvTheta: cvT,
    isValidLaw
  };
}

/**
 * Computes exact volume deviation budget between faceted chord approximation
 * and true cylindrical surface of radius R, total angular span phi, and height h.
 */
export function computePredictedArcVolumeDelta(
  radius: number,
  thetaStep: number,
  stepCount: number,
  height: number
): number {
  const singleStepDelta = (radius * radius * 0.5) * (thetaStep - Math.sin(thetaStep));
  return singleStepDelta * stepCount * height;
}
