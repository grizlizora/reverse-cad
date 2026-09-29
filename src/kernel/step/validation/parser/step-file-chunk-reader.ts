// ==============================================================================
// src/kernel/step/validation/parser/step-file-chunk-reader.ts — Streaming Disk Chunk Reader
// Streams multi-gigabyte STEP files with multi-byte UTF-8 preservation & zero heap blowup.
// ==============================================================================

import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';
import { findLastSafeSemicolon } from './step-lexer-helpers.js';

export type ChunkStatementCallback = (targetSlice: string) => void;

/**
 * Streams a STEP file from disk in fixed 64KB chunks without loading the entire file into V8 string heap.
 * Uses `StringDecoder` to preserve multi-byte UTF-8 characters across chunk boundaries,
 * and `findLastSafeSemicolon` so semicolons inside unclosed strings/comments never split a statement.
 */
export function streamStepFileChunks(
  filePath: string,
  onChunk: ChunkStatementCallback,
  chunkSizeBytes: number = 65536
): void {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.allocUnsafe(chunkSizeBytes);
  const decoder = new StringDecoder('utf8');
  let carryOver = '';
  let inDataSection = false;
  let reachedEndSec = false;

  try {
    let bytesRead = 0;
    while (!reachedEndSec && (bytesRead = fs.readSync(fd, buf, 0, chunkSizeBytes, null)) > 0) {
      let chunk = carryOver + decoder.write(buf.subarray(0, bytesRead));
      carryOver = '';

      if (!inDataSection) {
        const dataIdx = chunk.indexOf('DATA;');
        if (dataIdx === -1) {
          carryOver = chunk.length > 16 ? chunk.slice(-16) : chunk;
          continue;
        }
        inDataSection = true;
        chunk = chunk.substring(dataIdx + 5);
      }

      // Find last semicolon strictly outside of string literals '...' and comments /*...*/
      const lastSafeSemi = findLastSafeSemicolon(chunk);
      if (lastSafeSemi === -1) {
        carryOver = chunk;
        continue;
      }

      const completePart = chunk.substring(0, lastSafeSemi + 1);
      carryOver = chunk.substring(lastSafeSemi + 1);

      // Check if ENDSEC; statement terminator was reached
      const endSecMatch = /(?:^|[\s;])ENDSEC\s*;/.exec(completePart);
      const targetSlice = endSecMatch
        ? completePart.substring(0, endSecMatch.index + (endSecMatch[0].startsWith(';') ? 1 : 0))
        : completePart;

      onChunk(targetSlice);

      if (endSecMatch) {
        reachedEndSec = true;
      }
    }

    const trailing = carryOver + decoder.end();
    if (inDataSection && !reachedEndSec && trailing.trim().length > 0) {
      onChunk(trailing);
    }
  } finally {
    fs.closeSync(fd);
  }
}
