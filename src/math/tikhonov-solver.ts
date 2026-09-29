// ==============================================================================
// src/math/tikhonov-solver.ts — Regularized 3x3 Linear System Solver
// ==============================================================================

/**
 * Solves a 3x3 linear system A * x = b with Tikhonov regularization (lambda)
 * using pure local stack scalar variables with zero heap allocations.
 */
export function solve3x3Tikhonov(A: number[][], b: number[], lambda = 1e-4): number[] {
  let a00 = 0, a01 = 0, a02 = 0;
  let a10 = 0, a11 = 0, a12 = 0;
  let a20 = 0, a21 = 0, a22 = 0;
  let atb0 = 0, atb1 = 0, atb2 = 0;

  for (let k = 0; k < 3; k++) {
    const ak0 = A[k][0], ak1 = A[k][1], ak2 = A[k][2], bk = b[k];
    a00 += ak0 * ak0; a01 += ak0 * ak1; a02 += ak0 * ak2; atb0 += ak0 * bk;
    a10 += ak1 * ak0; a11 += ak1 * ak1; a12 += ak1 * ak2; atb1 += ak1 * bk;
    a20 += ak2 * ak0; a21 += ak2 * ak1; a22 += ak2 * ak2; atb2 += ak2 * bk;
  }

  const trace = (a00 + a11 + a22) / 3.0;
  const damp = lambda * (trace > 1e-8 ? trace : 1.0);
  a00 += damp; a11 += damp; a22 += damp;

  const det =
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20);

  if (Math.abs(det) < 1e-15) return [0, 0, 0];

  const invDet = 1.0 / det;
  const inv00 = (a11 * a22 - a12 * a21) * invDet;
  const inv01 = (a02 * a21 - a01 * a22) * invDet;
  const inv02 = (a01 * a12 - a02 * a11) * invDet;

  const inv10 = (a12 * a20 - a10 * a22) * invDet;
  const inv11 = (a00 * a22 - a02 * a20) * invDet;
  const inv12 = (a02 * a10 - a00 * a12) * invDet;

  const inv20 = (a10 * a21 - a11 * a20) * invDet;
  const inv21 = (a01 * a20 - a00 * a21) * invDet;
  const inv22 = (a00 * a11 - a01 * a10) * invDet;

  return [
    inv00 * atb0 + inv01 * atb1 + inv02 * atb2,
    inv10 * atb0 + inv11 * atb1 + inv12 * atb2,
    inv20 * atb0 + inv21 * atb1 + inv22 * atb2
  ];
}
