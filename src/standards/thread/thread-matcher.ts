// ==============================================================================
// src/standards/thread/thread-matcher.ts — Single Cylinder Metric Thread Matcher
// ==============================================================================

import { ISOThreadSpec, loadThreadCatalog } from './iso-thread-data.js';

/**
 * Matches a measured 3D cylinder diameter against standard ISO Metric Threads.
 * For internal holes, checks tap drill diameter, minor diameter, and nominal major diameter.
 * For external pins/bolts, checks nominal major diameter.
 */
export function matchMetricThread(
  measuredDiameter: number,
  isInternal: boolean,
  toleranceMm: number = 0.45
): ISOThreadSpec | null {
  const catalog = loadThreadCatalog();

  let bestMatch: ISOThreadSpec | null = null;
  let minDiff = Infinity;

  const series1Set = new Set([3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);

  for (const t of catalog) {
    if (isInternal) {
      // Internal tapped holes: tap drill diameter (D - P) is the primary physical bore size,
      // and nominal diameter is the entrance/crest diameter
      const diffDrill = Math.abs(measuredDiameter - t.tapDrillDiameter);
      const diffNom = Math.abs(measuredDiameter - t.nominalDiameter) + 0.15; // bias toward tap drill bore
      const diffMinor = t.minorDiameterInternal ? Math.abs(measuredDiameter - t.minorDiameterInternal) : Infinity;

      // Prioritize ISO 261 Series 1 preferred thread sizes over rare intermediate sizes (e.g. M3.5, M7)
      const isSeries1 = series1Set.has(t.nominalDiameter);
      const preferenceBonus = isSeries1 ? 0.0 : 0.25;

      const localMin = Math.min(diffDrill, diffNom, diffMinor) + preferenceBonus;
      if (localMin <= toleranceMm && localMin < minDiff) {
        minDiff = localMin;
        bestMatch = t;
      }
    } else {
      // External threads: nominal diameter
      const isSeries1 = series1Set.has(t.nominalDiameter);
      const preferenceBonus = isSeries1 ? 0.0 : 0.20;
      const diffNom = Math.abs(measuredDiameter - t.nominalDiameter) + preferenceBonus;
      if (diffNom <= toleranceMm && diffNom < minDiff) {
        minDiff = diffNom;
        bestMatch = t;
      }
    }
  }

  return bestMatch;
}
