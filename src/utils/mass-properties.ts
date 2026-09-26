// ==============================================================================
// src/utils/mass-properties.ts — Analytical Polyhedral Mass Properties (Mirtich 1996)
// ==============================================================================

import { RawMesh, Point3D } from '../types/geometry.js';

export interface PolyhedralMassProperties {
  volumeMm3: number;
  surfaceAreaMm2: number;
  centerOfMass: Point3D;
  inertiaTensor: {
    Ixx: number;
    Iyy: number;
    Izz: number;
    Ixy: number;
    Iyz: number;
    Izx: number;
  };
  principalMoments: [number, number, number];
  estimatedMinWallThicknessMm: number;
}

/**
 * Computes exact analytical volume, center of mass, and moments of inertia
 * for a closed triangular manifold solid using the divergence theorem (Mirtich 1996).
 * Runs in O(N) with zero heap object allocations in the hot integration loop.
 */
export function computePolyhedralMassProperties(mesh: RawMesh): PolyhedralMassProperties {
  const positions = mesh.positions;
  const indices = mesh.indices;
  const triangleCount = mesh.triangleCount;

  if (triangleCount === 0) {
    return {
      volumeMm3: 0,
      surfaceAreaMm2: 0,
      centerOfMass: [0, 0, 0],
      inertiaTensor: { Ixx: 0, Iyy: 0, Izz: 0, Ixy: 0, Iyz: 0, Izx: 0 },
      principalMoments: [0, 0, 0],
      estimatedMinWallThicknessMm: 0.8
    };
  }

  // Anchor vertex (first vertex of mesh) to avoid floating-point cancellation
  const ax = positions[0], ay = positions[1], az = positions[2];

  let totalArea = 0;
  let int1 = 0;
  let intx = 0, inty = 0, intz = 0;
  let intx2 = 0, inty2 = 0, intz2 = 0;
  let intxy = 0, intyz = 0, intzx = 0;

  for (let t = 0; t < triangleCount; t++) {
    const t3 = t * 3;
    const i0 = indices[t3] * 3;
    const i1 = indices[t3 + 1] * 3;
    const i2 = indices[t3 + 2] * 3;

    // Shift coordinates relative to anchor
    const x0 = positions[i0] - ax, y0 = positions[i0 + 1] - ay, z0 = positions[i0 + 2] - az;
    const x1 = positions[i1] - ax, y1 = positions[i1 + 1] - ay, z1 = positions[i1 + 2] - az;
    const x2 = positions[i2] - ax, y2 = positions[i2 + 1] - ay, z2 = positions[i2 + 2] - az;

    // Normal cross product: e1 x e2
    const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
    const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    const area2 = Math.sqrt(nx * nx + ny * ny + nz * nz);
    totalArea += 0.5 * area2;

    // Determinant of tetrahedron: (x0 . (x1 x x2))
    const det = x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2);

    int1 += det;

    // First moments
    const sx = x0 + x1 + x2;
    const sy = y0 + y1 + y2;
    const sz = z0 + z1 + z2;
    intx += det * sx;
    inty += det * sy;
    intz += det * sz;

    // Second moments (Gauss divergence over tetrahedron)
    intx2 += det * (x0 * x0 + x1 * x1 + x2 * x2 + sx * sx);
    inty2 += det * (y0 * y0 + y1 * y1 + y2 * y2 + sy * sy);
    intz2 += det * (z0 * z0 + z1 * z1 + z2 * z2 + sz * sz);

    intxy += det * (x0 * y0 + x1 * y1 + x2 * y2 + sx * sy);
    intyz += det * (y0 * z0 + y1 * z1 + y2 * z2 + sy * sz);
    intzx += det * (z0 * x0 + z1 * x1 + z2 * x2 + sz * sx);
  }

  const vol = int1 / 6.0;
  const absVol = Math.abs(vol) > 1e-12 ? Math.abs(vol) : 1e-12;
  const sign = vol < 0 ? -1 : 1;

  // Center of Mass relative to origin
  const cmX = ax + (sign * intx) / (24.0 * absVol);
  const cmY = ay + (sign * inty) / (24.0 * absVol);
  const cmZ = az + (sign * intz) / (24.0 * absVol);

  // Moments of inertia relative to Center of Mass
  const relX = cmX - ax;
  const relY = cmY - ay;
  const relZ = cmZ - az;

  // Integral of squared coordinates about origin
  const Ixx0 = (sign * (inty2 + intz2)) / 60.0;
  const Iyy0 = (sign * (intx2 + intz2)) / 60.0;
  const Izz0 = (sign * (intx2 + inty2)) / 60.0;
  const Ixy0 = (sign * intxy) / 60.0;
  const Iyz0 = (sign * intyz) / 60.0;
  const Izx0 = (sign * intzx) / 60.0;

  // Parallel axis theorem to shift to Center of Mass
  const Ixx = Math.max(0, Ixx0 - absVol * (relY * relY + relZ * relZ));
  const Iyy = Math.max(0, Iyy0 - absVol * (relX * relX + relZ * relZ));
  const Izz = Math.max(0, Izz0 - absVol * (relX * relX + relY * relY));
  const Ixy = Ixy0 - absVol * relX * relY;
  const Iyz = Iyz0 - absVol * relY * relZ;
  const Izx = Izx0 - absVol * relZ * relX;

  // Principal moments approximation via trace & invariants
  const p1 = Math.max(Ixx, Iyy, Izz);
  const p3 = Math.min(Ixx, Iyy, Izz);
  const p2 = Math.max(0, Ixx + Iyy + Izz - p1 - p3);

  // Approximate minimum wall thickness via bounding dimensions and volume ratio
  const b = mesh.boundingBox.dimensions;
  const minDim = Math.min(b[0], b[1], b[2]);
  const estimatedMinWallThicknessMm = Math.max(0.6, Math.min(minDim * 0.25, (2.0 * absVol) / Math.max(1.0, totalArea)));

  return {
    volumeMm3: parseFloat(absVol.toFixed(4)),
    surfaceAreaMm2: parseFloat(totalArea.toFixed(4)),
    centerOfMass: [
      parseFloat(cmX.toFixed(4)),
      parseFloat(cmY.toFixed(4)),
      parseFloat(cmZ.toFixed(4))
    ],
    inertiaTensor: {
      Ixx: parseFloat(Ixx.toFixed(2)),
      Iyy: parseFloat(Iyy.toFixed(2)),
      Izz: parseFloat(Izz.toFixed(2)),
      Ixy: parseFloat(Ixy.toFixed(2)),
      Iyz: parseFloat(Iyz.toFixed(2)),
      Izx: parseFloat(Izx.toFixed(2))
    },
    principalMoments: [
      parseFloat(p1.toFixed(2)),
      parseFloat(p2.toFixed(2)),
      parseFloat(p3.toFixed(2))
    ],
    estimatedMinWallThicknessMm: parseFloat(estimatedMinWallThicknessMm.toFixed(4))
  };
}
