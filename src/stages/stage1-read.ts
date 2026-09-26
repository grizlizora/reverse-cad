// ==============================================================================
// src/stages/stage1-read.ts — Fast Binary & ASCII STL Intake Façade
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import { detectStlFormat } from './intake/stl-detector.js';
import { parseBinarySTL } from './intake/binary-stl-reader.js';
import { parseAsciiSTL } from './intake/ascii-stl-reader.js';
import * as fs from 'fs';

export interface ReadOptions {
  deduplicateVertices?: boolean;
  tolerance?: number; // e.g. 1e-4 mm
}

/**
 * Reads an STL file from disk or from an in-memory buffer.
 * Automatically detects whether the file is binary or ASCII.
 */
export async function readSTL(
  filePathOrBuffer: string | ArrayBuffer,
  options: ReadOptions = {}
): Promise<RawMesh> {
  const tolerance = options.tolerance ?? 1e-4;
  const deduplicate = options.deduplicateVertices ?? true;

  let buffer: Buffer;
  if (typeof filePathOrBuffer === 'string') {
    buffer = await fs.promises.readFile(filePathOrBuffer);
  } else {
    buffer = Buffer.from(filePathOrBuffer);
  }

  const detection = detectStlFormat(buffer);

  if (detection.format === 'binary') {
    return parseBinarySTL(buffer, deduplicate, tolerance);
  } else {
    return parseAsciiSTL(buffer.toString('utf8'), deduplicate, tolerance);
  }
}

// Re-export decomposed modules for internal consumers
export { detectStlFormat } from './intake/stl-detector.js';
export { parseBinarySTL } from './intake/binary-stl-reader.js';
export { parseAsciiSTL } from './intake/ascii-stl-reader.js';
export { indexRawPositions } from './intake/spatial-indexer.js';
