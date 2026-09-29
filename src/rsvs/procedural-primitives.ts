// ==============================================================================
// src/rsvs/procedural-primitives.ts — Procedural Box Meshes & Multi-Shell Assembler
// ==============================================================================

import { RawMesh, BoundingBox3D } from '../types/geometry.js';
import { computeBoundingBox } from '../utils/math3d.js';

/**
 * Procedural Box generator with inward/outward normal orientation.
 */
export function generateBoxMesh(
  w: number,
  d: number,
  h: number,
  offset: [number, number, number],
  invert: boolean
): RawMesh {
  const x0 = offset[0], y0 = offset[1], z0 = offset[2];
  const x1 = x0 + w, y1 = y0 + d, z1 = z0 + h;

  const posArray = new Float32Array([
    x0, y0, z0,
    x1, y0, z0,
    x1, y1, z0,
    x0, y1, z0,
    x0, y0, z1,
    x1, y0, z1,
    x1, y1, z1,
    x0, y1, z1
  ]);

  const quads = [
    [0, 3, 2, 1], // Bottom (-Z)
    [4, 5, 6, 7], // Top (+Z)
    [0, 1, 5, 4], // Front (-Y)
    [1, 2, 6, 5], // Right (+X)
    [2, 3, 7, 6], // Back (+Y)
    [3, 0, 4, 7]  // Left (-X)
  ];

  const indArray = new Uint32Array(36);
  let iPtr = 0;
  for (let k = 0; k < quads.length; k++) {
    const q = quads[k];
    if (!invert) {
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[1]; indArray[iPtr++] = q[2];
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[2]; indArray[iPtr++] = q[3];
    } else {
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[2]; indArray[iPtr++] = q[1];
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[3]; indArray[iPtr++] = q[2];
    }
  }

  return {
    positions: posArray,
    indices: indArray,
    vertexCount: 8,
    triangleCount: 12,
    boundingBox: computeBoundingBox(posArray)
  };
}

/**
 * Combines two meshes with O(1) instantaneous BoundingBox merger.
 */
export function mergeMeshes(m1: RawMesh, m2: RawMesh): RawMesh {
  const totalPos = new Float32Array(m1.positions.length + m2.positions.length);
  totalPos.set(m1.positions, 0);
  totalPos.set(m2.positions, m1.positions.length);

  const vOffset = m1.vertexCount;
  const totalIndices = new Uint32Array(m1.indices.length + m2.indices.length);
  totalIndices.set(m1.indices, 0);
  for (let i = 0; i < m2.indices.length; i++) {
    totalIndices[m1.indices.length + i] = m2.indices[i] + vOffset;
  }

  const b1 = m1.boundingBox;
  const b2 = m2.boundingBox;
  const minX = Math.min(b1.min[0], b2.min[0]);
  const minY = Math.min(b1.min[1], b2.min[1]);
  const minZ = Math.min(b1.min[2], b2.min[2]);
  const maxX = Math.max(b1.max[0], b2.max[0]);
  const maxY = Math.max(b1.max[1], b2.max[1]);
  const maxZ = Math.max(b1.max[2], b2.max[2]);
  const dimX = maxX - minX, dimY = maxY - minY, dimZ = maxZ - minZ;

  const mergedBox: BoundingBox3D = {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    dimensions: [dimX, dimY, dimZ],
    center: [minX + dimX * 0.5, minY + dimY * 0.5, minZ + dimZ * 0.5],
    diagonal: Math.sqrt(dimX * dimX + dimY * dimY + dimZ * dimZ)
  };

  return {
    positions: totalPos,
    indices: totalIndices,
    vertexCount: totalPos.length / 3,
    triangleCount: totalIndices.length / 3,
    boundingBox: mergedBox
  };
}

/**
 * Procedural Model 2: Subsurface Internal Labyrinth / Cavity
 */
export function generateInternalLabyrinthModel(): RawMesh {
  const outer = generateBoxMesh(50, 50, 30, [0, 0, 0], false);
  const inner = generateBoxMesh(30, 30, 15, [10, 10, 7.5], true);
  return mergeMeshes(outer, inner);
}

/**
 * Procedural Model 3: Print-in-Place Hinge with known 0.35 mm clearance
 */
export function generatePrintInPlaceHingeModel(): RawMesh {
  const clearance = 0.35;
  const link1 = generateBoxMesh(20, 15, 10, [0, 0, 0], false);
  const link2 = generateBoxMesh(20, 15, 10, [20 + clearance, 0, 0], false);
  return mergeMeshes(link1, link2);
}
