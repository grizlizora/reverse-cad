// ==============================================================================
// src/kernel/step/analytical/profile-fitter.ts — 2D Analytic Profile Extractor
// Simplifies polygonal chord loops into mixed chains of straight lines and true circular arcs.
// ==============================================================================

import { invertTessellationLaw, MIN_ARC_DIHEDRAL_ANGLE_RAD } from './tessellation-law.js';

export type Point2D = [number, number];

export interface Line2D {
  type: 'line';
  start: Point2D;
  end: Point2D;
  length: number;
}

export interface Arc2D {
  type: 'arc';
  center: Point2D;
  radius: number;
  startPoint: Point2D;
  endPoint: Point2D;
  startAngle: number;
  endAngle: number;
  angularSpan: number;
  isClockwise: boolean;
  chordCount: number;
}

export type ProfileSegment2D = Line2D | Arc2D;

export interface AnalyticLoop2D {
  segments: ProfileSegment2D[];
  isClosed: boolean;
  totalLength: number;
  arcCount: number;
  lineCount: number;
}

/**
 * Fits a circular center from 3 points on the arc.
 */
function fitCircleFrom3Points(p1: Point2D, p2: Point2D, p3: Point2D): { center: Point2D; radius: number } | null {
  const x1 = p1[0], y1 = p1[1];
  const x2 = p2[0], y2 = p2[1];
  const x3 = p3[0], y3 = p3[1];

  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-10) return null;

  const x1Sq = x1 * x1 + y1 * y1;
  const x2Sq = x2 * x2 + y2 * y2;
  const x3Sq = x3 * x3 + y3 * y3;

  const cx = (x1Sq * (y2 - y3) + x2Sq * (y3 - y1) + x3Sq * (y1 - y2)) / d;
  const cy = (x1Sq * (x3 - x2) + x2Sq * (x1 - x3) + x3Sq * (x2 - x1)) / d;

  const radius = Math.hypot(x1 - cx, y1 - cy);
  return { center: [cx, cy], radius };
}

/**
 * Fits an analytical 2D loop composed of Line2D and Arc2D segments from a discrete polygon.
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
    return {
      segments: [],
      isClosed: false,
      totalLength: 0,
      arcCount: 0,
      lineCount: 0
    };
  }

  // 1. Calculate edge vectors and vertex turn angles
  const edgeLengths: number[] = new Array(n);
  const turnAngles: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const pPrev = polygon[(i - 1 + n) % n];
    const pCurr = polygon[i];
    const pNext = polygon[(i + 1) % n];

    const vInX = pCurr[0] - pPrev[0];
    const vInY = pCurr[1] - pPrev[1];
    const lenIn = Math.hypot(vInX, vInY);

    const vOutX = pNext[0] - pCurr[0];
    const vOutY = pNext[1] - pCurr[1];
    const lenOut = Math.hypot(vOutX, vOutY);

    edgeLengths[i] = lenOut;

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

  // 2. Identify candidate arc sequences (consecutive vertices with consistent sign & similar angle)
  const isArcVertex = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const absAngle = Math.abs(turnAngles[i]);
    if (absAngle >= MIN_ARC_DIHEDRAL_ANGLE_RAD && absAngle <= Math.PI * 0.5) {
      isArcVertex[i] = 1;
    }
  }

  const segments: ProfileSegment2D[] = [];
  const handled = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    if (handled[i]) continue;

    // Check for an arc chain starting around vertex i
    if (isArcVertex[i]) {
      // Find chain length
      let chainLen = 1;
      const initialSign = turnAngles[i] > 0 ? 1 : -1;
      const baseAngle = Math.abs(turnAngles[i]);

      while (chainLen < n) {
        const nextIdx = (i + chainLen) % n;
        if (!isArcVertex[nextIdx]) break;
        const nextSign = turnAngles[nextIdx] > 0 ? 1 : -1;
        if (nextSign !== initialSign) break;

        const nextAngle = Math.abs(turnAngles[nextIdx]);
        // Angle similarity check (within 30%)
        if (Math.abs(nextAngle - baseAngle) / Math.max(1e-5, baseAngle) > 0.35) break;

        chainLen++;
      }

      // Valid arc chain requires at least 3 chord steps (4 vertices)
      if (chainLen >= 3) {
        const startV = (i - 1 + n) % n;
        const midV = (i + Math.floor(chainLen / 2)) % n;
        const endV = (i + chainLen) % n;

        const pStart = polygon[startV];
        const pMid = polygon[midV];
        const pEnd = polygon[endV];

        const circleFit = fitCircleFrom3Points(pStart, pMid, pEnd);
        if (circleFit && circleFit.radius > 0.5 && circleFit.radius < 5000) {
          const { center, radius } = circleFit;
          const startAngle = Math.atan2(pStart[1] - center[1], pStart[0] - center[0]);
          const endAngle = Math.atan2(pEnd[1] - center[1], pEnd[0] - center[0]);
          let angularSpan = endAngle - startAngle;
          if (initialSign > 0 && angularSpan < 0) angularSpan += 2 * Math.PI;
          if (initialSign < 0 && angularSpan > 0) angularSpan -= 2 * Math.PI;

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

          for (let k = 0; k <= chainLen; k++) {
            handled[(i + k) % n] = 1;
          }
          i = (i + chainLen) % n;
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
  }

  // 3. Snap closed to guarantee C0 continuous loop
  if (segments.length > 1) {
    for (let k = 0; k < segments.length; k++) {
      const curr = segments[k];
      const next = segments[(k + 1) % segments.length];
      const currEnd = curr.type === 'line' ? curr.end : curr.endPoint;
      const nextStart = next.type === 'line' ? next.start : next.startPoint;

      const gap = Math.hypot(nextStart[0] - currEnd[0], nextStart[1] - currEnd[1]);
      if (gap > 0 && gap < tolerance) {
        // Average the contact point
        const midX = (currEnd[0] + nextStart[0]) * 0.5;
        const midY = (currEnd[1] + nextStart[1]) * 0.5;
        if (curr.type === 'line') {
          curr.end = [midX, midY];
        } else {
          curr.endPoint = [midX, midY];
        }
        if (next.type === 'line') {
          next.start = [midX, midY];
        } else {
          next.startPoint = [midX, midY];
        }
      }
    }
  }

  let totalLength = 0;
  let arcCount = 0;
  let lineCount = 0;
  for (const s of segments) {
    if (s.type === 'arc') {
      arcCount++;
      totalLength += s.radius * Math.abs(s.angularSpan);
    } else {
      lineCount++;
      totalLength += s.length;
    }
  }

  return {
    segments,
    isClosed: segments.length >= 3,
    totalLength,
    arcCount,
    lineCount
  };
}
