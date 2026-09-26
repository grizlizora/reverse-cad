// ==============================================================================
// src/rsvs/triangle-projection.ts — Zero-Allocation Mesh Triangle Projection
// ==============================================================================

import { RawMesh, Point3D } from '../types/geometry.js';
import { sub, norm } from '../math/index.js';

/**
 * David Eberly 3D Point-Triangle Distance Algorithm (Pure Scalar Zero-Allocation Fast-Path).
 * Calculates exact Euclidean distance from point (px, py, pz) to triangle (v0, v1, v2)
 * using 7 Voronoi regions with 0 Heap allocations.
 */
export function distancePointToTriangleDirect(
  px: number, py: number, pz: number,
  v0x: number, v0y: number, v0z: number,
  v1x: number, v1y: number, v1z: number,
  v2x: number, v2y: number, v2z: number
): number {
  const e0x = v1x - v0x;
  const e0y = v1y - v0y;
  const e0z = v1z - v0z;

  const e1x = v2x - v0x;
  const e1y = v2y - v0y;
  const e1z = v2z - v0z;

  const diffx = v0x - px;
  const diffy = v0y - py;
  const diffz = v0z - pz;

  const a00 = e0x * e0x + e0y * e0y + e0z * e0z;
  const a01 = e0x * e1x + e0y * e1y + e0z * e1z;
  const a11 = e1x * e1x + e1y * e1y + e1z * e1z;
  const b0 = diffx * e0x + diffy * e0y + diffz * e0z;
  const b1 = diffx * e1x + diffy * e1y + diffz * e1z;

  const det = Math.max(0, a00 * a11 - a01 * a01);
  let s = a01 * b1 - a11 * b0;
  let t = a01 * b0 - a00 * b1;

  if (s + t <= det) {
    if (s < 0) {
      if (t < 0) {
        // region 4
        if (b0 < 0) {
          t = 0;
          s = -b0 >= a00 ? 1 : -b0 / a00;
        } else {
          s = 0;
          t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
        }
      } else {
        // region 3
        s = 0;
        t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
      }
    } else if (t < 0) {
      // region 5
      t = 0;
      s = -b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00);
    } else {
      // region 0 (interior)
      const invDet = 1.0 / det;
      s *= invDet;
      t *= invDet;
    }
  } else {
    if (s < 0) {
      // region 2
      const tmp0 = a01 + b0;
      const tmp1 = a11 + b1;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        s = numer >= denom ? 1 : numer / denom;
        t = 1 - s;
      } else {
        s = 0;
        t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
      }
    } else if (t < 0) {
      // region 6
      const tmp0 = a01 + b1;
      const tmp1 = a00 + b0;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        t = numer >= denom ? 1 : numer / denom;
        s = 1 - t;
      } else {
        t = 0;
        s = -b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00);
      }
    } else {
      // region 1
      const numer = (a11 + b1) - (a01 + b0);
      if (numer <= 0) {
        s = 0;
        t = 1;
      } else {
        const denom = a00 - 2.0 * a01 + a11;
        s = numer >= denom ? 1 : numer / denom;
        t = 1 - s;
      }
    }
  }

  const closestX = v0x + s * e0x + t * e1x;
  const closestY = v0y + s * e0y + t * e1y;
  const closestZ = v0z + s * e0z + t * e1z;

  const dx = px - closestX;
  const dy = py - closestY;
  const dz = pz - closestZ;

  return Math.hypot(dx, dy, dz);
}

/**
 * Direct scalar distance calculation reading indices and positions buffers directly.
 */
export function distancePointToMeshTriangleDirect(
  px: number,
  py: number,
  pz: number,
  positions: Float32Array,
  indices: Uint32Array,
  triangleIndex: number
): number {
  const t3 = triangleIndex * 3;
  const i0 = indices[t3] * 3;
  const i1 = indices[t3 + 1] * 3;
  const i2 = indices[t3 + 2] * 3;

  return distancePointToTriangleDirect(
    px, py, pz,
    positions[i0], positions[i0 + 1], positions[i0 + 2],
    positions[i1], positions[i1 + 1], positions[i1 + 2],
    positions[i2], positions[i2 + 1], positions[i2 + 2]
  );
}

/**
 * David Eberly 3D Point-Triangle Distance Algorithm with full closest point coordinate extraction.
 */
export function projectPointToTriangle(
  p: Point3D,
  v0: Point3D,
  v1: Point3D,
  v2: Point3D
): { distance: number; closestPoint: Point3D } {
  const e0 = sub(v1, v0);
  const e1 = sub(v2, v0);
  const diff = sub(v0, p);

  const a00 = e0[0] * e0[0] + e0[1] * e0[1] + e0[2] * e0[2];
  const a01 = e0[0] * e1[0] + e0[1] * e1[1] + e0[2] * e1[2];
  const a11 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2];
  const b0 = diff[0] * e0[0] + diff[1] * e0[1] + diff[2] * e0[2];
  const b1 = diff[0] * e1[0] + diff[1] * e1[1] + diff[2] * e1[2];

  const det = Math.max(0, a00 * a11 - a01 * a01);
  let s = a01 * b1 - a11 * b0;
  let t = a01 * b0 - a00 * b1;

  if (s + t <= det) {
    if (s < 0) {
      if (t < 0) {
        if (b0 < 0) {
          t = 0;
          s = -b0 >= a00 ? 1 : -b0 / a00;
        } else {
          s = 0;
          t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
        }
      } else {
        s = 0;
        t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
      }
    } else if (t < 0) {
      t = 0;
      s = -b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00);
    } else {
      const invDet = 1.0 / det;
      s *= invDet;
      t *= invDet;
    }
  } else {
    if (s < 0) {
      const tmp0 = a01 + b0;
      const tmp1 = a11 + b1;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        s = numer >= denom ? 1 : numer / denom;
        t = 1 - s;
      } else {
        s = 0;
        t = -b1 >= a11 ? 1 : (-b1 <= 0 ? 0 : -b1 / a11);
      }
    } else if (t < 0) {
      const tmp0 = a01 + b1;
      const tmp1 = a00 + b0;
      if (tmp1 > tmp0) {
        const numer = tmp1 - tmp0;
        const denom = a00 - 2.0 * a01 + a11;
        t = numer >= denom ? 1 : numer / denom;
        s = 1 - t;
      } else {
        t = 0;
        s = -b0 >= a00 ? 1 : (-b0 <= 0 ? 0 : -b0 / a00);
      }
    } else {
      const numer = (a11 + b1) - (a01 + b0);
      if (numer <= 0) {
        s = 0;
        t = 1;
      } else {
        const denom = a00 - 2.0 * a01 + a11;
        s = numer >= denom ? 1 : numer / denom;
        t = 1 - s;
      }
    }
  }

  const closestPoint: Point3D = [
    v0[0] + s * e0[0] + t * e1[0],
    v0[1] + s * e0[1] + t * e1[1],
    v0[2] + s * e0[2] + t * e1[2]
  ];

  return {
    distance: norm(sub(p, closestPoint)),
    closestPoint
  };
}

/**
 * Backward-compatible helper projecting point onto mesh triangle.
 */
export function projectPointToMeshTriangle(
  pt: Point3D,
  mesh: RawMesh,
  triangleIndex: number
): number {
  return distancePointToMeshTriangleDirect(
    pt[0], pt[1], pt[2],
    mesh.positions,
    mesh.indices,
    triangleIndex
  );
}
