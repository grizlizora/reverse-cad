// ==============================================================================
// src/stages/intake/stl-detector.ts — Robust STL Format & Header Detection
// ==============================================================================

export type StlFormat = 'binary' | 'ascii';

export interface StlDetectionResult {
  format: StlFormat;
  headerTriangleCount?: number;
}

/**
 * Accurately determines if an STL buffer is Binary or ASCII without truncating checks.
 */
export function detectStlFormat(buffer: Buffer): StlDetectionResult {
  if (buffer.length >= 84) {
    const expectedTriangles = buffer.readUInt32LE(80);
    const expectedSize = 84 + expectedTriangles * 50;

    // Standard binary STL matching expected exact or within 2 bytes (EOF newline padding)
    if (Math.abs(buffer.length - expectedSize) <= 2) {
      return { format: 'binary', headerTriangleCount: expectedTriangles };
    }
  }

  // Scan up to 4KB or entire buffer for ASCII STL markers
  const scanLimit = Math.min(buffer.length, 4096);
  const textSample = buffer.subarray(0, scanLimit).toString('utf8').toLowerCase();

  const hasSolid = textSample.includes('solid');
  const hasFacet = textSample.includes('facet');

  if (hasSolid && hasFacet) {
    return { format: 'ascii' };
  }

  // If buffer has non-ASCII binary bytes in first 512 bytes, treat as binary
  const sampleLength = Math.min(buffer.length, 512);
  let nonAsciiCount = 0;
  for (let i = 0; i < sampleLength; i++) {
    const b = buffer[i];
    if ((b < 32 || b > 126) && b !== 9 && b !== 10 && b !== 13) {
      nonAsciiCount++;
    }
  }

  if (nonAsciiCount > 2) {
    const triCount = buffer.length >= 84 ? buffer.readUInt32LE(80) : undefined;
    return { format: 'binary', headerTriangleCount: triCount };
  }

  // Fallback: check if ASCII text contains 'solid'
  if (hasSolid) {
    return { format: 'ascii' };
  }

  return { format: 'binary' };
}
