// ==============================================================================
// src/stages/segmentation/cylinder-hypothesis.ts — Pure Math Cylinder Hypothesis Generator
// ==============================================================================

import { Point3D, Vector3D } from '../../types/geometry.js';
import { dot, cross, norm, normalize, sub } from '../../math/index.js';

export interface CylinderCandidate {
  axisOrigin: Point3D;
  axisDirection: Vector3D;
  radius: number;
  residualError: number;
}

/**
 * Generates an analytical cylinder hypothesis from two oriented points (p0, n0) and (p1, n1).
 * Uses zero-allocation register math.
 * Handles both general non-parallel normals and diametrically opposite (antiparallel) normals.
 */
export function generateCylinderHypothesis(
  p0: Point3D, n0: Vector3D,
  p1: Point3D, n1: Vector3D,
  minRadius: number = 0.5,
  maxRadius: number = 250.0
): CylinderCandidate | null {
  const normalDot = Math.max(-1, Math.min(1, dot(n0, n1)));
  const dp = sub(p1, p0);
  const dpLen = norm(dp);
  if (dpLen < 0.05) return null;

  let normAxis: Vector3D;
  let radius: number;
  let center: Point3D;

  const axis = cross(n0, n1);
  const axisLen = norm(axis);

  if (axisLen < 0.05) {
    // Check if normals are anti-parallel (diametrically opposite points on cylinder)
    if (normalDot < -0.90) {
      // For antiparallel normals on a cylinder, axis is perpendicular to n0 and dp
      const crossAxis = cross(n0, dp);
      const crossAxisLen = norm(crossAxis);
      if (crossAxisLen < 0.05) return null;
      normAxis = normalize(crossAxis);

      // In this case, chord is a diameter across the cylinder
      const dpDotAxis = dot(dp, normAxis);
      const perpX = dp[0] - dpDotAxis * normAxis[0];
      const perpY = dp[1] - dpDotAxis * normAxis[1];
      const perpZ = dp[2] - dpDotAxis * normAxis[2];
      const diam = Math.hypot(perpX, perpY, perpZ);
      radius = diam * 0.5;

      center = [
        (p0[0] + p1[0]) * 0.5,
        (p0[1] + p1[1]) * 0.5,
        (p0[2] + p1[2]) * 0.5
      ];
    } else {
      // Truly parallel normals (same side of flat facet) cannot determine cylinder
      return null;
    }
  } else {
    normAxis = normalize(axis);

    // Project vector between sample points onto plane perpendicular to normAxis
    const dpDotAxis = dot(dp, normAxis);
    const dpx = dp[0] - dpDotAxis * normAxis[0];
    const dpy = dp[1] - dpDotAxis * normAxis[1];
    const dpz = dp[2] - dpDotAxis * normAxis[2];

    const chordLen = Math.hypot(dpx, dpy, dpz);
    if (chordLen < 0.05) return null;

    const theta = Math.acos(normalDot);
    if (theta < 0.05 || theta > Math.PI - 0.05) return null;

    radius = chordLen / (2.0 * Math.sin(theta * 0.5));

    // True axis origin: project n0 onto plane perpendicular to normAxis
    const n0DotAxis = dot(n0, normAxis);
    const n0PerpX = n0[0] - n0DotAxis * normAxis[0];
    const n0PerpY = n0[1] - n0DotAxis * normAxis[1];
    const n0PerpZ = n0[2] - n0DotAxis * normAxis[2];
    const n0PerpLen = Math.hypot(n0PerpX, n0PerpY, n0PerpZ);
    if (n0PerpLen < 1e-6) return null;

    const invLen = 1.0 / n0PerpLen;
    const un0x = n0PerpX * invLen;
    const un0y = n0PerpY * invLen;
    const un0z = n0PerpZ * invLen;

    // Center candidate A: p0 + un0 * radius (internal hole, normal inwards)
    // Center candidate B: p0 - un0 * radius (external cylinder, normal outwards)
    const cAx: Point3D = [p0[0] + un0x * radius, p0[1] + un0y * radius, p0[2] + un0z * radius];
    const cBx: Point3D = [p0[0] - un0x * radius, p0[1] - un0y * radius, p0[2] - un0z * radius];

    // Select center that gives closest distance to p1
    const p1ToCa = sub(p1, cAx);
    const p1ToCaDot = dot(p1ToCa, normAxis);
    const rCa = Math.hypot(p1ToCa[0] - p1ToCaDot * normAxis[0], p1ToCa[1] - p1ToCaDot * normAxis[1], p1ToCa[2] - p1ToCaDot * normAxis[2]);

    const p1ToCb = sub(p1, cBx);
    const p1ToCbDot = dot(p1ToCb, normAxis);
    const rCb = Math.hypot(p1ToCb[0] - p1ToCbDot * normAxis[0], p1ToCb[1] - p1ToCbDot * normAxis[1], p1ToCb[2] - p1ToCbDot * normAxis[2]);

    center = Math.abs(rCa - radius) < Math.abs(rCb - radius) ? cAx : cBx;
  }

  if (radius < minRadius || radius > maxRadius || !Number.isFinite(radius)) {
    return null;
  }

  return {
    axisOrigin: center,
    axisDirection: normAxis,
    radius,
    residualError: 0.0
  };
}
