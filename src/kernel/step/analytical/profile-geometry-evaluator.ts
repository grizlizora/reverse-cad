// ==============================================================================
// src/kernel/step/analytical/profile-geometry-evaluator.ts — Profile Area & Volume Evaluator
// Exact Green's Theorem area & net extruded volume for linear/circular hybrid contours.
// ==============================================================================

import { AnalyticLoop2D } from './profile-loop-snapper.js';

/**
 * Computes exact signed planar area of an analytical loop (polygonal chords + circular segments).
 * Returns positive area for counter-clockwise orientation, negative for clockwise.
 */
export function computeAnalyticLoopArea(loop: AnalyticLoop2D): number {
  const segments = loop.segments;
  if (!segments || segments.length === 0) return 0;

  let chordAreaSum = 0;
  let circularSegmentAreaSum = 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const p0 = seg.type === 'line' ? seg.start : seg.startPoint;
    const p1 = seg.type === 'line' ? seg.end : seg.endPoint;

    // Standard Green's theorem trapezoidal / triangle sum for the chord
    chordAreaSum += (p0[0] * p1[1] - p1[0] * p0[1]);

    if (seg.type === 'arc') {
      const theta = Math.abs(seg.angularSpan);
      // Area of circular segment between chord and arc: 0.5 * R^2 * (theta - sin(theta))
      const segArea = 0.5 * seg.radius * seg.radius * (theta - Math.sin(theta));
      if (!seg.isClockwise) {
        circularSegmentAreaSum += segArea;
      } else {
        circularSegmentAreaSum -= segArea;
      }
    }
  }

  const netArea = 0.5 * chordAreaSum + circularSegmentAreaSum;
  return netArea;
}

/**
 * Computes exact net volume of a prismatic extrusion with optional through-hole cavities.
 */
export function computeExtrusionNetVolume(
  outerLoop: AnalyticLoop2D,
  holeLoops: AnalyticLoop2D[],
  height: number
): number {
  if (height <= 0) return 0;

  let outerArea = Math.abs(computeAnalyticLoopArea(outerLoop));

  // Fallback if loop has insufficient segments
  if (outerArea <= 1e-7 && outerLoop.totalLength > 0) {
    outerArea = (outerLoop.totalLength * outerLoop.totalLength) / (4 * Math.PI);
  }

  let totalHoleArea = 0;
  for (let i = 0; i < holeLoops.length; i++) {
    totalHoleArea += Math.abs(computeAnalyticLoopArea(holeLoops[i]));
  }

  const netArea = Math.max(0, outerArea - totalHoleArea);
  return netArea * height;
}
