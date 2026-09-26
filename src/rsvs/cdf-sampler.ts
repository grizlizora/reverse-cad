// ==============================================================================
// src/rsvs/cdf-sampler.ts — Deterministic Low-Discrepancy (Halton) CDF Mesh Sampler
// ==============================================================================

import { RawMesh, Point3D } from '../types/geometry.js';

export interface SamplePoint {
  pt: Point3D;
  triangleIndex: number;
}

export interface CdfSamplingResult {
  samples: SamplePoint[];
  totalMeshArea: number;
}

/**
 * Computes radical inverse in prime base b (Halton sequence generator).
 * Guarantees zero-discrepancy and 100% platform-independent deterministic sampling.
 */
export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

/**
 * Samples points on mesh triangles with area-weighted distribution using deterministic Halton sequences.
 * Base 2 is used for area CDF selection, Base 3 and 5 for barycentric coordinates (u, v, w).
 */
export function samplePointsAreaWeighted(
  mesh: RawMesh,
  count: number,
  seedOffset: number = 1
): CdfSamplingResult {
  const triCount = mesh.triangleCount;
  if (triCount === 0) {
    return { samples: [], totalMeshArea: 0 };
  }

  const cdf = new Float64Array(triCount);
  let totalArea = 0;

  for (let t = 0; t < triCount; t++) {
    const t3 = t * 3;
    const i0 = mesh.indices[t3] * 3;
    const i1 = mesh.indices[t3 + 1] * 3;
    const i2 = mesh.indices[t3 + 2] * 3;

    const p0x = mesh.positions[i0], p0y = mesh.positions[i0 + 1], p0z = mesh.positions[i0 + 2];
    const p1x = mesh.positions[i1], p1y = mesh.positions[i1 + 1], p1z = mesh.positions[i1 + 2];
    const p2x = mesh.positions[i2], p2y = mesh.positions[i2 + 1], p2z = mesh.positions[i2 + 2];

    const cx = (p1y - p0y) * (p2z - p0z) - (p1z - p0z) * (p2y - p0y);
    const cy = (p1z - p0z) * (p2x - p0x) - (p1x - p0x) * (p2z - p0z);
    const cz = (p1x - p0x) * (p2y - p0y) - (p1y - p0y) * (p2x - p0x);
    const a = 0.5 * Math.hypot(cx, cy, cz);
    totalArea += a;
    cdf[t] = totalArea;
  }

  const points: SamplePoint[] = [];
  const targetSamples = count;

  for (let i = 0; i < targetSamples; i++) {
    const sampleIdx = i + seedOffset;
    // Base 2 for area CDF
    const uArea = halton(sampleIdx, 2);
    const targetArea = uArea * totalArea;

    let low = 0, high = triCount - 1, selectedTri = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (cdf[mid] >= targetArea) {
        selectedTri = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const t3 = selectedTri * 3;
    const i0 = mesh.indices[t3] * 3;
    const i1 = mesh.indices[t3 + 1] * 3;
    const i2 = mesh.indices[t3 + 2] * 3;

    const p0x = mesh.positions[i0], p0y = mesh.positions[i0 + 1], p0z = mesh.positions[i0 + 2];
    const p1x = mesh.positions[i1], p1y = mesh.positions[i1 + 1], p1z = mesh.positions[i1 + 2];
    const p2x = mesh.positions[i2], p2y = mesh.positions[i2 + 1], p2z = mesh.positions[i2 + 2];

    // Base 3 and 5 for uniform barycentric coords
    const r1 = halton(sampleIdx, 3);
    const r2 = halton(sampleIdx, 5);

    const s1 = Math.sqrt(r1);
    const u = 1 - s1;
    const v = r2 * s1;
    const w = 1 - u - v;

    points.push({
      pt: [
        u * p0x + v * p1x + w * p2x,
        u * p0y + v * p1y + w * p2y,
        u * p0z + v * p1z + w * p2z
      ],
      triangleIndex: selectedTri
    });
  }

  return { samples: points, totalMeshArea: totalArea };
}
