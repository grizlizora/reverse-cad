// ==============================================================================
// src/rsvs/surface-analytic-kernel.ts — High-Speed Scalar Distance Kernel
// ==============================================================================

import {
  SurfacePrimitive,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface
} from '../types/geometry.js';

/**
 * Pure scalar zero-allocation distance calculation from point (px, py, pz) to plane.
 */
export function distancePointToPlane(
  px: number, py: number, pz: number,
  pl: PlaneSurface
): number {
  const dx = px - pl.origin[0];
  const dy = py - pl.origin[1];
  const dz = pz - pl.origin[2];
  return Math.abs(dx * pl.normal[0] + dy * pl.normal[1] + dz * pl.normal[2]);
}

/**
 * Pure scalar zero-allocation distance calculation from point (px, py, pz) to finite or infinite cylinder.
 */
export function distancePointToCylinder(
  px: number, py: number, pz: number,
  cyl: CylinderSurface
): number {
  const ox = cyl.axisOrigin[0], oy = cyl.axisOrigin[1], oz = cyl.axisOrigin[2];
  const ax = cyl.axisDirection[0], ay = cyl.axisDirection[1], az = cyl.axisDirection[2];

  const dx = px - ox;
  const dy = py - oy;
  const dz = pz - oz;

  const t = dx * ax + dy * ay + dz * az;
  const rx = dx - t * ax;
  const ry = dy - t * ay;
  const rz = dz - t * az;

  const rho = Math.hypot(rx, ry, rz);
  const deltaR = Math.abs(rho - cyl.radius);

  if (cyl.height && cyl.height > 0) {
    const halfH = cyl.height * 0.5;
    const deltaZ = Math.max(0, Math.abs(t) - halfH);
    return Math.hypot(deltaR, deltaZ);
  }

  return deltaR;
}

/**
 * Pure scalar zero-allocation distance calculation from point (px, py, pz) to conical surface.
 * Accurately implements Voronoi regions between apex point and conical flank.
 */
export function distancePointToCone(
  px: number, py: number, pz: number,
  cone: ConeSurface
): number {
  const ox = cone.apex[0], oy = cone.apex[1], oz = cone.apex[2];
  const ax = cone.axisDirection[0], ay = cone.axisDirection[1], az = cone.axisDirection[2];

  const dx = px - ox;
  const dy = py - oy;
  const dz = pz - oz;

  const t = dx * ax + dy * ay + dz * az;
  const rx = dx - t * ax;
  const ry = dy - t * ay;
  const rz = dz - t * az;

  const rho = Math.hypot(rx, ry, rz);
  const alpha = cone.halfAngleRad;
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);

  // Meridian generator line parameter: s = t * cos(alpha) + rho * sin(alpha)
  const s = t * cosA + rho * sinA;

  if (s <= 0) {
    // Voronoi Region of Apex: closest point is the apex itself
    return Math.hypot(rho, t);
  }

  // Voronoi Region of Conical Flank: perpendicular distance to generator line
  return Math.abs(rho * cosA - t * sinA);
}

/**
 * Pure scalar zero-allocation distance calculation from point (px, py, pz) to toroidal surface.
 */
export function distancePointToTorus(
  px: number, py: number, pz: number,
  tor: TorusSurface
): number {
  const cx = tor.center[0], cy = tor.center[1], cz = tor.center[2];
  const nx = tor.axisDirection[0], ny = tor.axisDirection[1], nz = tor.axisDirection[2];

  const dx = px - cx;
  const dy = py - cy;
  const dz = pz - cz;

  const t = dx * nx + dy * ny + dz * nz;
  const rx = dx - t * nx;
  const ry = dy - t * ny;
  const rz = dz - t * nz;

  const rho = Math.hypot(rx, ry, rz);
  const distTube = Math.hypot(rho - tor.majorRadius, t);
  return Math.abs(distTube - tor.minorRadius);
}

/**
 * High-speed Zero-Heap Scalar Fast-Path dispatcher for analytical surfaces.
 */
export function distancePointToAnalyticalSurface(
  px: number,
  py: number,
  pz: number,
  surface: SurfacePrimitive
): number {
  switch (surface.type) {
    case 'plane':
      return distancePointToPlane(px, py, pz, surface as PlaneSurface);
    case 'cylinder':
      return distancePointToCylinder(px, py, pz, surface as CylinderSurface);
    case 'cone':
      return distancePointToCone(px, py, pz, surface as ConeSurface);
    case 'torus':
      return distancePointToTorus(px, py, pz, surface as TorusSurface);
    default:
      return 0.0;
  }
}
