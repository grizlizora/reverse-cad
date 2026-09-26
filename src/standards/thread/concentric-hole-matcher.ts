// ==============================================================================
// src/standards/thread/concentric-hole-matcher.ts — Concentric Tapped Hole Matcher
// ==============================================================================

import { ISOThreadSpec, loadThreadCatalog } from './iso-thread-data.js';
import { ISO_SERIES_1_NOMINALS, ISO_SERIES_2_NOMINALS } from './thread-indexer.js';

/**
 * Matches a pair of concentric cylinders (e.g. root bore + crest diameter)
 * directly against ISO metric thread standards with joint probability scoring.
 * Works seamlessly across all standard sizes from M1 to M64.
 */
export function matchTappedHolePair(
  diaSmaller: number,
  diaLarger: number,
  maxTotalErrorMm: number = 1.35
): ISOThreadSpec | null {
  const catalog = loadThreadCatalog();
  let bestMatch: ISOThreadSpec | null = null;
  let minScore = Infinity;

  for (const t of catalog) {
    const errNom = Math.abs(diaLarger - t.nominalDiameter);
    const errDrill = Math.abs(diaSmaller - t.tapDrillDiameter);
    const expectedDepth = t.nominalDiameter - t.tapDrillDiameter;
    const measuredDepth = diaLarger - diaSmaller;
    const errDepth = Math.abs(measuredDepth - expectedDepth);

    // Prefer ISO standard series: series 1 has no penalty, series 2 slight 0.05 penalty
    const penalty = ISO_SERIES_1_NOMINALS.has(t.nominalDiameter)
      ? 0.0
      : (ISO_SERIES_2_NOMINALS.has(t.nominalDiameter) ? 0.05 : 0.20);

    const score = errNom + errDrill + errDepth * 0.4 + penalty;
    if (errNom <= 0.85 && errDrill <= 0.85 && score <= maxTotalErrorMm && score < minScore) {
      minScore = score;
      bestMatch = t;
    }
  }

  return bestMatch;
}
