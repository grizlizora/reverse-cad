// ==============================================================================
// src/rsvs/triangle-projection.ts — Zero-Allocation Mesh Triangle Projection
// ==============================================================================

import { RawMesh, Point3D } from '../types/geometry.js';
import { computeClosestPointOnTriangleScalar } from './triangle-voronoi-kernel.js';

export { computeClosestPointOnTriangleScalar } from './triangle-voronoi-kernel.js';

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
  return computeClosestPointOnTriangleScalar(
    px, py, pz,
    v0x, v0y, v0z,
    v1x, v1y, v1z,
    v2x, v2y, v2z
  );
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

  return computeClosestPointOnTriangleScalar(
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
  const closestPoint: Point3D = [0, 0, 0];
  const dist = computeClosestPointOnTriangleScalar(
    p[0], p[1], p[2],
    v0[0], v0[1], v0[2],
    v1[0], v1[1], v1[2],
    v2[0], v2[1], v2[2],
    closestPoint
  );

  return {
    distance: dist,
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
