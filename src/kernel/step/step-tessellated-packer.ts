// ==============================================================================
// src/kernel/step/step-tessellated-packer.ts — Streaming Coordinate & Triangle Packer
// ==============================================================================

import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepNumber } from './step-entity-pool.js';

const CHUNK_SIZE_LIMIT = 128 * 1024;
const YIELD_THRESHOLD = 50000;

/**
 * Streams contiguous coordinate array into COORDINATES_LIST with cooperative yielding
 * to prevent Event Loop starvation on multi-million vertex models.
 */
export async function streamCoordinatesList(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  positions: Float32Array | Float64Array,
  vertexCount: number
): Promise<string> {
  const coordListId = allocator.nextId();
  await writer.writeLine(`${coordListId} = COORDINATES_LIST('', ${vertexCount}, (`);

  let chunk = '';
  for (let v = 0; v < vertexCount; v++) {
    const v3 = v * 3;
    const x = formatStepNumber(positions[v3]);
    const y = formatStepNumber(positions[v3 + 1]);
    const z = formatStepNumber(positions[v3 + 2]);

    chunk += `(${x}, ${y}, ${z})`;
    if (v === vertexCount - 1) {
      chunk += '));\n';
    } else {
      chunk += ((v + 1) % 4 === 0) ? ',\n' : ', ';
    }

    if (chunk.length >= CHUNK_SIZE_LIMIT) {
      await writer.writeBlock(chunk);
      chunk = '';
    }

    if (v > 0 && v % YIELD_THRESHOLD === 0) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  if (chunk.length > 0) {
    await writer.writeBlock(chunk);
  }

  return coordListId;
}

/**
 * Streams triangle 1-based vertex indices into TRIANGULATED_FACE in 128KB chunks.
 * Accepts either an explicit triangle index array or total count (for monolithic mesh).
 */
export async function streamTriangulatedFace(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  coordListId: string,
  meshIndices: Uint32Array | Int32Array,
  triangleIndices?: ArrayLike<number>,
  totalTriangles?: number
): Promise<string> {
  const count = triangleIndices ? triangleIndices.length : (totalTriangles ?? 0);
  const triFaceId = allocator.nextId();
  await writer.writeLine(`${triFaceId} = TRIANGULATED_FACE('', ${coordListId}, (`);

  let chunk = '';
  for (let k = 0; k < count; k++) {
    const t = triangleIndices ? triangleIndices[k] : k;
    const t3 = t * 3;
    const i0 = meshIndices[t3] + 1;
    const i1 = meshIndices[t3 + 1] + 1;
    const i2 = meshIndices[t3 + 2] + 1;

    chunk += `(${i0}, ${i1}, ${i2})`;
    if (k === count - 1) {
      chunk += '));\n';
    } else {
      chunk += ((k + 1) % 6 === 0) ? ',\n' : ', ';
    }

    if (chunk.length >= CHUNK_SIZE_LIMIT) {
      await writer.writeBlock(chunk);
      chunk = '';
    }

    if (k > 0 && k % YIELD_THRESHOLD === 0) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }
  }

  if (chunk.length > 0) {
    await writer.writeBlock(chunk);
  }

  return triFaceId;
}
