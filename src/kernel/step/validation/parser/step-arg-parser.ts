// ==============================================================================
// src/kernel/step/validation/parser/step-arg-parser.ts — Zero-GC STEP Argument Parser
// ==============================================================================
// High-speed character-code argument and #ID list extractors for ISO 10303-21
// statements. Eliminates per-statement RegExp compilation and .split().map() chains.
// ==============================================================================

export class StepArgParser {
  /**
   * Advances past the opening parenthesis and the first argument (typically `'name'`),
   * returning the index immediately after the first top-level comma, or -1 if not found.
   */
  public static skipFirstArg(rhs: string): number {
    const outerOpen = rhs.indexOf('(');
    if (outerOpen === -1) return -1;

    const len = rhs.length;
    let inString = false;
    for (let i = outerOpen + 1; i < len; i++) {
      const c = rhs.charCodeAt(i);
      if (c === 39) { // '''
        if (inString && i + 1 < len && rhs.charCodeAt(i + 1) === 39) {
          i++;
          continue;
        }
        inString = !inString;
        continue;
      }
      if (!inString && c === 44) { // ','
        return i + 1;
      }
    }
    return -1;
  }

  /**
   * Safely locates the first inner parenthesized list `(a, b, c)` after the first
   * argument, ignoring any parentheses inside string literals.
   */
  public static findInnerListBounds(rhs: string): [number, number] {
    const afterFirst = this.skipFirstArg(rhs);
    if (afterFirst === -1) return [-1, -1];

    const listStart = rhs.indexOf('(', afterFirst);
    if (listStart === -1) return [-1, -1];
    const listEnd = rhs.indexOf(')', listStart + 1);
    return [listStart, listEnd];
  }

  /**
   * Extracts all `#ID` references inside `rhs[start + 1 .. end - 1]` without `.split(',')`.
   */
  public static parseIdList(rhs: string, listStart: number, listEnd: number): string[] {
    const ids: string[] = [];
    if (listStart === -1 || listEnd === -1 || listEnd <= listStart) return ids;

    let i = listStart + 1;
    while (i < listEnd) {
      const c = rhs.charCodeAt(i);
      if (c === 35) { // '#'
        const tokStart = i;
        i++;
        while (i < listEnd) {
          const ch = rhs.charCodeAt(i);
          // Allow digits 0-9, A-Z, a-z, '_'
          if (
            (ch >= 48 && ch <= 57) ||
            (ch >= 65 && ch <= 90) ||
            (ch >= 97 && ch <= 122) ||
            ch === 95
          ) {
            i++;
          } else {
            break;
          }
        }
        if (i > tokStart + 1) {
          ids.push(rhs.slice(tokStart, i));
        }
      } else {
        i++;
      }
    }
    return ids;
  }

  public static parseInnerIdList(rhs: string): string[] | null {
    const [lStart, lEnd] = this.findInnerListBounds(rhs);
    if (lStart === -1 || lEnd === -1) return null;
    return this.parseIdList(rhs, lStart, lEnd);
  }

  /**
   * Extracts the next `#ID` token starting at or after `fromIndex`.
   */
  public static nextIdToken(rhs: string, fromIndex: number): { id: string; nextIndex: number } | null {
    const hashIdx = rhs.indexOf('#', fromIndex);
    if (hashIdx === -1) return null;
    const len = rhs.length;
    let i = hashIdx + 1;
    while (i < len) {
      const ch = rhs.charCodeAt(i);
      if (
        (ch >= 48 && ch <= 57) ||
        (ch >= 65 && ch <= 90) ||
        (ch >= 97 && ch <= 122) ||
        ch === 95
      ) {
        i++;
      } else {
        break;
      }
    }
    if (i === hashIdx + 1) return null;
    return { id: rhs.slice(hashIdx, i), nextIndex: i };
  }

  /**
   * Extracts `.T.` or `.F.` boolean starting at or after `fromIndex`.
   */
  public static nextBooleanToken(rhs: string, fromIndex: number): boolean | null {
    const len = rhs.length - 2;
    for (let i = fromIndex; i < len; i++) {
      if (rhs.charCodeAt(i) === 46 && rhs.charCodeAt(i + 2) === 46) { // '.' _ '.'
        const mid = rhs.charCodeAt(i + 1);
        if (mid === 84) return true;  // 'T'
        if (mid === 70) return false; // 'F'
      }
    }
    return null;
  }

  public static parseCartesianPointCoords(rhs: string): { x: number; y: number; z: number } | null {
    const [lStart, lEnd] = this.findInnerListBounds(rhs);
    if (lStart === -1 || lEnd === -1) return null;
    const c1 = rhs.indexOf(',', lStart + 1);
    if (c1 === -1 || c1 >= lEnd) return null;
    const c2 = rhs.indexOf(',', c1 + 1);
    if (c2 === -1 || c2 >= lEnd) return null;

    const x = parseFloat(rhs.slice(lStart + 1, c1));
    const y = parseFloat(rhs.slice(c1 + 1, c2));
    const z = parseFloat(rhs.slice(c2 + 1, lEnd));
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) return null;
    return { x, y, z };
  }

  public static parseEdgeCurveArgs(
    rhs: string
  ): { v1: string; v2: string; curveId: string; sameSense: boolean } | null {
    const afterFirst = this.skipFirstArg(rhs);
    if (afterFirst === -1) return null;
    const t1 = this.nextIdToken(rhs, afterFirst);
    if (!t1) return null;
    const t2 = this.nextIdToken(rhs, t1.nextIndex);
    if (!t2) return null;
    const t3 = this.nextIdToken(rhs, t2.nextIndex);
    if (!t3) return null;
    const sameSense = this.nextBooleanToken(rhs, t3.nextIndex);
    if (sameSense === null) return null;
    return { v1: t1.id, v2: t2.id, curveId: t3.id, sameSense };
  }

  public static parseOrientedEdgeArgs(
    rhs: string
  ): { edgeCurveId: string; orientation: boolean } | null {
    const afterFirst = this.skipFirstArg(rhs);
    if (afterFirst === -1) return null;
    // Skip arg 2 and arg 3 (usually *, * or #v1, #v2)
    const c2 = rhs.indexOf(',', afterFirst);
    if (c2 === -1) return null;
    const c3 = rhs.indexOf(',', c2 + 1);
    if (c3 === -1) return null;
    const ecTok = this.nextIdToken(rhs, c3 + 1);
    if (!ecTok) return null;
    const orientation = this.nextBooleanToken(rhs, ecTok.nextIndex);
    if (orientation === null) return null;
    return { edgeCurveId: ecTok.id, orientation };
  }
}
