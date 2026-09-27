// ==============================================================================
// src/rsvs/surface-projections.ts — Analytical CAD Surface Projections & Fast-Path
// ==============================================================================

import {
  Point3D,
  Vector3D,
  SurfacePrimitive,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface
} from '../types/geometry.js';
import { projectPointToTriangle, distancePointToTriangleDirect } from './triangle-projection.js';

export { projectPointToTriangle, distancePointToTriangleDirect };

export interface SurfaceProjectionResult {
  distance: number;
  projectedPoint: Point3D;
  isClampedToEndcap: boolean;
}

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

  return deltaR;
}

/**
 * Pure scalar zero-allocation distance calculation from point (px, py, pz) to conical surface.
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
  const halfAngle = cone.halfAngleRad;
  const coneRadius = Math.max(0, t * Math.tan(halfAngle));

  const dist = Math.abs(rho - coneRadius) * Math.cos(halfAngle);
  return t < 0 ? Math.hypot(dist, -t) : dist;
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

/**
 * Full projection algorithm with closest point coordinate extraction for heatmaps and reporting.
 */
export function projectPointToAnalyticalSurface(
  p: Point3D,
  surface: SurfacePrimitive
): SurfaceProjectionResult {
  switch (surface.type) {
    case 'plane': {
      const pl = surface as PlaneSurface;
      const dx = p[0] - pl.origin[0];
      const dy = p[1] - pl.origin[1];
      const dz = p[2] - pl.origin[2];
      const dist = dx * pl.normal[0] + dy * pl.normal[1] + dz * pl.normal[2];
      return {
        distance: Math.abs(dist),
        projectedPoint: [
          p[0] - dist * pl.normal[0],
          p[1] - dist * pl.normal[1],
          p[2] - dist * pl.normal[2]
        ],
        isClampedToEndcap: false
      };
    }

    case 'cylinder': {
      const cyl = surface as CylinderSurface;
      const ox = cyl.axisOrigin[0], oy = cyl.axisOrigin[1], oz = cyl.axisOrigin[2];
      const ax = cyl.axisDirection[0], ay = cyl.axisDirection[1], az = cyl.axisDirection[2];

      const dx = p[0] - ox;
      const dy = p[1] - oy;
      const dz = p[2] - oz;

      let t = dx * ax + dy * ay + dz * az;
      let isClamped = false;

      let tClamped = t;
      if (cyl.height && cyl.height > 0) {
        const halfH = cyl.height * 0.5;
        if (t > halfH) {
          tClamped = halfH;
          isClamped = true;
        } else if (t < -halfH) {
          tClamped = -halfH;
          isClamped = true;
        }
      }

      const rx = dx - t * ax;
      const ry = dy - t * ay;
      const rz = dz - t * az;
      const rDist = Math.hypot(rx, ry, rz);

      const normRx = rDist > 1e-12 ? rx / rDist : 1.0;
      const normRy = rDist > 1e-12 ? ry / rDist : 0.0;
      const normRz = rDist > 1e-12 ? rz / rDist : 0.0;

      const projX = ox + tClamped * ax + normRx * cyl.radius;
      const projY = oy + tClamped * ay + normRy * cyl.radius;
      const projZ = oz + tClamped * az + normRz * cyl.radius;

      return {
        distance: Math.hypot(p[0] - projX, p[1] - projY, p[2] - projZ),
        projectedPoint: [projX, projY, projZ],
        isClampedToEndcap: isClamped
      };
    }

    case 'cone': {
      const cone = surface as ConeSurface;
      const ox = cone.apex[0], oy = cone.apex[1], oz = cone.apex[2];
      const ax = cone.axisDirection[0], ay = cone.axisDirection[1], az = cone.axisDirection[2];

      const dx = p[0] - ox;
      const dy = p[1] - oy;
      const dz = p[2] - oz;

      const t = Math.max(0, dx * ax + dy * ay + dz * az);
      const rx = dx - t * ax;
      const ry = dy - t * ay;
      const rz = dz - t * az;

      const rDist = Math.hypot(rx, ry, rz);
      const coneRadius = t * Math.tan(cone.halfAngleRad);

      const normRx = rDist > 1e-12 ? rx / rDist : 1.0;
      const normRy = rDist > 1e-12 ? ry / rDist : 0.0;
      const normRz = rDist > 1e-12 ? rz / rDist : 0.0;

      const projX = ox + t * ax + normRx * coneRadius;
      const projY = oy + t * ay + normRy * coneRadius;
      const projZ = oz + t * az + normRz * coneRadius;

      return {
        distance: Math.hypot(p[0] - projX, p[1] - projY, p[2] - projZ),
        projectedPoint: [projX, projY, projZ],
        isClampedToEndcap: false
      };
    }

    case 'torus': {
      const tor = surface as TorusSurface;
      const dist = distancePointToTorus(p[0], p[1], p[2], tor);
      return {
        distance: dist,
        projectedPoint: [p[0], p[1], p[2]],
        isClampedToEndcap: false
      };
    }

    default:
      return {
        distance: 0,
        projectedPoint: p,
        isClampedToEndcap: false
      };
  }
}
