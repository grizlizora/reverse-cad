// ==============================================================================
// src/rsvs/hausdorff-evaluator.ts — Pure Hausdorff Residual Evaluator Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { samplePointsAreaWeighted, SamplePoint } from './cdf-sampler.js';
import { quickSelect } from '../math/quick-select.js';
import { SurfaceLookupIndex } from './hausdorff/surface-id-index.js';
import { evaluateHausdorffDirect, evaluateDirectResidual } from './hausdorff/hausdorff-direct.js';
import { buildSpatialGrid, evaluateHausdorffCross } from './hausdorff/hausdorff-cross.js';

export interface HausdorffMetrics {
  hausdorff99Mm: number;
  hausdorffMaxMm: number;
  rmseMm: number;
  sampledPointsCount: number;
  residuals: Float32Array;
}

/**
 * Backward compatible point evaluation using Zero-Heap-Allocation scalar arithmetic.
 */
export function evaluatePointResidual(
  sample: SamplePoint,
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  triangleToSurface: Map<number, SurfacePrimitive>
): number {
  const index = new SurfaceLookupIndex(surfaces, mesh.triangleCount);
  return evaluateDirectResidual(sample, mesh, index);
}

/**
 * Computes Hausdorff distance (H99, Hmax) and RMSE using deterministic Halton sampling,
 * fast 3D spatial indexing against ground truth, and O(N) linear-time QuickSelect.
 */
export function evaluateHausdorff(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  sampleCount = 3000,
  rawMesh?: RawMesh
): HausdorffMetrics {
  const sourceMesh = (rawMesh && rawMesh !== mesh && rawMesh.triangleCount > 0) ? rawMesh : mesh;
  const isComparingCrossMesh = sourceMesh !== mesh;
  const { samples } = samplePointsAreaWeighted(sourceMesh, sampleCount);
  const n = samples.length;

  if (n === 0) {
    return {
      hausdorff99Mm: 0,
      hausdorffMaxMm: 0,
      rmseMm: 0,
      sampledPointsCount: 0,
      residuals: new Float32Array(0)
    };
  }

  const surfaceIndex = new SurfaceLookupIndex(surfaces, mesh.triangleCount);

  const evalResult = isComparingCrossMesh
    ? evaluateHausdorffCross(mesh, surfaces, samples, surfaceIndex, buildSpatialGrid(mesh))
    : evaluateHausdorffDirect(mesh, surfaces, samples, surfaceIndex);

  const rmseMm = Math.sqrt(evalResult.sumSq / n);
  const residualsCopy = new Float32Array(evalResult.residuals);
  const k99 = Math.min(n - 1, Math.floor(n * 0.99));
  const h99 = quickSelect(residualsCopy, k99);

  return {
    hausdorff99Mm: h99,
    hausdorffMaxMm: evalResult.maxVal,
    rmseMm,
    sampledPointsCount: n,
    residuals: evalResult.residuals
  };
}
