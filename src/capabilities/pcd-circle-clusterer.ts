// ==============================================================================
// src/capabilities/pcd-circle-clusterer.ts — Pitch Circle Diameter (PCD) Clusterer
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';
import {
  NormalizedHole,
  HolePatternCluster,
  createRobustOrthonormalBasis,
  projectHolesToPolarCoords,
  evaluateEquispacedAngles,
  refinePcdCircleCenter
} from './pcd-geometry-matcher.js';
import { normalizeHole } from './pcd-hole-normalizer.js';

export interface PCDClusteringOptions {
  minHoleCount?: number;
  diameterToleranceMm?: number;
  depthToleranceMm?: number;
  axialDotTolerance?: number;
  planeToleranceMm?: number;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Clusters holes into Pitch Circle Diameter (PCD) bolt circles or pattern clusters.
 * Uses exact unit vector basis, algebraic circle center refinement, and low-latency FPU rounding.
 */
export function clusterNormalizedHoles(
  rawHoles: any[],
  options: PCDClusteringOptions = {},
  preserveAllPositions = true
): {
  individualHoles: any[];
  clusters: HolePatternCluster[];
} {
  const minCount = options.minHoleCount ?? 4;
  const diaTol = options.diameterToleranceMm ?? 0.20;
  const depthTol = options.depthToleranceMm ?? 0.50;
  const dotTol = options.axialDotTolerance ?? 0.985;
  const planeTol = options.planeToleranceMm ?? 0.50;

  if (!rawHoles || rawHoles.length < minCount) {
    return { individualHoles: rawHoles || [], clusters: [] };
  }

  const holes: NormalizedHole[] = rawHoles.map(normalizeHole);
  const clusters: HolePatternCluster[] = [];
  const visited = new Set<number>();

  for (let i = 0; i < holes.length; i++) {
    if (visited.has(i)) continue;
    const h1 = holes[i];
    const group = [i];
    const pOff1 = h1.position[0] * h1.direction[0] + h1.position[1] * h1.direction[1] + h1.position[2] * h1.direction[2];

    for (let j = i + 1; j < holes.length; j++) {
      if (visited.has(j)) continue;
      const h2 = holes[j];
      if (Math.abs(h1.diameter - h2.diameter) > diaTol) continue;
      if (Math.abs(h1.depth - h2.depth) > depthTol) continue;
      if (h1.isThreaded !== h2.isThreaded || (h1.isThreaded && h1.threadSpec !== h2.threadSpec)) continue;

      const dot = h1.direction[0] * h2.direction[0] + h1.direction[1] * h2.direction[1] + h1.direction[2] * h2.direction[2];
      if (dot < dotTol) continue;

      const pOff2 = h2.position[0] * h1.direction[0] + h2.position[1] * h1.direction[1] + h2.position[2] * h1.direction[2];
      if (Math.abs(pOff1 - pOff2) > planeTol) continue;
      group.push(j);
    }

    if (group.length >= minCount) {
      group.forEach(idx => visited.add(idx));
      const groupHoles = group.map(idx => holes[idx]);

      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < groupHoles.length; k++) {
        cx += groupHoles[k].position[0];
        cy += groupHoles[k].position[1];
        cz += groupHoles[k].position[2];
      }
      cx /= groupHoles.length; cy /= groupHoles.length; cz /= groupHoles.length;

      // Use true unit normal for unskewed basis projection & refine center for partial arcs
      const basis = createRobustOrthonormalBasis(h1.direction);
      const [fitCx, fitCy, fitCz] = refinePcdCircleCenter(groupHoles, cx, cy, cz, basis);
      const polar = projectHolesToPolarCoords(groupHoles, fitCx, fitCy, fitCz, basis);

      let sumR = 0;
      for (let k = 0; k < polar.length; k++) sumR += polar[k].radius;
      const avgR = sumR / polar.length;

      let maxRDiff = 0;
      for (let k = 0; k < polar.length; k++) {
        const diff = Math.abs(polar[k].radius - avgR);
        if (diff > maxRDiff) maxRDiff = diff;
      }

      const normDir: Vector3D = [
        round3(h1.direction[0]),
        round3(h1.direction[1]),
        round3(h1.direction[2])
      ];

      const samplePos: Point3D[] = groupHoles.slice(0, 3).map(h => [
        round2(h.position[0]),
        round2(h.position[1]),
        round2(h.position[2])
      ]);

      const allPos: Point3D[] | undefined = preserveAllPositions
        ? groupHoles.map(h => [
            round2(h.position[0]),
            round2(h.position[1]),
            round2(h.position[2])
          ])
        : undefined;

      const maxAllowedRDiff = Math.max(0.40, Math.min(1.2, avgR * 0.02));

      if (maxRDiff <= maxAllowedRDiff && avgR >= 1.5) {
        const angles = polar.map(p => p.angleDeg).sort((a, b) => a - b);
        const { isEquispaced, angularStepDeg } = evaluateEquispacedAngles(angles);
        const pcd = round2(avgR * 2.0);
        const threadTag = h1.isThreaded ? (h1.threadSpec || 'THREAD') : 'CLEAR';

        clusters.push({
          type: 'circular_bolt_circle',
          count: groupHoles.length,
          nominalDiameterMm: h1.diameter,
          nominalDepthMm: h1.depth,
          isThreaded: h1.isThreaded,
          threadSpec: h1.threadSpec,
          pitchCircleDiameterMm: pcd,
          center: [round2(fitCx), round2(fitCy), round2(fitCz)],
          normalDirection: normDir,
          startAngleDeg: round1(angles[0]),
          angularStepDeg: round1(angularStepDeg),
          isEquispaced,
          samplePositions: samplePos,
          allPositions: allPos,
          compactDsl: `PCD(${groupHoles.length}x ø${h1.diameter} on ø${pcd} ${threadTag})`
        });
      } else {
        clusters.push({
          type: 'repeated_hole_cluster',
          count: groupHoles.length,
          nominalDiameterMm: h1.diameter,
          nominalDepthMm: h1.depth,
          isThreaded: h1.isThreaded,
          threadSpec: h1.threadSpec,
          normalDirection: normDir,
          samplePositions: samplePos,
          allPositions: allPos,
          compactDsl: `CLUSTER(${groupHoles.length}x ø${h1.diameter} ${h1.isThreaded ? h1.threadSpec : 'CLEAR'})`
        });
      }
    }
  }

  const individualHoles = rawHoles.filter((_, idx) => !visited.has(idx));
  return { individualHoles, clusters };
}
