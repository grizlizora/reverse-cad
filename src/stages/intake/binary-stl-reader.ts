// ==============================================================================
// src/stages/intake/binary-stl-reader.ts — Resilient Binary STL Reader
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { computeBoundingBox } from '../../utils/math3d.js';
import { indexRawPositions } from './spatial-indexer.js';

/**
 * Parses binary STL buffer safely preventing zero-fill phantom vertices on truncated streams.
 */
export function parseBinarySTL(
  buffer: Buffer,
  deduplicate: boolean,
  tolerance: number
): RawMesh {
  if (buffer.length < 84) {
    throw new Error(`Binary STL buffer too small (${buffer.length} bytes < 84 bytes minimum)`);
  }

  const headerTriangleCount = buffer.readUInt32LE(80);
  const maxPossibleTriangles = Math.max(0, Math.floor((buffer.length - 84) / 50));
  const triangleCount = Math.min(headerTriangleCount, maxPossibleTriangles);

  const rawPositions = new Float32Array(triangleCount * 9);
  let readOffset = 84;
  let writePos = 0;

  for (let i = 0; i < triangleCount; i++) {
    // Skip 12 bytes face normal (recalculated accurately from vertices)
    readOffset += 12;

    // Read 3 vertices (each 3 floats)
    for (let v = 0; v < 3; v++) {
      rawPositions[writePos++] = buffer.readFloatLE(readOffset);
      rawPositions[writePos++] = buffer.readFloatLE(readOffset + 4);
      rawPositions[writePos++] = buffer.readFloatLE(readOffset + 8);
      readOffset += 12;
    }

    // Skip 2 bytes attribute byte count
    readOffset += 2;
  }

  if (!deduplicate) {
    const indices = new Uint32Array(triangleCount * 3);
    for (let i = 0; i < indices.length; i++) {
      indices[i] = i;
    }
    return {
      positions: rawPositions,
      indices,
      vertexCount: triangleCount * 3,
      triangleCount,
      boundingBox: computeBoundingBox(rawPositions)
    };
  }

  return indexRawPositions(rawPositions, tolerance);
}
