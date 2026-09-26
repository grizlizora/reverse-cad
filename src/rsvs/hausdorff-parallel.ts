// ==============================================================================
// src/rsvs/hausdorff-parallel.ts — Parallel Hausdorff Evaluator Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { quickSelect } from '../math/quick-select.js';
import {
  HausdorffMetrics,
  evaluatePointResidual,
  evaluateHausdorff
} from './hausdorff-evaluator.js';

export {
  HausdorffMetrics,
  quickSelect,
  evaluatePointResidual
};

/**
 * Computes Hausdorff distance (H99, Hmax) and RMSE using deterministic Halton sampling
 * and O(N) linear-time QuickSelect.
 */
export function computeHausdorffParallel(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  sampleCount = 3000
): HausdorffMetrics {
  return evaluateHausdorff(mesh, surfaces, sampleCount);
}
