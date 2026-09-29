// ==============================================================================
// src/math/mesh-volume-integrator.ts — Gauss Divergence & Scaled Volume Integrator
// ==============================================================================

/**
 * Zero-allocation direct scalar calculation of triangle area from typed vertex buffer.
 */
export function triangleAreaDirect(
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number {
  const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
  const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
  const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];

  const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
  const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

  const cx = e1y * e2z - e1z * e2y;
  const cy = e1z * e2x - e1x * e2z;
  const cz = e1x * e2y - e1y * e2x;

  return 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
}

/**
 * Zero-allocation direct scalar calculation of signed tetrahedron volume (Gauss Divergence)
 * from typed vertex buffer relative to origin [0,0,0].
 */
export function signedTetrahedronVolumeDirect(
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number {
  const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
  const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
  const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];

  const crossX = p1y * p2z - p1z * p2y;
  const crossY = p1z * p2x - p1x * p2z;
  const crossZ = p1x * p2y - p1y * p2x;

  return (p0x * crossX + p0y * crossY + p0z * crossZ) / 6.0;
}

/**
 * Robust Zero-Allocation Centroid-Shifted Gauss Divergence volume calculation.
 * Prevents catastrophic cancellation on meshes far from global [0,0,0].
 */
export function computeShellVolumeAndAreaDirect(
  positions: Float32Array,
  indices: Uint32Array,
  triangleIndices: number[]
): { volume: number; area: number } {
  if (triangleIndices.length === 0) return { volume: 0, area: 0 };

  const firstTri = triangleIndices[0];
  const refIdx = indices[firstTri * 3] * 3;
  const rx = positions[refIdx];
  const ry = positions[refIdx + 1];
  const rz = positions[refIdx + 2];

  let signedVol6 = 0;
  let totalArea = 0;

  for (let k = 0; k < triangleIndices.length; k++) {
    const t = triangleIndices[k];
    const i0 = indices[t * 3] * 3;
    const i1 = indices[t * 3 + 1] * 3;
    const i2 = indices[t * 3 + 2] * 3;

    const p0x = positions[i0] - rx, p0y = positions[i0 + 1] - ry, p0z = positions[i0 + 2] - rz;
    const p1x = positions[i1] - rx, p1y = positions[i1 + 1] - ry, p1z = positions[i1 + 2] - rz;
    const p2x = positions[i2] - rx, p2y = positions[i2 + 1] - ry, p2z = positions[i2 + 2] - rz;

    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;

    totalArea += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);

    const cpX = p1y * p2z - p1z * p2y;
    const cpY = p1z * p2x - p1x * p2z;
    const cpZ = p1x * p2y - p1y * p2x;
    signedVol6 += (p0x * cpX + p0y * cpY + p0z * cpZ);
  }

  return { volume: signedVol6 / 6.0, area: totalArea };
}
