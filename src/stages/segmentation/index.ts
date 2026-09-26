// ==============================================================================
// src/stages/segmentation/index.ts — Unified Analytical CAD Surface Segmenter
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../../types/geometry.js';
import { computeMeshGeometryBuffers } from '../../math/index.js';
import { CylinderAngularMetrics, computeCylinderAngularMetrics } from './angular-metrics.js';
import {
  PlanarClusterContext,
  CandidatePlane,
  buildPlaneCandidates,
  extractPlanesWithThreshold
} from './plane-clusterer.js';
import { CylinderRansacContext, extractCylindersRANSAC } from './cylinder-ransac.js';
import { stitchCoaxialCylinders } from './coaxial-stitcher.js';

export * from './angular-metrics.js';
export * from './spatial-grid.js';
export * from './plane-clusterer.js';
export * from './cylinder-ransac.js';
export * from './coaxial-stitcher.js';

export interface SegmentationOptions {
  distanceThresholdMm?: number; // e.g. 0.04 mm
  angleThresholdDeg?: number;    // e.g. 15 degrees
  minInliersRatio?: number;      // e.g. 0.01 (at least 1% of triangles)
  maxIterations?: number;        // e.g. 150 iterations per primitive
}

/**
 * Segments mesh triangles into analytical CAD surfaces (planes, cylinders, cones)
 * and freeform patches using zero-allocation in-place RANSAC + PCA refinement.
 */
export function segmentSurfaces(mesh: RawMesh, options: SegmentationOptions = {}): SurfacePrimitive[] {
  const distTol = options.distanceThresholdMm ?? 0.04;
  const angleTolRad = ((options.angleThresholdDeg ?? 5) * Math.PI) / 180.0;
  const cosAngleTol = Math.cos(angleTolRad);
  const sinAngleTolCyl = Math.sin(angleTolRad * 1.5);

  const totalTriangles = mesh.triangleCount;
  const unassigned = new Uint8Array(totalTriangles);
  unassigned.fill(1);

  // Precompute flat TypedArrays for normals, centroids, and areas in one contiguous pass
  const { normals, centroids, areas } = computeMeshGeometryBuffers(
    mesh.positions,
    mesh.indices,
    totalTriangles
  );

  let totalMeshArea = 0;
  for (let t = 0; t < totalTriangles; t++) totalMeshArea += areas[t];
  const minPlaneArea = Math.min(2.0, Math.max(0.05, totalMeshArea * 0.0001));
  const macroPlaneMinArea = Math.max(15.0, totalMeshArea * 0.002);

  const planarCtx: PlanarClusterContext = {
    normals,
    centroids,
    areas,
    totalTriangles,
    totalMeshArea,
    distTol,
    cosAngleTol,
    unassigned
  };

  const surfaces: SurfacePrimitive[] = [];
  let unassignedCount = totalTriangles;
  let surfaceIdCounter = 0;
  const nextId = (prefix: string) => `${prefix}_${++surfaceIdCounter}`;

  // 1. Fast Deterministic Planar Surface Clustering
  const candidatePlanes = buildPlaneCandidates(planarCtx);

  // Pass 1: Macro-planar bucketing (protects large outer bounding box walls & major surfaces)
  const macroResult = extractPlanesWithThreshold(
    candidatePlanes,
    planarCtx,
    macroPlaneMinArea,
    () => nextId('plane')
  );
  surfaces.push(...macroResult.planes);
  unassignedCount -= macroResult.inliersExtracted;

  // Pass 2: In-place RANSAC for Cylindrical Surfaces (Holes, Bosses, Pins, Fillets)
  const cylCtx: CylinderRansacContext = {
    mesh,
    normals,
    centroids,
    areas,
    totalTriangles,
    distTol,
    sinAngleTolCyl,
    unassigned
  };

  const { cylinders, remainingUnassignedCount } = extractCylindersRANSAC(
    cylCtx,
    unassignedCount,
    () => nextId('cylinder')
  );
  surfaces.push(...cylinders);
  unassignedCount = remainingUnassignedCount;

  // Pass 3: Minor planar bucketing (recovers small step chamfers and mounting pads)
  const minorResult = extractPlanesWithThreshold(
    candidatePlanes,
    planarCtx,
    minPlaneArea,
    () => nextId('plane')
  );
  surfaces.push(...minorResult.planes);
  unassignedCount -= minorResult.inliersExtracted;

  // 2b. Coaxial Cylinder Arc Stitching Pass (unifies split cylinder arcs into full cylinders)
  stitchCoaxialCylinders(surfaces, mesh, centroids, normals);

  // 3. Cluster remaining unassigned triangles into Freeform Surfaces
  const remainingInliers: number[] = [];
  let remainingArea = 0;
  for (let t = 0; t < totalTriangles; t++) {
    if (unassigned[t]) {
      remainingInliers.push(t);
      remainingArea += areas[t];
    }
  }

  if (remainingInliers.length > 0) {
    surfaces.push({
      id: nextId('freeform'),
      type: 'freeform',
      inlierIndices: remainingInliers,
      area: remainingArea,
      meanResidual: 0.0
    });
  }

  return surfaces;
}
