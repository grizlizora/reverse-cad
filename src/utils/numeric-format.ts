// ==============================================================================
// src/utils/numeric-format.ts — High-Performance Numeric Rounding Utilities
// ==============================================================================

/**
 * Rounds a number to 2 decimal places without string conversions.
 */
export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Rounds a number to 3 decimal places without string conversions.
 */
export function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Rounds a number to 4 decimal places without string conversions.
 */
export function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/**
 * Rounds a 3D coordinate vector to N decimal places.
 */
export function roundVector3(vec: [number, number, number], decimals: number = 4): [number, number, number] {
  const factor = Math.pow(10, decimals);
  return [
    Math.round(vec[0] * factor) / factor,
    Math.round(vec[1] * factor) / factor,
    Math.round(vec[2] * factor) / factor
  ];
}
