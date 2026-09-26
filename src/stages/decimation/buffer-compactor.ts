// ==============================================================================
// src/stages/decimation/buffer-compactor.ts — Zero-GC Contiguous Buffer Compaction
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { computeBoundingBox } from '../../math/index.js';

/**
 * Compacts mesh buffers into tightly packed Float32Array positions and Uint32Array indices.
 * Pre-allocates buffers to avoid V8 array reallocations and GC overhead.
 */
export function compactDecimatedBuffers(
  mesh: RawMesh,
  remap: Int32Array
): RawMesh {
  const numVertices = mesh.vertexCount;
  const numTriangles = mesh.triangleCount;
  const positions = mesh.positions;
  const indices = mesh.indices;

  const findRoot = (v: number): number => {
    let curr = v;
    while (remap[curr] !== curr) {
      curr = remap[curr];
    }
    remap[v] = curr;
    return curr;
  };

  const oldToNewVertex = new Int32Array(numVertices);
  oldToNewVertex.fill(-1);

  // Pre-allocate maximum possible capacity
  const tempIndices = new Uint32Array(numTriangles * 3);
  const tempPositions = new Float32Array(numVertices * 3);

  let newVertexCount = 0;
  let indexWritePtr = 0;

  for (let t = 0; t < numTriangles; t++) {
    const t3 = t * 3;
    const i0 = findRoot(indices[t3]);
    const i1 = findRoot(indices[t3 + 1]);
    const i2 = findRoot(indices[t3 + 2]);

    if (i0 !== i1 && i1 !== i2 && i2 !== i0) {
      // Map i0
      let n0 = oldToNewVertex[i0];
      if (n0 === -1) {
        n0 = newVertexCount++;
        oldToNewVertex[i0] = n0;
        const oIdx = i0 * 3;
        const nIdx = n0 * 3;
        tempPositions[nIdx] = positions[oIdx];
        tempPositions[nIdx + 1] = positions[oIdx + 1];
        tempPositions[nIdx + 2] = positions[oIdx + 2];
      }

      // Map i1
      let n1 = oldToNewVertex[i1];
      if (n1 === -1) {
        n1 = newVertexCount++;
        oldToNewVertex[i1] = n1;
        const oIdx = i1 * 3;
        const nIdx = n1 * 3;
        tempPositions[nIdx] = positions[oIdx];
        tempPositions[nIdx + 1] = positions[oIdx + 1];
        tempPositions[nIdx + 2] = positions[oIdx + 2];
      }

      // Map i2
      let n2 = oldToNewVertex[i2];
      if (n2 === -1) {
        n2 = newVertexCount++;
        oldToNewVertex[i2] = n2;
        const oIdx = i2 * 3;
        const nIdx = n2 * 3;
        tempPositions[nIdx] = positions[oIdx];
        tempPositions[nIdx + 1] = positions[oIdx + 1];
        tempPositions[nIdx + 2] = positions[oIdx + 2];
      }

      tempIndices[indexWritePtr++] = n0;
      tempIndices[indexWritePtr++] = n1;
      tempIndices[indexWritePtr++] = n2;
    }
  }

  const finalPositions = tempPositions.slice(0, newVertexCount * 3);
  const finalIndices = tempIndices.slice(0, indexWritePtr);

  return {
    positions: finalPositions,
    indices: finalIndices,
    vertexCount: newVertexCount,
    triangleCount: Math.floor(indexWritePtr / 3),
    boundingBox: computeBoundingBox(finalPositions)
  };
}
