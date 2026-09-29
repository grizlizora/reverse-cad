// ==============================================================================
// src/rsvs/hausdorff/hausdorff-direct.ts — Ultra-Fast Single-Mesh Direct Path
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../../types/geometry.js';
import { SamplePoint } from '../cdf-sampler.js';
import { distancePointToAnalyticalSurface } from '../surface-projections.js';
import { distancePointToMeshTriangleDirect } from '../triangle-projection.js';
import { SurfaceLookupIndex } from './surface-id-index.js';

export function evaluateDirectResidual(
  sample: SamplePoint,
  mesh: RawMesh,
  surfaceIndex: SurfaceLookupIndex
): number {
  const { pt, triangleIndex } = sample;
  const px = pt[0], py = pt[1], pz = pt[2];
  const s = surfaceIndex.getSurface(triangleIndex);

  if (s) {
    if (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus') {
      return distancePointToAnalyticalSurface(px, py, pz, s);
    }
    if (typeof s.meanResidual === 'number' && s.meanResidual > 0) {
      return s.meanResidual;
    }
  }

  return distancePointToMeshTriangleDirect(px, py, pz, mesh.positions, mesh.indices, triangleIndex);
}

export function evaluateHausdorffDirect(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  samples: SamplePoint[],
  surfaceIndex: SurfaceLookupIndex
): { residuals: Float32Array; maxVal: number; sumSq: number } {
  const n = samples.length;
  const residuals = new Float32Array(n);
  let sumSq = 0;
  let maxVal = 0;

  for (let i = 0; i < n; i++) {
    const res = evaluateDirectResidual(samples[i], mesh, surfaceIndex);
    residuals[i] = res;
    sumSq += res * res;
    if (res > maxVal) maxVal = res;
  }

  return { residuals, maxVal, sumSq };
}
