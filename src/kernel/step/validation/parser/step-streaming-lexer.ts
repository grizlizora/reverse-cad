// ==============================================================================
// src/kernel/step/validation/parser/step-streaming-lexer.ts — ISO 10303-21 Zero-Copy Streaming Lexer Façade
// ==============================================================================

import { stripLeadingComments } from './step-lexer-helpers.js';
import { streamStepFileChunks } from './step-file-chunk-reader.js';

export type StepStatementCallback = (entityId: string, rhs: string) => void;

/**
 * High-performance ISO 10303-21 STEP lexer.
 * Scans DATA...ENDSEC statements using zero-allocation index pointers (no `split(';')` array explosion)
 * or 64KB file stream chunks for gigabyte-scale STEP files.
 * Properly handles block comments `/* ... * /`, multi-byte UTF-8 boundaries, and string literals `'...'`.
 */
export class StepStreamingLexer {
  /**
   * Zero-copy index-based statement scanner over an in-memory STEP string.
   * @param stepContent Full STEP string or pre-sliced DATA section chunk
   * @param onStatement Callback invoked for each `#ID = ENTITY(...)` statement
   * @param isPreSlicedDataChunk Set true when called from `scanFileChunks` where `DATA;` was already stripped
   */
  public static scanStatements(
    stepContent: string,
    onStatement: StepStatementCallback,
    isPreSlicedDataChunk: boolean = false
  ): void {
    const len = stepContent.length;
    if (len === 0) return;

    let pos = 0;
    let limit = len;

    if (!isPreSlicedDataChunk) {
      const dataMarker = stepContent.indexOf('DATA;');
      pos = dataMarker !== -1 ? dataMarker + 5 : 0;
      const endMarker = stepContent.lastIndexOf('ENDSEC;');
      limit = endMarker > pos ? endMarker : len;
    }

    while (pos < limit) {
      // 1. Skip leading whitespace, newlines, and comments
      while (pos < limit) {
        const ch = stepContent.charCodeAt(pos);
        if (ch === 32 || ch === 9 || ch === 10 || ch === 13) {
          pos++;
        } else if (ch === 47 && pos + 1 < limit && stepContent.charCodeAt(pos + 1) === 42) {
          const closeIdx = stepContent.indexOf('*/', pos + 2);
          pos = closeIdx !== -1 ? closeIdx + 2 : limit;
        } else {
          break;
        }
      }

      if (pos >= limit) break;

      // 2. Scan until statement-terminating ';' outside of string literals '...' and comments /*...*/
      const stmtStart = pos;
      let eqIdx = -1;
      let inString = false;
      let stmtEnd = -1;

      while (pos < limit) {
        const ch = stepContent.charCodeAt(pos);

        if (inString) {
          if (ch === 39) { // '''
            if (pos + 1 < limit && stepContent.charCodeAt(pos + 1) === 39) {
              pos += 2;
              continue;
            }
            inString = false;
          }
          pos++;
          continue;
        }

        if (ch === 39) { // '''
          inString = true;
          pos++;
          continue;
        }

        if (ch === 47 && pos + 1 < limit && stepContent.charCodeAt(pos + 1) === 42) {
          const closeIdx = stepContent.indexOf('*/', pos + 2);
          pos = closeIdx !== -1 ? closeIdx + 2 : limit;
          continue;
        }

        if (ch === 61 && eqIdx === -1) { // '='
          eqIdx = pos;
        } else if (ch === 59) { // ';'
          stmtEnd = pos;
          pos++;
          break;
        }

        pos++;
      }

      if (stmtEnd === -1) break;

      if (eqIdx > stmtStart && eqIdx < stmtEnd) {
        const entityId = stepContent.substring(stmtStart, eqIdx).trim();
        if (entityId.charCodeAt(0) === 35) { // '#'
          const rawRhs = stepContent.substring(eqIdx + 1, stmtEnd);
          const rhs = rawRhs.includes('/*') ? stripLeadingComments(rawRhs) : rawRhs.trim();
          if (rhs) {
            onStatement(entityId, rhs);
          }
        }
      }
    }
  }

  /**
   * Streams a STEP file from disk in fixed 64KB chunks without loading the entire file into V8 string heap.
   */
  public static scanFileChunks(
    filePath: string,
    onStatement: StepStatementCallback,
    chunkSizeBytes: number = 65536
  ): void {
    streamStepFileChunks(
      filePath,
      slice => StepStreamingLexer.scanStatements(slice, onStatement, true),
      chunkSizeBytes
    );
  }
}
