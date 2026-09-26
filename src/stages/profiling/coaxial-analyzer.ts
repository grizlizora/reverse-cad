// ==============================================================================
// src/stages/profiling/coaxial-analyzer.ts — 1D Axial Interval & Coaxial Alignment
// ==============================================================================

import { Point3D, Vector3D } from '../../types/geometry.js';
import { CADHole, CADThread } from '../../types/features.js';

export interface AxisInterval1D {
  tMin: number;
  tMax: number;
}

/**
 * Checks if two 3D axes are parallel and lie on the same 3D line within radial tolerance.
 */
export function areAxesCoaxial(
  origA: Point3D, dirA: Vector3D,
  origB: Point3D, dirB: Vector3D,
  maxPerpMm = 0.35,
  minAngularDot = 0.985
): boolean {
  const dot = Math.abs(dirA[0] * dirB[0] + dirA[1] * dirB[1] + dirA[2] * dirB[2]);
  if (dot < minAngularDot) return false;

  const dx = origB[0] - origA[0];
  const dy = origB[1] - origA[1];
  const dz = origB[2] - origA[2];

  const proj = dx * dirA[0] + dy * dirA[1] + dz * dirA[2];
  const perpSq = (dx * dx + dy * dy + dz * dz) - proj * proj;
  return Math.sqrt(Math.max(0, perpSq)) <= maxPerpMm;
}

/**
 * Legacy-compatible coaxial feature checker (using wider tolerance for compatibility).
 */
export function isCoaxialFeature(
  origA: Point3D, dirA: Vector3D,
  origB: Point3D, dirB: Vector3D,
  maxPerpMm = 1.8
): boolean {
  const dotA = Math.abs(dirA[0] * dirB[0] + dirA[1] * dirB[1] + dirA[2] * dirB[2]);
  if (dotA < 0.90) return false;
  const dx = origB[0] - origA[0];
  const dy = origB[1] - origA[1];
  const dz = origB[2] - origA[2];
  const proj = dx * dirA[0] + dy * dirA[1] + dz * dirA[2];
  const perpSq = (dx * dx + dy * dy + dz * dz) - proj * proj;
  return Math.sqrt(Math.max(0, perpSq)) <= maxPerpMm;
}

/**
 * Computes the 1D projection interval of a cylinder along its direction axis.
 */
export function computeCylinderAxisInterval(origin: Point3D, direction: Vector3D, height: number): AxisInterval1D {
  return {
    tMin: -height * 0.5,
    tMax: height * 0.5
  };
}

/**
 * Checks if two 1D intervals along the same axis overlap or are contiguous within tolerance.
 */
export function doIntervalsOverlap(
  intA: AxisInterval1D,
  intB: AxisInterval1D,
  gapTolerance = 0.5
): boolean {
  return (intA.tMin <= intB.tMax + gapTolerance) && (intB.tMin <= intA.tMax + gapTolerance);
}

/**
 * Deduplicates threads while strictly preserving both internal and external threads.
 */
export function deduplicateThreads(threads: CADThread[]): CADThread[] {
  const uniqueThreads: CADThread[] = [];

  for (let i = 0; i < threads.length; i++) {
    const t = threads[i];
    const existing = uniqueThreads.find(u =>
      u.isInternal === t.isInternal &&
      areAxesCoaxial(t.axisOrigin, t.axisDirection, u.axisOrigin, u.axisDirection, 0.4, 0.98)
    );

    if (!existing) {
      uniqueThreads.push({ ...t });
    } else {
      existing.threadDepth = Math.max(existing.threadDepth, t.threadDepth);
      if (t.nominalDiameter > existing.nominalDiameter) {
        existing.designation = t.designation;
        existing.nominalDiameter = t.nominalDiameter;
        existing.tapDrillDiameter = t.tapDrillDiameter;
        existing.pitch = t.pitch;
        existing.axisOrigin = t.axisOrigin;
        existing.axisDirection = t.axisDirection;
      }
    }
  }

  return uniqueThreads;
}
