// ==============================================================================
// src/rsvs/hausdorff.ts — Two-Stage Hausdorff Distance & Surface-Weighted RMSE Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { computeHausdorffParallel, HausdorffMetrics, quickSelect } from './hausdorff-parallel.js';
import { samplePointsAreaWeighted } from './cdf-sampler.js';

export * from './cdf-sampler.js';
export * from './hausdorff-parallel.js';

export interface HausdorffResult {
  hausdorff99Mm: number; // 99th percentile
  hausdorffMaxMm: number;
  rmseMm: number;
  sampledPointsCount: number;
  residuals?: Float32Array;
}

/**
 * Computes Hausdorff distance and RMSE between the original mesh and
 * the reconstructed CAD surfaces using deterministic Halton sampling and O(N) QuickSelect.
 */
export function computeHausdorffAndRmse(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  sampleCount = 3000
): HausdorffResult {
  const metrics: HausdorffMetrics = computeHausdorffParallel(mesh, surfaces, sampleCount);
  return {
    hausdorff99Mm: metrics.hausdorff99Mm,
    hausdorffMaxMm: metrics.hausdorffMaxMm,
    rmseMm: metrics.rmseMm,
    sampledPointsCount: metrics.sampledPointsCount,
    residuals: metrics.residuals
  };
}
