// ==============================================================================
// src/rsvs/hausdorff/hausdorff-cross.ts — 2-Ring Search Cross-Mesh Evaluator
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../../types/geometry.js';
import { SamplePoint } from '../cdf-sampler.js';
import { distancePointToAnalyticalSurface } from '../surface-projections.js';
import { distancePointToMeshTriangleDirect } from '../triangle-projection.js';
import { SpatialCandidateGrid } from './spatial-candidate-grid.js';
import { SurfaceLookupIndex } from './surface-id-index.js';

export function buildSpatialGrid(mesh: RawMesh): SpatialCandidateGrid {
  const diag = Math.max(1e-3, mesh.boundingBox?.diagonal ?? 100);
  const gridResolution = Math.min(32.0, Math.max(8.0, Math.cbrt(Math.max(64, mesh.triangleCount))));
  const cellSize = Math.max(diag * 1e-4, diag / gridResolution);
  const pad = cellSize * 0.25;

  const grid = new SpatialCandidateGrid(cellSize, mesh.triangleCount);
  const mPos = mesh.positions;
  const mIdx = mesh.indices;
  const mTris = mesh.triangleCount;

  for (let t = 0; t < mTris; t++) {
    const t3 = t * 3;
    const v0 = mIdx[t3] * 3, v1 = mIdx[t3 + 1] * 3, v2 = mIdx[t3 + 2] * 3;
    const minX = Math.min(mPos[v0], mPos[v1], mPos[v2]) - pad;
    const minY = Math.min(mPos[v0 + 1], mPos[v1 + 1], mPos[v2 + 1]) - pad;
    const minZ = Math.min(mPos[v0 + 2], mPos[v1 + 2], mPos[v2 + 2]) - pad;
    const maxX = Math.max(mPos[v0], mPos[v1], mPos[v2]) + pad;
    const maxY = Math.max(mPos[v0 + 1], mPos[v1 + 1], mPos[v2 + 1]) + pad;
    const maxZ = Math.max(mPos[v0 + 2], mPos[v1 + 2], mPos[v2 + 2]) + pad;
    grid.insertBox(t, minX, minY, minZ, maxX, maxY, maxZ);
  }

  return grid;
}

export function evaluateHausdorffCross(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  samples: SamplePoint[],
  surfaceIndex: SurfaceLookupIndex,
  grid: SpatialCandidateGrid
): { residuals: Float32Array; maxVal: number; sumSq: number } {
  const n = samples.length;
  const residuals = new Float32Array(n);
  const mPos = mesh.positions;
  const mIdx = mesh.indices;
  let sumSq = 0;
  let maxVal = 0;

  for (let i = 0; i < n; i++) {
    const sample = samples[i];
    const px = sample.pt[0], py = sample.pt[1], pz = sample.pt[2];
    let minD = Infinity;

    // Expand search up to 2 concentric rings without allocating any arrays
    const found = grid.queryRingsDeduplicated(px, py, pz, 2, (t: number) => {
      const d = distancePointToMeshTriangleDirect(px, py, pz, mPos, mIdx, t);
      if (d < minD) minD = d;
      const s = surfaceIndex.getSurface(t);
      if (s && (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus')) {
        const ds = distancePointToAnalyticalSurface(px, py, pz, s);
        if (ds < minD) minD = ds;
      }
    });

    // Safe fallback ONLY if point is completely outside 2 rings (isolated anomaly)
    if (!found || minD === Infinity) {
      for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
        const s = surfaces[sIdx];
        if (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus') {
          const ds = distancePointToAnalyticalSurface(px, py, pz, s);
          if (ds < minD) minD = ds;
        }
      }
    }

    const res = minD === Infinity ? 0 : minD;
    residuals[i] = res;
    sumSq += res * res;
    if (res > maxVal) maxVal = res;
  }

  return { residuals, maxVal, sumSq };
}
