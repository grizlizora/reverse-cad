// ==============================================================================
// src/kernel/step/planar/collinear-simplifier.ts — Conservative Polygon Loop Simplifier
// ==============================================================================

/**
 * Conservatively dissolves intermediate collinear vertices within flat polygonal loops,
 * preserving all characteristic corner vertices while ensuring boundary manifold integrity.
 */
export function simplifyCollinearLoop(
  loop: number[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  angleEpsilon: number = 1e-4
): number[] {
  const n = loop.length;
  if (n <= 3) return loop;

  const result: number[] = [];

  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n];
    const curr = loop[i];
    const next = loop[(i + 1) % n];

    const d1x = stepVerticesX[curr] - stepVerticesX[prev];
    const d1y = stepVerticesY[curr] - stepVerticesY[prev];
    const d1z = stepVerticesZ[curr] - stepVerticesZ[prev];

    const d2x = stepVerticesX[next] - stepVerticesX[curr];
    const d2y = stepVerticesY[next] - stepVerticesY[curr];
    const d2z = stepVerticesZ[next] - stepVerticesZ[curr];

    const l1 = Math.hypot(d1x, d1y, d1z);
    const l2 = Math.hypot(d2x, d2y, d2z);

    if (l1 < 1e-9 || l2 < 1e-9) {
      continue; // skip coincident vertex
    }

    // Cross product magnitude to detect collinearity
    const cx = d1y * d2z - d1z * d2y;
    const cy = d1z * d2x - d1x * d2z;
    const cz = d1x * d2y - d1y * d2x;
    const crossMag = Math.hypot(cx, cy, cz) / (l1 * l2);

    const dot = (d1x * d2x + d1y * d2y + d1z * d2z) / (l1 * l2);

    // If strictly collinear and in the same forward direction (dot > 0.99999), it is an intermediate vertex
    if (crossMag < angleEpsilon && dot > 0.99999) {
      // Redundant collinear vertex
      continue;
    }

    result.push(curr);
  }

  return result.length >= 3 ? result : loop;
}
