// ==============================================================================
// src/stages/profiling/hole/coaxial-hole-matcher.ts — Coaxial Hole & Counterbore Matcher
// ==============================================================================

import { CylinderSurface } from '../../../types/geometry.js';
import { CADHole, CADThread } from '../../../types/features.js';
import { matchMetricThread, matchTappedHolePair } from '../../../standards/thread-catalog.js';
import { evaluateCounterborePair } from '../counterbore-detector.js';

export interface CoaxialMatchResult {
  holes: CADHole[];
  threads: CADThread[];
  processedCylIds: Set<string>;
}

/**
 * Matches coaxial pairs of internal cylinders for tapped holes and counterbores.
 */
export function matchCoaxialHolePairs(
  internalFullCylinders: CylinderSurface[],
  internalCandidateCylinders: CylinderSurface[],
  startHoleCount: number,
  startThreadCount: number
): CoaxialMatchResult {
  const holes: CADHole[] = [];
  const threads: CADThread[] = [];
  const processedCylIds = new Set<string>();

  let holeCounter = startHoleCount;
  let threadCounter = startThreadCount;

  for (let i = 0; i < internalFullCylinders.length; i++) {
    const c1 = internalFullCylinders[i];
    if (processedCylIds.has(c1.id)) continue;

    for (let j = 0; j < internalCandidateCylinders.length; j++) {
      const c2 = internalCandidateCylinders[j];
      if (c1.id === c2.id || processedCylIds.has(c2.id)) continue;

      const dotA = c1.axisDirection[0] * c2.axisDirection[0] +
                   c1.axisDirection[1] * c2.axisDirection[1] +
                   c1.axisDirection[2] * c2.axisDirection[2];
      if (Math.abs(dotA) < 0.95) continue;

      const dx = c1.axisOrigin[0] - c2.axisOrigin[0];
      const dy = c1.axisOrigin[1] - c2.axisOrigin[1];
      const dz = c1.axisOrigin[2] - c2.axisOrigin[2];
      const proj = dx * c1.axisDirection[0] + dy * c1.axisDirection[1] + dz * c1.axisDirection[2];
      const perpDist = Math.sqrt(
        (dx - proj * c1.axisDirection[0]) ** 2 +
        (dy - proj * c1.axisDirection[1]) ** 2 +
        (dz - proj * c1.axisDirection[2]) ** 2
      );

      if (perpDist < 1.25) {
        const [smaller, larger] = c1.radius < c2.radius ? [c1, c2] : [c2, c1];
        const diaSmaller = smaller.radius * 2.0;
        const diaLarger = larger.radius * 2.0;
        const radDiff = Math.abs(c1.radius - c2.radius);

        const threadMatch = matchTappedHolePair(diaSmaller, diaLarger) ||
                            matchMetricThread(diaSmaller, true, 0.45) ||
                            matchMetricThread(diaLarger, true, 0.45);

        if (threadMatch && Math.abs(diaLarger - diaSmaller) <= Math.max(1.8, threadMatch.pitch * 2.0)) {
          processedCylIds.add(smaller.id);
          processedCylIds.add(larger.id);

          const depth = Math.max(smaller.height, larger.height, Math.abs(proj) + Math.min(smaller.height, larger.height));
          holes.push({
            id: `hole_${++holeCounter}`,
            type: 'through',
            diameter: parseFloat(threadMatch.tapDrillDiameter.toFixed(2)),
            depth: parseFloat(depth.toFixed(2)),
            axisOrigin: smaller.axisOrigin,
            axisDirection: smaller.axisDirection,
            isThreaded: true,
            threadSpec: threadMatch.designation
          });

          threads.push({
            id: `thread_${++threadCounter}`,
            isInternal: true,
            standard: 'ISO_METRIC',
            designation: threadMatch.designation,
            nominalDiameter: threadMatch.nominalDiameter,
            tapDrillDiameter: threadMatch.tapDrillDiameter,
            pitch: threadMatch.pitch,
            threadDepth: depth,
            starts: 1,
            hand: 'right',
            axisOrigin: smaller.axisOrigin,
            axisDirection: smaller.axisDirection,
            radialFdmOffsetApplied: 0.0
          });
          break;
        }

        // Counterbore evaluation
        const cbMatch = evaluateCounterborePair(c1, c2, Math.abs(proj));
        if (cbMatch.isCounterbore && cbMatch.mainBore && cbMatch.counterBore) {
          processedCylIds.add(cbMatch.mainBore.id);
          processedCylIds.add(cbMatch.counterBore.id);

          holes.push({
            id: `hole_cb_${++holeCounter}`,
            type: 'counterbore',
            diameter: parseFloat((cbMatch.mainBore.radius * 2.0).toFixed(2)),
            depth: parseFloat((cbMatch.totalDepth || (cbMatch.mainBore.height + cbMatch.counterBore.height)).toFixed(2)),
            axisOrigin: cbMatch.counterBore.axisOrigin,
            axisDirection: cbMatch.counterBore.axisDirection,
            counterboreDiameter: cbMatch.counterboreDiameter,
            counterboreDepth: cbMatch.counterboreDepth,
            isThreaded: false
          });
          break;
        }

        // Split cylinder merging bug fix: if same radius, merge depths
        if (radDiff < 0.15) {
          c1.height = Math.max(c1.height, c2.height, Math.abs(proj) + Math.min(c1.height, c2.height));
          processedCylIds.add(c2.id);
          continue;
        }
      }
    }
  }

  return { holes, threads, processedCylIds };
}
