// ==============================================================================
// src/stages/segmentation/angular-metrics.ts — Cylindrical Arc Angular Metrics
// ==============================================================================

import { RawMesh, Point3D, Vector3D } from '../../types/geometry.js';

export interface CylinderAngularMetrics {
  angularSpanRad: number;
  maxAngularGapRad: number;
  angularBinCoverage: number;
  subType: 'full_cylinder' | 'fillet' | 'partial_arc';
  isClosed: boolean;
  calculatedHeight: number;
  isInternal: boolean;
  flankNormalRms: number;
  areaDensity: number;
}

/**
 * Computes exact angular span, maximum circular gap, bin coverage, area density, and subtype
 * for a cylindrical segment around its axis.
 */
export function computeCylinderAngularMetrics(
  mesh: RawMesh,
  centroids: Float32Array,
  normals: Float32Array,
  inliers: number[],
  origin: Point3D,
  axisDir: Vector3D,
  radius?: number,
  areas?: Float32Array
): CylinderAngularMetrics {
  const ax = axisDir[0], ay = axisDir[1], az = axisDir[2];
  const ox = origin[0], oy = origin[1], oz = origin[2];

  // 1. Orthonormal transverse basis (u, w) perpendicular to axis
  const refX = Math.abs(ax) < 0.8 ? 1 : 0, refY = Math.abs(ax) < 0.8 ? 0 : 1;
  const refDotA = refX * ax + refY * ay;
  let ux = refX - refDotA * ax, uy = refY - refDotA * ay, uz = -refDotA * az;
  const uLen = Math.hypot(ux, uy, uz);
  if (uLen > 1e-12) { ux /= uLen; uy /= uLen; uz /= uLen; } else { ux = 1; uy = 0; uz = 0; }
  const wx = ay * uz - az * uy, wy = az * ux - ax * uz, wz = ax * uy - ay * ux;

  // 2. Sample polar angles from inlier triangle vertices and centroids
  const totalSamples = inliers.length * 4;
  const angles: number[] = new Array(totalSamples);
  let sampleCount = 0;

  let minT = Infinity;
  let maxT = -Infinity;
  let normalRadialDotSum = 0;
  let sumAxialDotSq = 0;

  const positions = mesh.positions;
  const indices = mesh.indices;

  for (let i = 0; i < inliers.length; i++) {
    const t = inliers[i];
    const t3 = t * 3;

    // Centroid radial projection & normal alignment
    const cx = centroids[t3] - ox;
    const cy = centroids[t3 + 1] - oy;
    const cz = centroids[t3 + 2] - oz;
    const cProj = cx * ax + cy * ay + cz * az;
    const crx = cx - cProj * ax;
    const cry = cy - cProj * ay;
    const crz = cz - cProj * az;
    const crLen = Math.sqrt(crx * crx + cry * cry + crz * crz);
    if (crLen > 1e-6) {
      normalRadialDotSum += (normals[t3] * crx + normals[t3 + 1] * cry + normals[t3 + 2] * crz) / crLen;
    }

    const dotAxis = normals[t3] * ax + normals[t3 + 1] * ay + normals[t3 + 2] * az;
    sumAxialDotSq += dotAxis * dotAxis;

    const cu = crx * ux + cry * uy + crz * uz;
    const cw = crx * wx + cry * wy + crz * wz;
    let thetaC = Math.atan2(cw, cu);
    if (thetaC < 0) thetaC += 2 * Math.PI;
    angles[sampleCount++] = thetaC;

    // Triangle vertices
    for (let v = 0; v < 3; v++) {
      const vIdx = indices[t3 + v] * 3;
      const dx = positions[vIdx] - ox, dy = positions[vIdx + 1] - oy, dz = positions[vIdx + 2] - oz;
      const proj = dx * ax + dy * ay + dz * az;
      if (proj < minT) minT = proj;
      if (proj > maxT) maxT = proj;

      const rx = dx - proj * ax, ry = dy - proj * ay, rz = dz - proj * az;
      let theta = Math.atan2(rx * wx + ry * wy + rz * wz, rx * ux + ry * uy + rz * uz);
      if (theta < 0) theta += 2 * Math.PI;
      angles[sampleCount++] = theta;
    }
  }

  // 3. Sort angles & Compute maximum gap on S^1
  angles.sort((a, b) => a - b);

  let maxGap = 0;
  for (let i = 0; i < sampleCount - 1; i++) {
    const gap = angles[i + 1] - angles[i];
    if (gap > maxGap) maxGap = gap;
  }
  const wrapGap = (2 * Math.PI - angles[sampleCount - 1]) + angles[0];
  if (wrapGap > maxGap) maxGap = wrapGap;

  const angularSpanRad = Math.max(0, 2 * Math.PI - maxGap);

  // 4. Histogram Binning (36 bins = 10 deg each)
  const NUM_BINS = 36;
  const bins = new Uint8Array(NUM_BINS);
  for (let i = 0; i < sampleCount; i++) {
    bins[Math.min(NUM_BINS - 1, Math.floor((angles[i] / (2 * Math.PI)) * NUM_BINS))] = 1;
  }
  let occupiedBins = 0;
  for (let b = 0; b < NUM_BINS; b++) if (bins[b]) occupiedBins++;
  const angularBinCoverage = occupiedBins / NUM_BINS;

  // 4b. Axial continuity check
  const tProjs = new Float32Array(inliers.length);
  for (let i = 0; i < inliers.length; i++) {
    const t3 = inliers[i] * 3;
    tProjs[i] = (centroids[t3] - ox) * ax + (centroids[t3 + 1] - oy) * ay + (centroids[t3 + 2] - oz) * az;
  }
  tProjs.sort();
  let maxAxialGap = 0;
  for (let i = 0; i < tProjs.length - 1; i++) {
    const gap = tProjs[i + 1] - tProjs[i];
    if (gap > maxAxialGap) maxAxialGap = gap;
  }

  const calculatedHeight = maxT > minT ? maxT - minT : 10.0;
  const maxAllowedAxialGap = Math.max(5.0, calculatedHeight * 0.45);

  // 5. Rigorous Disambiguation
  const isFull = angularSpanRad >= (280 * Math.PI / 180) &&
                 maxGap <= (80 * Math.PI / 180) &&
                 angularBinCoverage >= 0.65 &&
                 maxAxialGap <= maxAllowedAxialGap;
  const isFillet = !isFull && (angularSpanRad <= (140 * Math.PI / 180) || maxGap >= (220 * Math.PI / 180));
  const subType: 'full_cylinder' | 'fillet' | 'partial_arc' = isFull ? 'full_cylinder' : isFillet ? 'fillet' : 'partial_arc';

  const isInternal = normalRadialDotSum < 0;
  const flankNormalRms = Math.sqrt(sumAxialDotSq / Math.max(1, inliers.length));

  let totalInlierArea = 0;
  if (areas) {
    for (let i = 0; i < inliers.length; i++) totalInlierArea += areas[inliers[i]];
  } else {
    for (let i = 0; i < inliers.length; i++) {
      const t3 = inliers[i] * 3, i0 = indices[t3] * 3, i1 = indices[t3 + 1] * 3, i2 = indices[t3 + 2] * 3;
      const e1x = positions[i1] - positions[i0], e1y = positions[i1 + 1] - positions[i0 + 1], e1z = positions[i1 + 2] - positions[i0 + 2];
      const e2x = positions[i2] - positions[i0], e2y = positions[i2 + 1] - positions[i0 + 1], e2z = positions[i2 + 2] - positions[i0 + 2];
      totalInlierArea += 0.5 * Math.hypot(e1y * e2z - e1z * e2y, e1z * e2x - e1x * e2z, e1x * e2y - e1y * e2x);
    }
  }
  const effectiveR = radius && radius > 0 ? radius : 1.0;
  const expectedArea = angularSpanRad * effectiveR * Math.max(1.0, calculatedHeight);
  const areaDensity = expectedArea > 1e-6 ? totalInlierArea / expectedArea : 1.0;

  return {
    angularSpanRad,
    maxAngularGapRad: maxGap,
    angularBinCoverage,
    subType,
    isClosed: isFull,
    calculatedHeight: Math.max(1.0, calculatedHeight),
    isInternal,
    flankNormalRms,
    areaDensity
  };
}
