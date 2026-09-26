// ==============================================================================
// src/stages/intake/spatial-indexer.ts — Zero-Allocation Spatial Vertex Welder
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { computeBoundingBox } from '../../utils/math3d.js';

/**
 * Builds indexed topology from a soup of triangle vertices using a zero-allocation
 * flat integer spatial hash table (Teschner-style open chaining).
 */
export function indexRawPositions(rawPositions: Float32Array, tolerance: number): RawMesh {
  const totalVertices = Math.floor(rawPositions.length / 3);
  const totalTriangles = Math.floor(totalVertices / 3);

  if (totalVertices === 0) {
    return {
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      vertexCount: 0,
      triangleCount: 0,
      boundingBox: computeBoundingBox(new Float32Array(0))
    };
  }

  const invTol = 1.0 / Math.max(tolerance, 1e-12);

  // Power-of-two table size matching vertex count order of magnitude
  const tableCapacity = Math.max(1024, Math.min(1 << 22, 1 << (32 - Math.clz32(totalVertices * 2))));
  const mask = tableCapacity - 1;

  const head = new Int32Array(tableCapacity).fill(-1);
  const next = new Int32Array(totalVertices);
  const qxArr = new Int32Array(totalVertices);
  const qyArr = new Int32Array(totalVertices);
  const qzArr = new Int32Array(totalVertices);

  const uniquePositions = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalVertices);

  let uniqueCount = 0;

  for (let i = 0; i < totalVertices; i++) {
    const idx3 = i * 3;
    const x = rawPositions[idx3];
    const y = rawPositions[idx3 + 1];
    const z = rawPositions[idx3 + 2];

    // Quantized coordinate bins
    const qx = Math.round(x * invTol) | 0;
    const qy = Math.round(y * invTol) | 0;
    const qz = Math.round(z * invTol) | 0;

    // Teschner 32-bit prime spatial hash
    const hash = ((Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) >>> 0) & mask;

    let matchIdx = -1;
    for (let curr = head[hash]; curr !== -1; curr = next[curr]) {
      if (qxArr[curr] === qx && qyArr[curr] === qy && qzArr[curr] === qz) {
        matchIdx = curr;
        break;
      }
    }

    if (matchIdx !== -1) {
      indices[i] = matchIdx;
    } else {
      const vIdx = uniqueCount++;
      qxArr[vIdx] = qx;
      qyArr[vIdx] = qy;
      qzArr[vIdx] = qz;

      const out3 = vIdx * 3;
      uniquePositions[out3] = x;
      uniquePositions[out3 + 1] = y;
      uniquePositions[out3 + 2] = z;

      next[vIdx] = head[hash];
      head[hash] = vIdx;

      indices[i] = vIdx;
    }
  }

  // Fast slice without re-copying if vertex count differs
  const positions = uniqueCount === totalVertices 
    ? uniquePositions 
    : uniquePositions.slice(0, uniqueCount * 3);

  return {
    positions,
    indices,
    vertexCount: uniqueCount,
    triangleCount: totalTriangles,
    boundingBox: computeBoundingBox(positions)
  };
}
