// ==============================================================================
// src/kernel/step/analytical/profile-fitter.ts — 2D Analytic Profile Extractor Façade
// Simplifies polygonal chord loops into mixed chains of straight lines and true circular arcs.
// ==============================================================================

import { MIN_ARC_DIHEDRAL_ANGLE_RAD } from './tessellation-law.js';
import {
  Point2D,
  fitCircleFrom3Points,
  fitCircleLeastSquares
} from './least-squares-circle-fitter.js';
import {
  Line2D,
  Arc2D,
  ProfileSegment2D,
  AnalyticLoop2D,
  snapProfileLoop,
  computeProfileLoopMetrics
} from './profile-loop-snapper.js';

export type { Point2D, Line2D, Arc2D, ProfileSegment2D, AnalyticLoop2D };
export { fitCircleFrom3Points, fitCircleLeastSquares };

/**
 * Fits an analytical 2D loop composed of Line2D and Arc2D segments from a discrete polygon.
 * Uses Kåsa least squares algebraic fitting on consecutive chord chains.
 *
 * @param polygon Ordered list of 2D points representing a closed boundary loop
 * @param tolerance Max sagitta tolerance (mm) for grouping chord chains (default: 0.05 mm)
 */
export function fitAnalyticProfileLoop(
  polygon: Point2D[],
  tolerance: number = 0.05
): AnalyticLoop2D {
  const n = polygon.length;
  if (n < 3) {
    return { segments: [], isClosed: false, totalLength: 0, arcCount: 0, lineCount: 0 };
  }

  // 1. Calculate edge vectors and vertex turn angles
  const turnAngles = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const pPrev = polygon[(i - 1 + n) % n];
    const pCurr = polygon[i];
    const pNext = polygon[(i + 1) % n];

    const vInX = pCurr[0] - pPrev[0], vInY = pCurr[1] - pPrev[1];
    const lenIn = Math.hypot(vInX, vInY);
    const vOutX = pNext[0] - pCurr[0], vOutY = pNext[1] - pCurr[1];
    const lenOut = Math.hypot(vOutX, vOutY);

    if (lenIn < 1e-9 || lenOut < 1e-9) {
      turnAngles[i] = 0;
      continue;
    }

    const dot = (vInX * vOutX + vInY * vOutY) / (lenIn * lenOut);
    const clampedDot = Math.max(-1.0, Math.min(1.0, dot));
    const cross = (vInX * vOutY - vInY * vOutX) / (lenIn * lenOut);
    const angle = Math.acos(clampedDot);
    turnAngles[i] = cross < 0 ? -angle : angle;
  }

  // 2. Identify candidate arc sequences
  const isArcVertex = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const absAngle = Math.abs(turnAngles[i]);
    if (absAngle >= MIN_ARC_DIHEDRAL_ANGLE_RAD && absAngle <= Math.PI * 0.5) {
      isArcVertex[i] = 1;
    }
  }

  const segments: ProfileSegment2D[] = [];
  const handled = new Uint8Array(n);

  let i = 0;
  while (i < n) {
    if (handled[i]) {
      i++;
      continue;
    }

    if (isArcVertex[i]) {
      let chainLen = 1;
      const initialSign = turnAngles[i] > 0 ? 1 : -1;
      const baseAngle = Math.abs(turnAngles[i]);

      while (chainLen < n) {
        const nextIdx = (i + chainLen) % n;
        if (!isArcVertex[nextIdx]) break;
        const nextSign = turnAngles[nextIdx] > 0 ? 1 : -1;
        if (nextSign !== initialSign) break;

        const nextAngle = Math.abs(turnAngles[nextIdx]);
        if (Math.abs(nextAngle - baseAngle) / Math.max(1e-5, baseAngle) > 0.35) break;
        chainLen++;
      }

      if (chainLen >= 3) {
        const chordPoints: Point2D[] = [];
        for (let k = 0; k <= chainLen; k++) {
          chordPoints.push(polygon[(i + k) % n]);
        }

        const circleFit = fitCircleLeastSquares(chordPoints);
        if (circleFit && circleFit.radius > 0.2 && circleFit.radius < 10000) {
          const { center, radius } = circleFit;
          const pStart = chordPoints[0];
          const pEnd = chordPoints[chordPoints.length - 1];
          const startAngle = Math.atan2(pStart[1] - center[1], pStart[0] - center[0]);
          const endAngle = Math.atan2(pEnd[1] - center[1], pEnd[0] - center[0]);
          let angularSpan = endAngle - startAngle;
          if (initialSign > 0 && angularSpan < 0) angularSpan += 2 * Math.PI;
          if (initialSign < 0 && angularSpan > 0) angularSpan -= 2 * Math.PI;
          if (Math.abs(angularSpan) < 1e-9) {
            angularSpan = initialSign > 0 ? 2 * Math.PI : -2 * Math.PI;
          }

          segments.push({
            type: 'arc',
            center,
            radius,
            startPoint: pStart,
            endPoint: pEnd,
            startAngle,
            endAngle,
            angularSpan,
            isClockwise: initialSign < 0,
            chordCount: chainLen
          });

          for (let k = 0; k < chainLen; k++) {
            handled[(i + k) % n] = 1;
          }
          i += chainLen;
          continue;
        }
      }
    }

    // Straight line segment
    const pCurr = polygon[i];
    const pNext = polygon[(i + 1) % n];
    const dist = Math.hypot(pNext[0] - pCurr[0], pNext[1] - pCurr[1]);
    if (dist > 1e-7) {
      segments.push({
        type: 'line',
        start: pCurr,
        end: pNext,
        length: dist
      });
    }
    handled[i] = 1;
    i++;
  }

  // 3. Snap closed to guarantee C0 continuous loop
  snapProfileLoop(segments, tolerance);

  // 4. Compute metrics
  const metrics = computeProfileLoopMetrics(segments);

  return {
    segments,
    isClosed: segments.length >= 1 && (segments.length >= 3 || segments.some(s => s.type === 'arc')),
    totalLength: metrics.totalLength,
    arcCount: metrics.arcCount,
    lineCount: metrics.lineCount
  };
}
