// ==============================================================================
// src/math/mesh-buffers.ts — Packed Typed-Buffer Geometry & Gauss Divergence Volume
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';
import { sub, cross, norm, normalize, dot } from './vec3.js';

export {
  type MeshGeometryBuffers,
  computeBoundingBox,
  computeMeshGeometryBuffers
} from './mesh-geometry-buffers.js';

export {
  triangleAreaDirect,
  signedTetrahedronVolumeDirect,
  computeShellVolumeAndAreaDirect
} from './mesh-volume-integrator.js';

/**
 * Computes triangle face normal.
 */
export function triangleNormal(p1: Point3D, p2: Point3D, p3: Point3D): Vector3D {
  const edge1 = sub(p2, p1);
  const edge2 = sub(p3, p1);
  return normalize(cross(edge1, edge2));
}

/**
 * Computes triangle surface area.
 */
export function triangleArea(p1: Point3D, p2: Point3D, p3: Point3D): number {
  const edge1 = sub(p2, p1);
  const edge2 = sub(p3, p1);
  return 0.5 * norm(cross(edge1, edge2));
}

/**
 * Computes signed tetrahedron volume via Gauss-Ostrogradsky theorem:
 * V_tet = (p1 x p2) . p3 / 6
 */
export function signedTetrahedronVolume(p1: Point3D, p2: Point3D, p3: Point3D): number {
  return dot(cross(p1, p2), p3) / 6.0;
}
