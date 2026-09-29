// ==============================================================================
// src/stages/decimation/collapse-validator.ts — Unified Normal Flip & Sliver Guard
// ==============================================================================

export interface CollapseValidationContext {
  positions: Float32Array;
  indices: Uint32Array;
  faceNormals: Float32Array;
  vTris: Uint32Array;
  head: Int32Array;
  next: Int32Array;
  findRoot: (v: number) => number;
}

export interface CollapseValidationOptions {
  minCosNormalDev: number;    // e.g. 0.98 for coplanar, cosMaxDev for QEM
  maxInwardDisp?: number;     // Symmetric displacement threshold for QEM bore guard
  minHeightRatio?: number;    // Minimum triangle height ratio to prevent slivers (e.g. 0.01)
}

/**
 * Checks whether collapsing edge (vRemove -> vTarget) causes normal flips,
 * inverted face orientations, or needle sliver triangles.
 * Zero heap allocations, pure scalar computation for V8 TurboFan inlining.
 */
export function validateCollapseSafety(
  ctx: CollapseValidationContext,
  vTarget: number,
  vRemove: number,
  options: CollapseValidationOptions
): boolean {
  const { positions, indices, faceNormals, vTris, head, next, findRoot } = ctx;
  const pTargetX = positions[vTarget * 3];
  const pTargetY = positions[vTarget * 3 + 1];
  const pTargetZ = positions[vTarget * 3 + 2];

  let node = head[vRemove];
  if (node === -1) return false;

  const minCos = options.minCosNormalDev;
  const maxDisp = options.maxInwardDisp;
  const minHeightRatio = options.minHeightRatio;

  while (node !== -1) {
    const t = vTris[node];
    node = next[node];

    const t3 = t * 3;
    const v0 = findRoot(indices[t3]);
    const v1 = findRoot(indices[t3 + 1]);
    const v2 = findRoot(indices[t3 + 2]);

    const newI0 = v0 === vRemove ? vTarget : v0;
    const newI1 = v1 === vRemove ? vTarget : v1;
    const newI2 = v2 === vRemove ? vTarget : v2;

    // Degenerate triangle collapsed on the edge itself — valid collapse
    if (newI0 === newI1 || newI1 === newI2 || newI2 === newI0) {
      continue;
    }

    const p0x = newI0 === vTarget ? pTargetX : positions[newI0 * 3];
    const p0y = newI0 === vTarget ? pTargetY : positions[newI0 * 3 + 1];
    const p0z = newI0 === vTarget ? pTargetZ : positions[newI0 * 3 + 2];

    const p1x = newI1 === vTarget ? pTargetX : positions[newI1 * 3];
    const p1y = newI1 === vTarget ? pTargetY : positions[newI1 * 3 + 1];
    const p1z = newI1 === vTarget ? pTargetZ : positions[newI1 * 3 + 2];

    const p2x = newI2 === vTarget ? pTargetX : positions[newI2 * 3];
    const p2y = newI2 === vTarget ? pTargetY : positions[newI2 * 3 + 1];
    const p2z = newI2 === vTarget ? pTargetZ : positions[newI2 * 3 + 2];

    const fnx = faceNormals[t3];
    const fny = faceNormals[t3 + 1];
    const fnz = faceNormals[t3 + 2];

    // Check centroid normal displacement if configured (e.g. QEM bore guard)
    if (maxDisp !== undefined) {
      const oldC0x = (positions[v0 * 3] + positions[v1 * 3] + positions[v2 * 3]) / 3.0;
      const oldC0y = (positions[v0 * 3 + 1] + positions[v1 * 3 + 1] + positions[v2 * 3 + 1]) / 3.0;
      const oldC0z = (positions[v0 * 3 + 2] + positions[v1 * 3 + 2] + positions[v2 * 3 + 2]) / 3.0;
      const newCx = (p0x + p1x + p2x) / 3.0;
      const newCy = (p0y + p1y + p2y) / 3.0;
      const newCz = (p0z + p1z + p2z) / 3.0;
      const dispNorm = (newCx - oldC0x) * fnx + (newCy - oldC0y) * fny + (newCz - oldC0z) * fnz;
      if (Math.abs(dispNorm) > maxDisp) return false;
    }

    // New face normal calculation
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) return false;

    const dotVal = (nx * fnx + ny * fny + nz * fnz) / len;
    if (dotVal < minCos) {
      return false;
    }

    // Check aspect ratio to prevent creating sliver triangles if configured
    if (minHeightRatio !== undefined) {
      const e01x = p1x - p0x, e01y = p1y - p0y, e01z = p1z - p0z;
      const e12x = p2x - p1x, e12y = p2y - p1y, e12z = p2z - p1z;
      const e20x = p0x - p2x, e20y = p0y - p2y, e20z = p0z - p2z;

      const l01 = Math.sqrt(e01x * e01x + e01y * e01y + e01z * e01z);
      const l12 = Math.sqrt(e12x * e12x + e12y * e12y + e12z * e12z);
      const l20 = Math.sqrt(e20x * e20x + e20y * e20y + e20z * e20z);
      const maxEdge = Math.max(l01, l12, l20);

      const crossX = e01y * (-e20z) - e01z * (-e20y);
      const crossY = e01z * (-e20x) - e01x * (-e20z);
      const crossZ = e01x * (-e20y) - e01y * (-e20x);
      const area2 = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      const minHeight = area2 / (maxEdge + 1e-12);
      if (minHeight < minHeightRatio * maxEdge) {
        return false;
      }
    }
  }

  return true;
}
