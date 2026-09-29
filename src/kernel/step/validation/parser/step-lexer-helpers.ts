// ==============================================================================
// src/kernel/step/validation/parser/step-lexer-helpers.ts — Comment & Semicolon Scanners
// Fast ASCII scanners for safe delimiter detection outside string literals and block comments.
// ==============================================================================

/**
 * Strips leading block comments `/* ... * /` and whitespace from the start of a STEP RHS expression.
 */
export function stripLeadingComments(rhs: string): string {
  let s = rhs.trimStart();
  while (s.startsWith('/*')) {
    const closeIdx = s.indexOf('*/', 2);
    if (closeIdx === -1) return '';
    s = s.substring(closeIdx + 2).trimStart();
  }
  return s;
}

/**
 * Finds the index of the last semicolon `;` that lies strictly OUTSIDE string literals `'...'`
 * and block comments `/* ... * /`. Returns -1 if no complete statement terminator exists.
 */
export function findLastSafeSemicolon(chunk: string): number {
  let lastSafeSemi = -1;
  let inString = false;
  let inComment = false;
  const len = chunk.length;

  for (let i = 0; i < len; i++) {
    const ch = chunk.charCodeAt(i);

    if (inComment) {
      if (ch === 42 && i + 1 < len && chunk.charCodeAt(i + 1) === 47) { // '*/'
        inComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (ch === 39) { // '''
        if (i + 1 < len && chunk.charCodeAt(i + 1) === 39) {
          i++; // escaped ''
          continue;
        }
        inString = false;
      }
      continue;
    }

    if (ch === 39) { // '''
      inString = true;
    } else if (ch === 47 && i + 1 < len && chunk.charCodeAt(i + 1) === 42) { // '/*'
      inComment = true;
      i++;
    } else if (ch === 59) { // ';'
      lastSafeSemi = i;
    }
  }

  return lastSafeSemi;
}
