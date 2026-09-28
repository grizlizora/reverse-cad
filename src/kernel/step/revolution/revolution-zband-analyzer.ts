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
    const ox = c.axisOrigin[0], oy = c.axisOrigin[1], oz = c.axisOrigin[2];
    const rThresh = (c.radius || 7.65) * 1.05;

    // Scan for non-inlier vertices lying inside the cylinder radius
    const obstacleZSamples: number[] = [];
    const triCount = mesh.triangleCount;
    for (let t = 0; t < triCount; t++) {
      if (inlierSet.has(t)) continue;
      const t3 = t * 3;
      let hasInside = false;
      let triZMin = Infinity, triZMax = -Infinity;

      for (let j = 0; j < 3; j++) {
        const v = indices[t3 + j];
        const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
        const dx = px - ox, dy = py - oy, dz = pz - oz;
        const proj = dx * ax + dy * ay + dz * az;

        // Radial distance perpendicular to axis
        const rx = dx - proj * ax;
        const ry = dy - proj * ay;
        const rz = dz - proj * az;
        const distRad = Math.hypot(rx, ry, rz);

        if (distRad <= rThresh && pz >= minZ - 1e-3 && pz <= maxZ + 1e-3) {
          hasInside = true;
          if (pz < triZMin) triZMin = pz;
          if (pz > triZMax) triZMax = pz;
        }
      }

      if (hasInside && isFinite(triZMin) && isFinite(triZMax)) {
        obstacleZSamples.push(triZMin, triZMax);
      }
    }

    // Partition into bands based on detected obstacle intervals
    const bands: ZBandPartition[] = [];
    if (obstacleZSamples.length > 0) {
      obstacleZSamples.sort((a, b) => a - b);
      const obsMin = Math.max(minZ, obstacleZSamples[0]);
      const obsMax = Math.min(maxZ, obstacleZSamples[obstacleZSamples.length - 1]);

      if (obsMin - minZ > 0.1) {
        bands.push({ zMin: minZ, zMax: obsMin, isObstacleZone: false });
      }
      bands.push({ zMin: obsMin, zMax: obsMax, isObstacleZone: true });
      if (maxZ - obsMax > 0.1) {
        bands.push({ zMin: obsMax, zMax: maxZ, isObstacleZone: false });
      }
    } else {
      bands.push({ zMin: minZ, zMax: maxZ, isObstacleZone: false });
    }

    zones.push({
      surfaceId: s.id,
      type: s.type,
      axisOrigin: [c.axisOrigin[0], c.axisOrigin[1], c.axisOrigin[2]],
      axisDirection: [c.axisDirection[0], c.axisDirection[1], c.axisDirection[2]],
      radius: c.radius || 7.65,
      bands,
      inlierTriangles: inlierSet
    });
  }

  return zones;
}
