// ==============================================================================
// src/stages/segmentation/cylinder-ransac-coordinator.ts — Adaptive RANSAC Coordinator
// ==============================================================================

import { RawMesh, CylinderSurface, Point3D, Vector3D } from '../../types/geometry.js';
import { computeCylinderAngularMetrics } from './angular-metrics.js';
import { FastPRNG, pickRandomUnassigned } from './cylinder-sampler.js';
import { scoreCylinderCandidate } from './cylinder-scoring.js';
import { pickLocalizedNeighborBuffers } from './spatial-grid.js';
import { generateCylinderHypothesis } from './cylinder-hypothesis.js';
import { validateCylinderFeature, pruneCylinderInliers } from './cylinder-feature-validator.js';

export interface CylinderRansacContext {
  mesh: RawMesh;
  normals: Float32Array;
  centroids: Float32Array;
  areas: Float32Array;
  totalTriangles: number;
  distTol: number;
  sinAngleTolCyl: number;
  unassigned: Uint8Array;
}

/**
 * Executes high-performance, deterministic adaptive RANSAC for cylindrical primitive detection.
 * Uses exact hypothesis generator supporting antipodal points and zero-allocation scoring.
 */
export function extractCylindersRANSACInternal(
  ctx: CylinderRansacContext,
  initialUnassignedCount: number,
  idGenerator: () => string
): { cylinders: CylinderSurface[]; remainingUnassignedCount: number } {
  const { mesh, normals, centroids, areas, totalTriangles, distTol, sinAngleTolCyl, unassigned } = ctx;
  const cylinders: CylinderSurface[] = [];
  let unassignedCount = initialUnassignedCount;

  const meshBounds = mesh.boundingBox;
  const diagX = meshBounds.max[0] - meshBounds.min[0];
  const diagY = meshBounds.max[1] - meshBounds.min[1];
  const diagZ = meshBounds.max[2] - meshBounds.min[2];
  const meshDiag = Math.hypot(diagX, diagY, diagZ);
  const maxAllowedRadius = Math.max(25.0, meshDiag * 0.35);
  const minCylInliers = Math.max(16, Math.min(300, Math.floor(totalTriangles * 0.002)));

  const prng = new FastPRNG(0x42f00d);
  const candidateInlierBuffer = new Int32Array(totalTriangles);
  const bestInlierBuffer = new Int32Array(totalTriangles);

  let cylFailures = 0;
  const maxConsecutiveFailures = 8;

  while (unassignedCount > totalTriangles * 0.02 && cylFailures < maxConsecutiveFailures) {
    let bestInlierCount = 0;
    let bestAxisOrigin: Point3D = [0, 0, 0];
    let bestAxisDir: Vector3D = [0, 0, 1];
    let bestRadius = 0;

    let maxIters = 35;

    for (let iter = 0; iter < maxIters; iter++) {
      const seedIdx = pickRandomUnassigned(unassigned, prng, totalTriangles);
      if (seedIdx < 0) break;

      const s3 = seedIdx * 3;
      const p0: Point3D = [centroids[s3], centroids[s3 + 1], centroids[s3 + 2]];
      const n0: Vector3D = [normals[s3], normals[s3 + 1], normals[s3 + 2]];

      const neighborIdx = pickLocalizedNeighborBuffers(unassigned, centroids, p0, 30.0);
      if (neighborIdx < 0) continue;

      const n3 = neighborIdx * 3;
      const p1: Point3D = [centroids[n3], centroids[n3 + 1], centroids[n3 + 2]];
      const n1: Vector3D = [normals[n3], normals[n3 + 1], normals[n3 + 2]];

      // Generate exact hypothesis supporting both regular and antipodal cylinder pairs
      const hyp = generateCylinderHypothesis(p0, n0, p1, n1, 0.25, maxAllowedRadius);
      if (!hyp) continue;

      const score = scoreCylinderCandidate(
        mesh,
        unassigned,
        hyp.axisOrigin,
        hyp.axisDirection,
        hyp.radius,
        distTol * 1.5,
        sinAngleTolCyl,
        candidateInlierBuffer,
        centroids,
        normals
      );

      if (score.inlierCount > bestInlierCount) {
        bestInlierCount = score.inlierCount;
        bestAxisOrigin = hyp.axisOrigin;
        bestAxisDir = hyp.axisDirection;
        bestRadius = hyp.radius;

        bestInlierBuffer.set(candidateInlierBuffer.subarray(0, bestInlierCount));

        // Adaptive iteration recalculation
        const inlierFraction = bestInlierCount / Math.max(1, unassignedCount);
        if (inlierFraction > 0.02) {
          const w2 = Math.min(0.99, inlierFraction * inlierFraction);
          const adaptiveK = Math.ceil(Math.log(1.0 - 0.99) / Math.log(1.0 - w2));
          if (adaptiveK < maxIters) {
            maxIters = Math.max(iter + 5, adaptiveK);
          }
        }
      }
    }

    if (bestInlierCount >= minCylInliers) {
      const rawInliers: number[] = new Array(bestInlierCount);
      for (let i = 0; i < bestInlierCount; i++) {
        rawInliers[i] = bestInlierBuffer[i];
      }

      const bestCylInliers = pruneCylinderInliers(
        mesh,
        rawInliers,
        bestAxisOrigin,
        bestAxisDir,
        bestRadius,
        distTol * 2.0
      );

      const metrics = computeCylinderAngularMetrics(
        mesh,
        centroids,
        normals,
        bestCylInliers,
        bestAxisOrigin,
        bestAxisDir,
        bestRadius,
        areas
      );

      const validation = validateCylinderFeature(metrics, bestAxisDir);
      if (!validation.isValid) {
        cylFailures++;
        continue;
      }

      // Transactional commit of inliers
      let totalArea = 0;
      for (let k = 0; k < bestCylInliers.length; k++) {
        const t = bestCylInliers[k];
        unassigned[t] = 0;
        totalArea += areas[t];
      }
      unassignedCount -= bestCylInliers.length;

      cylinders.push({
        id: idGenerator(),
        type: 'cylinder',
        axisOrigin: bestAxisOrigin,
        axisDirection: bestAxisDir,
        radius: bestRadius,
        height: metrics.calculatedHeight,
        isInternal: metrics.isInternal,
        angularSpanRad: metrics.angularSpanRad,
        maxAngularGapRad: metrics.maxAngularGapRad,
        angularBinCoverage: metrics.angularBinCoverage,
        subType: metrics.subType,
        inlierIndices: bestCylInliers,
        area: totalArea,
        meanResidual: distTol * 0.6
      });
      cylFailures = 0;
    } else {
      cylFailures++;
    }
  }

  return { cylinders, remainingUnassignedCount: unassignedCount };
}
