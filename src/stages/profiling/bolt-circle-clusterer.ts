// ==============================================================================
// src/stages/profiling/bolt-circle-clusterer.ts — Pitch Circle Diameter (PCD) Pattern Profiler
// ==============================================================================

import { CADHole } from '../../types/features.js';
import { Point3D, Vector3D } from '../../types/geometry.js';
import { dot, cross, norm } from '../../math/index.js';

export interface BoltCirclePattern {
  id: string;
  holeIds: string[];
  boltCount: number;
  pitchCircleDiameterMm: number;
  holeDiameterMm: number;
  centerMm: Point3D;
  normal: Vector3D;
  angularPitchDeg: number;
}

/**
 * Clusters planar holes into circular bolt patterns (Pitch Circle Diameter).
 */
export function clusterBoltCirclePatterns(
  holes: CADHole[],
  pcdToleranceMm: number = 0.5
): BoltCirclePattern[] {
  const patterns: BoltCirclePattern[] = [];
  if (holes.length < 3) return patterns;

  // Group holes by similar diameter and parallel axis
  const groups: CADHole[][] = [];

  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    let added = false;

    for (let g = 0; g < groups.length; g++) {
      const rep = groups[g][0];
      const diaDiff = Math.abs(h.diameter - rep.diameter);
      const dotAxis = Math.abs(dot(h.axisDirection, rep.axisDirection));

      if (diaDiff <= 0.25 && dotAxis >= 0.98) {
        groups[g].push(h);
        added = true;
        break;
      }
    }

    if (!added) {
      groups.push([h]);
    }
  }

  let patternCounter = 0;

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (group.length < 3) continue;

    const rep = group[0];
    const n = rep.axisDirection;

    // Project hole centers onto plane perpendicular to axis
    const u: Vector3D = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
    const perpU = cross(n, u);
    const uAxis = perpU;
    const vAxis = cross(n, uAxis);
    const uLen = norm(uAxis);
    const vLen = norm(vAxis);
    if (uLen < 1e-6 || vLen < 1e-6) continue;
    uAxis[0] /= uLen; uAxis[1] /= uLen; uAxis[2] /= uLen;
    vAxis[0] /= vLen; vAxis[1] /= vLen; vAxis[2] /= vLen;

    // Centroid of all hole centers
    let meanX = 0, meanY = 0, meanZ = 0;
    for (let i = 0; i < group.length; i++) {
      meanX += group[i].axisOrigin[0];
      meanY += group[i].axisOrigin[1];
      meanZ += group[i].axisOrigin[2];
    }
    const center: Point3D = [meanX / group.length, meanY / group.length, meanZ / group.length];

    // Compute radii from center
    const radii: number[] = [];
    for (let i = 0; i < group.length; i++) {
      const dx = group[i].axisOrigin[0] - center[0];
      const dy = group[i].axisOrigin[1] - center[1];
      const dz = group[i].axisOrigin[2] - center[2];
      const proj = dx * n[0] + dy * n[1] + dz * n[2];
      const rx = dx - proj * n[0];
      const ry = dy - proj * n[1];
      const rz = dz - proj * n[2];
      radii.push(Math.sqrt(rx * rx + ry * ry + rz * rz));
    }

    const avgRadius = radii.reduce((s, r) => s + r, 0) / radii.length;
    const maxRadiusDelta = Math.max(...radii.map(r => Math.abs(r - avgRadius)));

    if (maxRadiusDelta <= pcdToleranceMm && avgRadius >= 3.0) {
      patterns.push({
        id: `bolt_circle_${++patternCounter}`,
        holeIds: group.map(h => h.id),
        boltCount: group.length,
        pitchCircleDiameterMm: parseFloat((avgRadius * 2.0).toFixed(2)),
        holeDiameterMm: parseFloat(rep.diameter.toFixed(2)),
        centerMm: [
          parseFloat(center[0].toFixed(3)),
          parseFloat(center[1].toFixed(3)),
          parseFloat(center[2].toFixed(3))
        ],
        normal: n,
        angularPitchDeg: parseFloat((360.0 / group.length).toFixed(2))
      });
    }
  }

  return patterns;
}
