// ==============================================================================
// src/kernel/step/revolution/revolution-zband-analyzer.ts — Z-Band Height Analyzer
// ==============================================================================

import { RawMesh, CylinderSurface, ConeSurface, SurfacePrimitive } from '../../../types/geometry.js';

export interface ZBandPartition {
  zMin: number;
  zMax: number;
  isObstacleZone: boolean; // e.g. Bridge zone at Z in [14.60, 15.40]
  obstacleAngularRanges?: Array<[number, number]>;
}

export interface RevolutionFeatureZone {
  surfaceId: string;
  type: 'cylinder' | 'cone';
  axisOrigin: [number, number, number];
  axisDirection: [number, number, number];
  radius: number;
  isInternal: boolean;
  bands: ZBandPartition[];
  inlierTriangles: Set<number>;
}

/**
 * Analyzes revolution features (cylinders, cones, bores, collars) and partitions
 * their height range into safe Z-bands that respect internal features (bridges, stepped floors).
 */
export function analyzeRevolutionZSurfaces(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[]
): RevolutionFeatureZone[] {
  const zones: RevolutionFeatureZone[] = [];
  const indices = mesh.indices;
  const positions = mesh.positions;

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    if (s.type !== 'cylinder' && s.type !== 'cone') continue;

    const inlierSet = new Set<number>(s.inlierIndices);
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (let k = 0; k < s.inlierIndices.length; k++) {
      const t = s.inlierIndices[k];
      const t3 = t * 3;
      for (let j = 0; j < 3; j++) {
        const v = indices[t3 + j];
        const z = positions[v * 3 + 2];
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }

    if (!isFinite(minZ) || !isFinite(maxZ) || maxZ - minZ < 1e-4) continue;

    // 2. Adaptive Topological Obstacle Detection along Cylinder Axis
    // Finds non-inlier geometry intersecting the cylinder interior (e.g. cross-bridges, stepped floors)
    const c = s as CylinderSurface;
    const ax = c.axisDirection[0], ay = c.axisDirection[1], az = c.axisDirection[2];
    const lenA = Math.hypot(ax, ay, az);
    if (lenA < 1e-6) continue;
    const nax = ax / lenA, nay = ay / lenA, naz = az / lenA;
    const ox = c.axisOrigin[0], oy = c.axisOrigin[1], oz = c.axisOrigin[2];
    const radius = c.radius && c.radius > 0 ? c.radius : 1.0;
    const rThresh = radius * 1.05;

    let minProj = Infinity;
    let maxProj = -Infinity;

    for (let k = 0; k < s.inlierIndices.length; k++) {
      const t = s.inlierIndices[k];
      const t3 = t * 3;
      for (let j = 0; j < 3; j++) {
        const v = indices[t3 + j];
        const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
        const proj = (px - ox) * nax + (py - oy) * nay + (pz - oz) * naz;
        if (proj < minProj) minProj = proj;
        if (proj > maxProj) maxProj = proj;
      }
    }

    if (!isFinite(minProj) || !isFinite(maxProj) || maxProj - minProj < 1e-4) continue;

    // 2. Adaptive Topological Obstacle Detection along Cylinder Axis
    // Finds non-inlier geometry intersecting external cylinder surfaces
    const bands: ZBandPartition[] = [];
    if (!s.isInternal) {
      const obstacleProjSamples: number[] = [];
      const triCount = mesh.triangleCount;
      for (let t = 0; t < triCount; t++) {
        if (inlierSet.has(t)) continue;
        const t3 = t * 3;
        let hasInside = false;
        let triProjMin = Infinity, triProjMax = -Infinity;

        for (let j = 0; j < 3; j++) {
          const v = indices[t3 + j];
          const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
          const dx = px - ox, dy = py - oy, dz = pz - oz;
          const proj = dx * nax + dy * nay + dz * naz;

          // Radial distance perpendicular to axis
          const rx = dx - proj * nax;
          const ry = dy - proj * nay;
          const rz = dz - proj * naz;
          const distRad = Math.hypot(rx, ry, rz);

          if (distRad <= rThresh && proj >= minProj - 1e-3 && proj <= maxProj + 1e-3) {
            hasInside = true;
            if (proj < triProjMin) triProjMin = proj;
            if (proj > triProjMax) triProjMax = proj;
          }
        }

        if (hasInside && isFinite(triProjMin) && isFinite(triProjMax)) {
          obstacleProjSamples.push(triProjMin, triProjMax);
        }
      }

      // Partition into bands based on detected obstacle intervals
      if (obstacleProjSamples.length > 0) {
        obstacleProjSamples.sort((a, b) => a - b);
        const obsMin = Math.max(minProj, obstacleProjSamples[0]);
        const obsMax = Math.min(maxProj, obstacleProjSamples[obstacleProjSamples.length - 1]);

        if (obsMin - minProj > 0.1) {
          bands.push({ zMin: minProj, zMax: obsMin, isObstacleZone: false });
        }
        bands.push({ zMin: obsMin, zMax: obsMax, isObstacleZone: true });
        if (maxProj - obsMax > 0.1) {
          bands.push({ zMin: obsMax, zMax: maxProj, isObstacleZone: false });
        }
      } else {
        bands.push({ zMin: minProj, zMax: maxProj, isObstacleZone: false });
      }
    } else {
      // Internal cylindrical bore: continuous clean analytical surface
      bands.push({ zMin: minProj, zMax: maxProj, isObstacleZone: false });
    }

    zones.push({
      surfaceId: s.id,
      type: s.type,
      axisOrigin: [c.axisOrigin[0], c.axisOrigin[1], c.axisOrigin[2]],
      axisDirection: [nax, nay, naz],
      radius,
      isInternal: Boolean(s.isInternal),
      bands,
      inlierTriangles: inlierSet
    });
  }

  return zones;
}
