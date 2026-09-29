// ==============================================================================
// src/rsvs/surface-projections.ts — Analytical CAD Surface Projections & Fast-Path
// ==============================================================================

import {
  Point3D,
  SurfacePrimitive,
  PlaneSurface,
  CylinderSurface,
  ConeSurface,
  TorusSurface
} from '../types/geometry.js';

export {
  distancePointToPlane,
  distancePointToCylinder,
  distancePointToCone,
  distancePointToTorus,
  distancePointToAnalyticalSurface
} from './surface-analytic-kernel.js';

export interface SurfaceProjectionResult {
  distance: number;
  projectedPoint: Point3D;
  isClampedToEndcap: boolean;
}

function getPerpendicularUnit(ax: number, ay: number, az: number): [number, number, number] {
  let cx: number, cy: number, cz: number;
  if (Math.abs(ax) < 0.9) {
    cx = 0; cy = az; cz = -ay;
  } else {
    cx = -az; cy = 0; cz = ax;
  }
  const len = Math.hypot(cx, cy, cz);
  return [cx / len, cy / len, cz / len];
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
      const dx = p[0] - pl.origin[0], dy = p[1] - pl.origin[1], dz = p[2] - pl.origin[2];
      const dist = dx * pl.normal[0] + dy * pl.normal[1] + dz * pl.normal[2];
      return {
        distance: Math.abs(dist),
        projectedPoint: [p[0] - dist * pl.normal[0], p[1] - dist * pl.normal[1], p[2] - dist * pl.normal[2]],
        isClampedToEndcap: false
      };
    }

    case 'cylinder': {
      const cyl = surface as CylinderSurface;
      const ox = cyl.axisOrigin[0], oy = cyl.axisOrigin[1], oz = cyl.axisOrigin[2];
      const ax = cyl.axisDirection[0], ay = cyl.axisDirection[1], az = cyl.axisDirection[2];
      const dx = p[0] - ox, dy = p[1] - oy, dz = p[2] - oz;

      let t = dx * ax + dy * ay + dz * az;
      let isClamped = false;
      let tClamped = t;

      if (cyl.height && cyl.height > 0) {
        const halfH = cyl.height * 0.5;
        if (t > halfH) { tClamped = halfH; isClamped = true; }
        else if (t < -halfH) { tClamped = -halfH; isClamped = true; }
      }

      const rx = dx - t * ax, ry = dy - t * ay, rz = dz - t * az;
      const rDist = Math.hypot(rx, ry, rz);
      const [uAx, uAy, uAz] = rDist > 1e-12 ? [rx / rDist, ry / rDist, rz / rDist] : getPerpendicularUnit(ax, ay, az);

      const projX = ox + tClamped * ax + uAx * cyl.radius;
      const projY = oy + tClamped * ay + uAy * cyl.radius;
      const projZ = oz + tClamped * az + uAz * cyl.radius;

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
      const dx = p[0] - ox, dy = p[1] - oy, dz = p[2] - oz;

      const t = dx * ax + dy * ay + dz * az;
      const rx = dx - t * ax, ry = dy - t * ay, rz = dz - t * az;
      const rho = Math.hypot(rx, ry, rz);

      const alpha = cone.halfAngleRad;
      const cosA = Math.cos(alpha), sinA = Math.sin(alpha);
      const s = t * cosA + rho * sinA;

      if (s <= 0) {
        return {
          distance: Math.hypot(p[0] - ox, p[1] - oy, p[2] - oz),
          projectedPoint: [ox, oy, oz],
          isClampedToEndcap: true
        };
      }

      const tProj = s * cosA, rProj = s * sinA;
      const [uAx, uAy, uAz] = rho > 1e-12 ? [rx / rho, ry / rho, rz / rho] : getPerpendicularUnit(ax, ay, az);

      const projX = ox + tProj * ax + uAx * rProj;
      const projY = oy + tProj * ay + uAy * rProj;
      const projZ = oz + tProj * az + uAz * rProj;

      return {
        distance: Math.hypot(p[0] - projX, p[1] - projY, p[2] - projZ),
        projectedPoint: [projX, projY, projZ],
        isClampedToEndcap: false
      };
    }

    case 'torus': {
      const tor = surface as TorusSurface;
      const cx = tor.center[0], cy = tor.center[1], cz = tor.center[2];
      const nx = tor.axisDirection[0], ny = tor.axisDirection[1], nz = tor.axisDirection[2];
      const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;

      const h = dx * nx + dy * ny + dz * nz;
      const rpx = dx - h * nx, rpy = dy - h * ny, rpz = dz - h * nz;
      const rho = Math.hypot(rpx, rpy, rpz);
      const [uAx, uAy, uAz] = rho > 1e-12 ? [rpx / rho, rpy / rho, rpz / rho] : getPerpendicularUnit(nx, ny, nz);

      const ringX = cx + uAx * tor.majorRadius;
      const ringY = cy + uAy * tor.majorRadius;
      const ringZ = cz + uAz * tor.majorRadius;

      const vx = p[0] - ringX, vy = p[1] - ringY, vz = p[2] - ringZ;
      const dTube = Math.hypot(vx, vy, vz);

      const normVx = dTube > 1e-12 ? vx / dTube : nx;
      const normVy = dTube > 1e-12 ? vy / dTube : ny;
      const normVz = dTube > 1e-12 ? vz / dTube : nz;

      const projX = ringX + normVx * tor.minorRadius;
      const projY = ringY + normVy * tor.minorRadius;
      const projZ = ringZ + normVz * tor.minorRadius;

      return {
        distance: Math.hypot(p[0] - projX, p[1] - projY, p[2] - projZ),
        projectedPoint: [projX, projY, projZ],
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
