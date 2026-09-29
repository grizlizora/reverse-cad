// ==============================================================================
// src/math/mesh-geometry-buffers.ts — Packed Typed Geometry Buffers & AABB
// ==============================================================================

import { BoundingBox3D } from '../types/geometry.js';

export interface MeshGeometryBuffers {
  normals: Float32Array;   // 3 * triangleCount
  centroids: Float32Array; // 3 * triangleCount
  areas: Float32Array;     // triangleCount
}

/**
 * Computes Bounding Box for an array of positions (Float32Array [x,y,z, x,y,z, ...])
 */
export function computeBoundingBox(positions: Float32Array): BoundingBox3D {
  if (positions.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      dimensions: [0, 0, 0],
      center: [0, 0, 0],
      diagonal: 0
    };
  }

  let minX = positions[0], minY = positions[1], minZ = positions[2];
  let maxX = positions[0], maxY = positions[1], maxZ = positions[2];

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];

    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const dimX = maxX - minX;
  const dimY = maxY - minY;
  const dimZ = maxZ - minZ;

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    dimensions: [dimX, dimY, dimZ],
    center: [minX + dimX * 0.5, minY + dimY * 0.5, minZ + dimZ * 0.5],
    diagonal: Math.sqrt(dimX * dimX + dimY * dimY + dimZ * dimZ)
  };
}

/**
 * Computes triangle normals, centroids, and areas in a single zero-allocation contiguous pass.
 */
export function computeMeshGeometryBuffers(
  positions: Float32Array,
  indices: Uint32Array,
  triangleCount: number
): MeshGeometryBuffers {
  const normals = new Float32Array(triangleCount * 3);
  const centroids = new Float32Array(triangleCount * 3);
  const areas = new Float32Array(triangleCount);

  for (let t = 0; t < triangleCount; t++) {
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
    const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
    const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];

    // Centroid
    const t3 = t * 3;
    centroids[t3] = (p0x + p1x + p2x) / 3.0;
    centroids[t3 + 1] = (p0y + p1y + p2y) / 3.0;
    centroids[t3 + 2] = (p0z + p1z + p2z) / 3.0;

    // Edge vectors: e1 = p1 - p0, e2 = p2 - p0
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

    // Cross product
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
    areas[t] = 0.5 * len;

    if (len > 1e-12) {
      normals[t3] = cx / len;
      normals[t3 + 1] = cy / len;
      normals[t3 + 2] = cz / len;
    } else {
      normals[t3] = 0;
      normals[t3 + 1] = 0;
      normals[t3 + 2] = 1;
    }
  }

  return { normals, centroids, areas };
}
