// ==============================================================================
// src/rsvs/hausdorff-evaluator.ts — Pure Hausdorff Residual Evaluator
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { samplePointsAreaWeighted, SamplePoint } from './cdf-sampler.js';
import { distancePointToAnalyticalSurface } from './surface-projections.js';
import { distancePointToMeshTriangleDirect } from './triangle-projection.js';
import { quickSelect } from '../math/quick-select.js';

export interface HausdorffMetrics {
  hausdorff99Mm: number;
  hausdorffMaxMm: number;
  rmseMm: number;
  sampledPointsCount: number;
  residuals: Float32Array;
}

/**
 * Evaluates residual distance for a single query point against assigned or nearest surfaces
 * using Zero-Heap-Allocation scalar arithmetic.
 */
export function evaluatePointResidual(
  sample: SamplePoint,
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  triangleToSurface: Map<number, SurfacePrimitive>
): number {
  const { pt, triangleIndex } = sample;
  const px = pt[0], py = pt[1], pz = pt[2];
  const s = triangleToSurface.get(triangleIndex);

  if (s) {
    if (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus') {
      return distancePointToAnalyticalSurface(px, py, pz, s);
    } else {
      // Freeform: project to triangle facets with zero-allocation direct buffer reader
      return distancePointToMeshTriangleDirect(px, py, pz, mesh.positions, mesh.indices, triangleIndex);
    }
  }

  // Unassigned point: find minimum distance across all surfaces with zero heap allocations
  let minD = Infinity;
  for (let idx = 0; idx < surfaces.length; idx++) {
    const surf = surfaces[idx];
    if (surf.type === 'plane' || surf.type === 'cylinder' || surf.type === 'cone' || surf.type === 'torus') {
      const d = distancePointToAnalyticalSurface(px, py, pz, surf);
      if (d < minD) minD = d;
    }
  }

  // If no analytical surfaces match, project to source triangle
  if (minD === Infinity) {
    minD = distancePointToMeshTriangleDirect(px, py, pz, mesh.positions, mesh.indices, triangleIndex);
  }

  return minD;
}

/**
 * Computes Hausdorff distance (H99, Hmax) and RMSE using deterministic Halton sampling
 * and O(N) linear-time QuickSelect.
 */
export function evaluateHausdorff(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  sampleCount = 3000
): HausdorffMetrics {
  const { samples } = samplePointsAreaWeighted(mesh, sampleCount);
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

  // Map triangle indices to surfaces
  const triangleToSurface = new Map<number, SurfacePrimitive>();
  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    const inliers = s.inlierIndices;
    for (let i = 0; i < inliers.length; i++) {
      triangleToSurface.set(inliers[i], s);
    }
  }

  const residuals = new Float32Array(n);
  let sumSq = 0;
  let maxVal = 0;

  for (let i = 0; i < n; i++) {
    const res = evaluatePointResidual(samples[i], mesh, surfaces, triangleToSurface);
    residuals[i] = res;
    sumSq += res * res;
    if (res > maxVal) maxVal = res;
  }

  const rmseMm = Math.sqrt(sumSq / n);

  // Copy residuals before QuickSelect (to preserve exact residual sequence)
  const residualsCopy = new Float32Array(residuals);
  const k99 = Math.min(n - 1, Math.floor(n * 0.99));
  const h99 = quickSelect(residualsCopy, k99);

  return {
    hausdorff99Mm: h99,
    hausdorffMaxMm: maxVal,
    rmseMm,
    sampledPointsCount: n,
    residuals
  };
}
