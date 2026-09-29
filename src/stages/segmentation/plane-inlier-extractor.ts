// ==============================================================================
// src/stages/segmentation/plane-inlier-extractor.ts — Analytical Plane Inlier Extractor
// ==============================================================================
// Sweeps triangles against candidate planes with hoisted invariant plane offsets
// ==============================================================================

import { PlaneSurface } from '../../types/geometry.js';
import { fitPlanePCA } from '../../math/index.js';
import { validateMinorPlaneQuality } from './plane-feature-validator.js';
import { PlanarClusterContext, CandidatePlane } from './plane-bucket-builder.js';

export interface PlaneExtractionResult {
  planes: PlaneSurface[];
  inliersExtracted: number;
}

/**
 * Extracts analytical planes exceeding the given area threshold, updating unassigned mask.
 * Optimizes distance checks by hoisting the scalar offset rD = rO · rN.
 */
export function extractPlanesWithThreshold(
  candidatePlanes: CandidatePlane[],
  ctx: PlanarClusterContext,
  areaThreshold: number,
  idGenerator: () => string
): PlaneExtractionResult {
  const { normals, centroids, areas, distTol, cosAngleTol, unassigned } = ctx;
  const planes: PlaneSurface[] = [];
  let inliersExtracted = 0;
  const maxDist = distTol * 1.5;

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
    // Hoist scalar plane offset: rD = rO · rN
    const rD = rOx * rNx + rOy * rNy + rOz * rNz;

    // Sweep all unassigned triangles across the mesh that lie on this fitted plane
    for (let t = 0; t < ctx.totalTriangles; t++) {
      if (!unassigned[t]) continue;
      const t3 = t * 3;
      const dN = normals[t3] * rNx + normals[t3 + 1] * rNy + normals[t3 + 2] * rNz;
      if (dN < cosAngleTol) continue;

      const dPlane = Math.abs(centroids[t3] * rNx + centroids[t3 + 1] * rNy + centroids[t3 + 2] * rNz - rD);
      if (dPlane <= maxDist) {
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
