// ==============================================================================
// src/kernel/step/analytical/profile-loop-snapper.ts — Profile Topology Snapper & Metrics
// Enforces C0 continuity across line/arc joints with radial consistency preservation.
// ==============================================================================

import { Point2D } from './least-squares-circle-fitter.js';

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
 * Recomputes angular span for an Arc2D after a boundary endpoint modification.
 */
function updateArcAngles(arc: Arc2D): void {
  arc.startAngle = Math.atan2(arc.startPoint[1] - arc.center[1], arc.startPoint[0] - arc.center[0]);
  arc.endAngle = Math.atan2(arc.endPoint[1] - arc.center[1], arc.endPoint[0] - arc.center[0]);
  let span = arc.endAngle - arc.startAngle;
  if (!arc.isClockwise && span < 0) span += 2 * Math.PI;
  if (arc.isClockwise && span > 0) span -= 2 * Math.PI;
  arc.angularSpan = span;
}

/**
 * Snaps adjacent profile segments to guarantee C0 continuous closed loops.
 * Protects arc radii by recomputing angular spans after contact averaging.
 */
export function snapProfileLoop(segments: ProfileSegment2D[], tolerance: number): void {
  if (segments.length <= 1) return;

  for (let k = 0; k < segments.length; k++) {
    const curr = segments[k];
    const next = segments[(k + 1) % segments.length];
    const currEnd = curr.type === 'line' ? curr.end : curr.endPoint;
    const nextStart = next.type === 'line' ? next.start : next.startPoint;

    const gap = Math.hypot(nextStart[0] - currEnd[0], nextStart[1] - currEnd[1]);
    if (gap > 0 && gap < tolerance) {
      const midX = (currEnd[0] + nextStart[0]) * 0.5;
      const midY = (currEnd[1] + nextStart[1]) * 0.5;

      if (curr.type === 'line') {
        curr.end = [midX, midY];
        curr.length = Math.hypot(curr.end[0] - curr.start[0], curr.end[1] - curr.start[1]);
      } else {
        curr.endPoint = [midX, midY];
        updateArcAngles(curr);
      }

      if (next.type === 'line') {
        next.start = [midX, midY];
        next.length = Math.hypot(next.end[0] - next.start[0], next.end[1] - next.start[1]);
      } else {
        next.startPoint = [midX, midY];
        updateArcAngles(next);
      }
    }
  }
}

/**
 * Computes aggregate geometric metrics for an analytical loop.
 */
export function computeProfileLoopMetrics(segments: ProfileSegment2D[]): {
  totalLength: number;
  arcCount: number;
  lineCount: number;
} {
  let totalLength = 0;
  let arcCount = 0;
  let lineCount = 0;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.type === 'arc') {
      arcCount++;
      totalLength += s.radius * Math.abs(s.angularSpan);
    } else {
      lineCount++;
      totalLength += s.length;
    }
  }

  return { totalLength, arcCount, lineCount };
}
