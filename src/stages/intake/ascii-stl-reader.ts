// ==============================================================================
// src/stages/intake/ascii-stl-reader.ts — Streaming ASCII STL Reader
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { computeBoundingBox } from '../../utils/math3d.js';
import { indexRawPositions } from './spatial-indexer.js';

/**
 * Parses ASCII STL text or buffer efficiently.
 */
export function parseAsciiSTL(
  text: string,
  deduplicate: boolean,
  tolerance: number
): RawMesh {
  const vertexRegex = /vertex\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\s+([-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?)/g;
  
  // Approximate vertex count from line count to pre-allocate
  const estimatedMatches = Math.max(300, Math.floor(text.length / 80));
  let capacity = estimatedMatches * 3;
  let rawPositions = new Float32Array(capacity);
  let posCount = 0;

  let match: RegExpExecArray | null;
  while ((match = vertexRegex.exec(text)) !== null) {
    if (posCount + 3 > rawPositions.length) {
      const expanded = new Float32Array(rawPositions.length * 2);
      expanded.set(rawPositions);
      rawPositions = expanded;
    }
    rawPositions[posCount++] = parseFloat(match[1]);
    rawPositions[posCount++] = parseFloat(match[2]);
    rawPositions[posCount++] = parseFloat(match[3]);
  }

  const finalPositions = posCount === rawPositions.length 
    ? rawPositions 
    : rawPositions.slice(0, posCount);

  if (!deduplicate) {
    const totalVertices = Math.floor(posCount / 3);
    const indices = new Uint32Array(totalVertices);
    for (let i = 0; i < totalVertices; i++) {
      indices[i] = i;
    }
    return {
      positions: finalPositions,
      indices,
      vertexCount: totalVertices,
      triangleCount: Math.floor(totalVertices / 3),
      boundingBox: computeBoundingBox(finalPositions)
    };
  }

  return indexRawPositions(finalPositions, tolerance);
}
