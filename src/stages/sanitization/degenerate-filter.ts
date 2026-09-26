// ==============================================================================
// src/stages/sanitization/degenerate-filter.ts — Zero-Area & Coincident Face Filter
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { triangleAreaDirect } from '../../math/index.js';

export interface DegenerateFilterResult {
  cleanIndices: Uint32Array;
  cleanTrianglesCount: number;
  degenerateCount: number;
}

/**
 * Filters out degenerate triangles (coincident vertex indices or area < 1e-9 mm²).
 * Uses a single pre-allocated Uint32Array for zero dynamic array reallocation.
 */
export function filterDegenerateTriangles(mesh: RawMesh): DegenerateFilterResult {
  const numTriangles = mesh.triangleCount;
  // Pre-allocate maximum possible capacity
  const tempIndices = new Uint32Array(numTriangles * 3);
  let writePtr = 0;
  let degenerateCount = 0;

  const positions = mesh.positions;
  const indices = mesh.indices;

  for (let t = 0; t < numTriangles; t++) {
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    // Coincident vertices check
    if (i0 === i1 || i1 === i2 || i2 === i0) {
      degenerateCount++;
      continue;
    }

    // Direct scalar area check
    const area = triangleAreaDirect(positions, i0 * 3, i1 * 3, i2 * 3);
    if (area < 1e-9) {
      degenerateCount++;
      continue;
    }

    tempIndices[writePtr++] = i0;
    tempIndices[writePtr++] = i1;
    tempIndices[writePtr++] = i2;
  }

  // Exact slice for final buffer
  const cleanIndices = tempIndices.subarray(0, writePtr);
  const cleanTrianglesCount = Math.floor(writePtr / 3);

  return {
    cleanIndices,
    cleanTrianglesCount,
    degenerateCount
  };
}
