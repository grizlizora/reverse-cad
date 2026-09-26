// ==============================================================================
// src/standards/thread/thread-indexer.ts — Thread Series & Fast Indexing
// ==============================================================================

import { ISOThreadSpec, loadThreadCatalog } from './iso-thread-data.js';

export const ISO_SERIES_1_NOMINALS = new Set([
  1, 1.2, 1.6, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 30, 36, 42, 48, 56, 64
]);

export const ISO_SERIES_2_NOMINALS = new Set([
  1.4, 1.8, 3.5, 7, 14, 18, 22, 27, 33, 39, 45, 52, 60
]);

/**
 * Fast lookup of thread candidates within tolerance window using binary search.
 */
export function findCandidateThreads(
  catalog: ISOThreadSpec[],
  targetDiameter: number,
  toleranceMm: number
): ISOThreadSpec[] {
  if (catalog.length === 0) return [];

  // Binary search range for nominalDiameter
  let low = 0;
  let high = catalog.length - 1;
  const minVal = targetDiameter - toleranceMm - 4.0; // Margin for tap drill vs nominal diff
  const maxVal = targetDiameter + toleranceMm + 4.0;

  let startIdx = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (catalog[mid].nominalDiameter < minVal) {
      low = mid + 1;
    } else {
      startIdx = mid;
      high = mid - 1;
    }
  }

  const results: ISOThreadSpec[] = [];
  for (let i = startIdx; i < catalog.length; i++) {
    const t = catalog[i];
    if (t.nominalDiameter > maxVal) break;
    results.push(t);
  }

  return results.length > 0 ? results : catalog;
}
