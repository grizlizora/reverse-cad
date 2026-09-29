// ==============================================================================
// src/capabilities/pcd-geometry-matcher.ts — Robust PCD Orthonormal Basis & Polar Matching
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';

export interface NormalizedHole {
  readonly id: string;
  readonly diameter: number;
  readonly depth: number;
  readonly position: Point3D;
  readonly direction: Vector3D;
  readonly isThreaded: boolean;
  readonly threadSpec?: string;
}

export interface HolePatternCluster {
  type: 'circular_bolt_circle' | 'linear_array' | 'repeated_hole_cluster';
  count: number;
  nominalDiameterMm: number;
  nominalDepthMm: number;
  isThreaded: boolean;
  threadSpec?: string;
  pitchCircleDiameterMm?: number;
  center?: Point3D;
  normalDirection: Vector3D;
  startAngleDeg?: number;
  angularStepDeg?: number;
  isEquispaced?: boolean;
  samplePositions: Point3D[];
  allPositions?: Point3D[];
  compactDsl?: string;
}

export interface OrthonormalBasis2D {
  ux: number; uy: number; uz: number;
  wx: number; wy: number; wz: number;
}

export interface PolarHoleCoord {
  radius: number;
  angleDeg: number;
}

/**
 * Creates robust Gram-Schmidt orthonormal basis (u, w) perpendicular to normDir.
 * Safeguards against collinearity with arbitrary orientation vectors.
 */
export function createRobustOrthonormalBasis(normDir: Vector3D): OrthonormalBasis2D {
  let refX = 1, refY = 0, refZ = 0;
  if (Math.abs(normDir[0]) >= 0.8) {
    refX = 0; refY = 1; refZ = 0;
  }

  const projRef = refX * normDir[0] + refY * normDir[1] + refZ * normDir[2];
  let ux = refX - projRef * normDir[0];
  let uy = refY - projRef * normDir[1];
  let uz = refZ - projRef * normDir[2];
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);

  if (uLen > 1e-12) {
    ux /= uLen; uy /= uLen; uz /= uLen;
  } else {
    ux = 1; uy = 0; uz = 0;
  }

  const wx = normDir[1] * uz - normDir[2] * uy;
  const wy = normDir[2] * ux - normDir[0] * uz;
  const wz = normDir[0] * uy - normDir[1] * ux;

  return { ux, uy, uz, wx, wy, wz };
}

/**
 * Projects hole 3D coordinates onto 2D polar coordinates on pattern plane.
 */
export function projectHolesToPolarCoords(
  holes: NormalizedHole[],
  cx: number, cy: number, cz: number,
  basis: OrthonormalBasis2D
): PolarHoleCoord[] {
  const result: PolarHoleCoord[] = [];
  const { ux, uy, uz, wx, wy, wz } = basis;

  for (let k = 0; k < holes.length; k++) {
    const h = holes[k];
    const dx = h.position[0] - cx;
    const dy = h.position[1] - cy;
    const dz = h.position[2] - cz;

    const uCoord = dx * ux + dy * uy + dz * uz;
    const wCoord = dx * wx + dy * wy + dz * wz;

    const r = Math.sqrt(uCoord * uCoord + wCoord * wCoord);
    let ang = Math.atan2(wCoord, uCoord) * (180 / Math.PI);
    if (ang < 0) ang += 360;

    result.push({ radius: r, angleDeg: ang });
  }

  return result;
}

/**
 * Evaluates whether polar angles form an equispaced circular bolt pattern.
 * Pure loop implementation avoiding Math.max(...spread) call-stack limits.
 */
export function evaluateEquispacedAngles(
  angles: number[],
  toleranceDeg = 4.0
): { isEquispaced: boolean; angularStepDeg: number } {
  const count = angles.length;
  if (count < 3) return { isEquispaced: false, angularStepDeg: 0 };

  const sorted = [...angles].sort((a, b) => a - b);
  const expectedStep = 360 / count;

  for (let k = 0; k < count; k++) {
    const next = (k + 1) % count;
    const diff = next === 0 ? (360 + sorted[0] - sorted[k]) : (sorted[next] - sorted[k]);
    if (Math.abs(diff - expectedStep) > toleranceDeg) {
      return { isEquispaced: false, angularStepDeg: expectedStep };
    }
  }

  return { isEquispaced: true, angularStepDeg: expectedStep };
}

/**
 * Refines bolt pattern center using 2D Kåsa algebraic circle fit.
 * Guarantees accurate center detection for partial arc patterns (e.g. 120°–180° flanges).
 */
export function refinePcdCircleCenter(
  holes: NormalizedHole[],
  meanCx: number,
  meanCy: number,
  meanCz: number,
  basis: OrthonormalBasis2D
): [number, number, number] {
  const n = holes.length;
  if (n < 3) return [meanCx, meanCy, meanCz];

  let sumU = 0, sumW = 0;
  const uCoords = new Float64Array(n);
  const wCoords = new Float64Array(n);

  for (let k = 0; k < n; k++) {
    const dx = holes[k].position[0] - meanCx;
    const dy = holes[k].position[1] - meanCy;
    const dz = holes[k].position[2] - meanCz;
    const u = dx * basis.ux + dy * basis.uy + dz * basis.uz;
    const w = dx * basis.wx + dy * basis.wy + dz * basis.wz;
    uCoords[k] = u;
    wCoords[k] = w;
    sumU += u;
    sumW += w;
  }

  const meanU = sumU / n, meanW = sumW / n;
  let Suu = 0, Sww = 0, Suw = 0, Suz = 0, Swz = 0;
  for (let k = 0; k < n; k++) {
    const u = uCoords[k] - meanU, w = wCoords[k] - meanW;
    const z = u * u + w * w;
    Suu += u * u; Sww += w * w; Suw += u * w;
    Suz += u * z; Swz += w * z;
  }

  const det = Suu * Sww - Suw * Suw;
  if (det > 1e-7) {
    const uc = (Sww * Suz - Suw * Swz) / (2 * det);
    const wc = (Suu * Swz - Suw * Suz) / (2 * det);
    const rFit = Math.sqrt(uc * uc + wc * wc + (Suu + Sww) / n);
    if (rFit >= 1.5 && rFit <= 5000) {
      const refinedU = uc + meanU;
      const refinedW = wc + meanW;
      return [
        meanCx + refinedU * basis.ux + refinedW * basis.wx,
        meanCy + refinedU * basis.uy + refinedW * basis.wy,
        meanCz + refinedU * basis.uz + refinedW * basis.wz
      ];
    }
  }

  return [meanCx, meanCy, meanCz];
}
