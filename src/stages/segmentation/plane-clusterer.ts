// ==============================================================================
// src/stages/segmentation/plane-clusterer.ts — Fast Deterministic Planar Surface Clustering
// ==============================================================================

import { PlaneSurface } from '../../types/geometry.js';
import { fitPlanePCA } from '../../math/index.js';
import { validateMinorPlaneQuality } from './plane-feature-validator.js';

export interface PlanarClusterContext {
  normals: Float32Array;
  centroids: Float32Array;
  areas: Float32Array;
  totalTriangles: number;
  totalMeshArea: number;
  distTol: number;
  cosAngleTol: number;
  unassigned: Uint8Array;
}

export interface CandidatePlane {
  key: string;
  tris: number[];
  area: number;
}

/**
 * Builds candidate planar buckets via O(N) normal + offset discretization.
 */
export function buildPlaneCandidates(ctx: PlanarClusterContext): CandidatePlane[] {
  const { normals, centroids, areas, totalTriangles, totalMeshArea } = ctx;
  const planeBuckets = new Map<string, number[]>();

  for (let t = 0; t < totalTriangles; t++) {
    const t3 = t * 3;
    let nx = normals[t3], ny = normals[t3 + 1], nz = normals[t3 + 2];
    const cx = centroids[t3], cy = centroids[t3 + 1], cz = centroids[t3 + 2];

    // Canonical orthogonal snapping (within ~3.6 deg)
    if (Math.abs(nx) > 0.998) { nx = Math.sign(nx); ny = 0; nz = 0; }
    else if (Math.abs(ny) > 0.998) { nx = 0; ny = Math.sign(ny); nz = 0; }
    else if (Math.abs(nz) > 0.998) { nx = 0; ny = 0; nz = Math.sign(nz); }

    const dist = nx * cx + ny * cy + nz * cz;
    const qnx = Math.abs(nx) < 1e-4 ? 0 : Math.round(nx * 20) / 20;
    const qny = Math.abs(ny) < 1e-4 ? 0 : Math.round(ny * 20) / 20;
    const qnz = Math.abs(nz) < 1e-4 ? 0 : Math.round(nz * 20) / 20;
    const qd = Math.round(dist * 5) / 5;
    const key = `${qnx.toFixed(2)},${qny.toFixed(2)},${qnz.toFixed(2)}:${qd.toFixed(2)}`;

    let list = planeBuckets.get(key);
    if (!list) {
      list = [];
      planeBuckets.set(key, list);
    }
    list.push(t);
  }

  const minPlaneArea = Math.min(2.0, Math.max(0.05, totalMeshArea * 0.0001));
  const candidatePlanes: CandidatePlane[] = [];

  for (const [key, tris] of planeBuckets.entries()) {
    let bucketArea = 0;
    for (let i = 0; i < tris.length; i++) bucketArea += areas[tris[i]];
    if (bucketArea >= minPlaneArea) {
      candidatePlanes.push({ key, tris, area: bucketArea });
    }
  }

  candidatePlanes.sort((a, b) => b.area - a.area);
  return candidatePlanes;
}

/**
 * Extracts analytical planes exceeding the given area threshold, updating unassigned mask.
 */
export function extractPlanesWithThreshold(
  candidatePlanes: CandidatePlane[],
  ctx: PlanarClusterContext,
  areaThreshold: number,
  idGenerator: () => string
): { planes: PlaneSurface[]; inliersExtracted: number } {
  const { normals, centroids, areas, distTol, cosAngleTol, unassigned } = ctx;
  const planes: PlaneSurface[] = [];
  let inliersExtracted = 0;

  for (let c = 0; c < candidatePlanes.length; c++) {
    const cand = candidatePlanes[c];
    if (cand.area < areaThreshold) continue;

    const unassignedTris: number[] = [];
    for (let k = 0; k < cand.tris.length; k++) {
      const t = cand.tris[k];
      if (unassigned[t]) unassignedTris.push(t);
    }
    if (unassignedTris.length === 0) continue;

    let candArea = 0;
    for (let k = 0; k < unassignedTris.length; k++) {
      candArea += areas[unassignedTris[k]];
    }
    if (candArea < areaThreshold) continue;

    let rNx: number, rNy: number, rNz: number;
    let rOx: number, rOy: number, rOz: number;

    if (unassignedTris.length >= 3) {
      const refined = fitPlanePCA(centroids, unassignedTris);
      const seedNx = normals[unassignedTris[0] * 3];
      const seedNy = normals[unassignedTris[0] * 3 + 1];
      const seedNz = normals[unassignedTris[0] * 3 + 2];
      if (refined.normal[0] * seedNx + refined.normal[1] * seedNy + refined.normal[2] * seedNz < 0) {
        refined.normal[0] = -refined.normal[0];
        refined.normal[1] = -refined.normal[1];
        refined.normal[2] = -refined.normal[2];
      }
      rNx = refined.normal[0]; rNy = refined.normal[1]; rNz = refined.normal[2];
      rOx = refined.origin[0]; rOy = refined.origin[1]; rOz = refined.origin[2];
    } else {
      const t0 = unassignedTris[0] * 3;
      rNx = normals[t0]; rNy = normals[t0 + 1]; rNz = normals[t0 + 2];
      rOx = centroids[t0]; rOy = centroids[t0 + 1]; rOz = centroids[t0 + 2];
    }

    const inliers: number[] = [];
    let planeArea = 0;
    for (let k = 0; k < unassignedTris.length; k++) {
      const t = unassignedTris[k];
      const t3 = t * 3;
      const dN = normals[t3] * rNx + normals[t3 + 1] * rNy + normals[t3 + 2] * rNz;
      if (dN < cosAngleTol) continue;
      const dx = centroids[t3] - rOx;
      const dy = centroids[t3 + 1] - rOy;
      const dz = centroids[t3 + 2] - rOz;
      const dPlane = Math.abs(dx * rNx + dy * rNy + dz * rNz);
      if (dPlane <= distTol * 1.5) {
        inliers.push(t);
        unassigned[t] = 0;
        planeArea += areas[t];
      }
    }

    const isMinorPlane = areaThreshold < Math.max(15.0, ctx.totalMeshArea * 0.002);
    const isValid = planeArea >= areaThreshold && (
      !isMinorPlane || validateMinorPlaneQuality(
        inliers, planeArea, rOx, rOy, rOz, rNx, rNy, rNz, centroids, normals
      )
    );

    if (isValid) {
      inliersExtracted += inliers.length;
      planes.push({
        id: idGenerator(),
        type: 'plane',
        origin: [rOx, rOy, rOz],
        normal: [rNx, rNy, rNz],
        inlierIndices: inliers,
        area: planeArea,
        meanResidual: distTol * 0.5
      });
    } else {
      for (let k = 0; k < inliers.length; k++) {
        unassigned[inliers[k]] = 1;
      }
    }
  }

  return { planes, inliersExtracted };
}
