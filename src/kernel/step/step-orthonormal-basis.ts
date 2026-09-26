// ==============================================================================
// src/kernel/step/step-orthonormal-basis.ts — Orthonormal Basis & Float Sanitizer
// ==============================================================================

import { Vector3D } from '../../types/geometry.js';

/**
 * Sanitizes floating point value to ensure -0 is normalized to +0 and formatted
 * strictly without IEEE 754 signed zero artifact ("-0.00000").
 */
export function formatStepFloat(val: number, decimals: number = 5): string {
  const cutoff = 0.5 * Math.pow(10, -decimals);
  if (Math.abs(val) < cutoff || Object.is(val, -0)) {
    return (0).toFixed(decimals);
  }
  const str = val.toFixed(decimals);
  return str.startsWith('-0.00') && parseFloat(str) === 0 ? (0).toFixed(decimals) : str;
}

export interface OrthonormalBasis {
  dirZ: Vector3D;
  dirX: Vector3D;
}

/**
 * Computes an orthonormal coordinate system (Z, X) from a primary normal direction
 * using Gram-Schmidt orthogonalization.
 */
export function computeOrthonormalBasis(normal: Vector3D): OrthonormalBasis {
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  const pnx = len > 1e-12 ? normal[0] / len : 0;
  const pny = len > 1e-12 ? normal[1] / len : 0;
  const pnz = len > 1e-12 ? normal[2] / len : 1;

  let rx = 1.0, ry = 0.0, rz = 0.0;
  if (Math.abs(pnx) > 0.8) {
    rx = 0.0;
    ry = 1.0;
    rz = 0.0;
  }

  const rDotA = rx * pnx + ry * pny + rz * pnz;
  const ox = rx - rDotA * pnx;
  const oy = ry - rDotA * pny;
  const oz = rz - rDotA * pnz;
  const oLen = Math.hypot(ox, oy, oz);

  const ux = oLen > 1e-12 ? ox / oLen : 1;
  const uy = oLen > 1e-12 ? oy / oLen : 0;
  const uz = oLen > 1e-12 ? oz / oLen : 0;

  return {
    dirZ: [pnx, pny, pnz],
    dirX: [ux, uy, uz]
  };
}
