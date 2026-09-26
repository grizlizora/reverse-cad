// ==============================================================================
// src/capabilities/pcd-pattern-engine.ts — Unified Bolt Circle & PCD Clustering Engine
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';
import { CADHole } from '../types/features.js';

export interface NormalizedHole {
  readonly id: string;
  readonly diameter: number;
  readonly depth: number;
  readonly position: Point3D;
  readonly direction: Vector3D;
  readonly isThreaded: boolean;
  readonly threadSpec?: string;
}

export interface PCDClusteringOptions {
  minHoleCount?: number;
  diameterToleranceMm?: number;
  depthToleranceMm?: number;
  axialDotTolerance?: number;
}

export interface HolePatternCluster {
  type: 'circular_bolt_circle' | 'linear_array' | 'repeated_hole_cluster';
  count: number;
  nominalDiameterMm: number;
  nominalDepthMm: number;
  isThreaded: boolean;
  threadSpec?: string;
  pitchCircleDiameterMm?: number;
  center?: Point3D;
  normalDirection: Vector3D;
  startAngleDeg?: number;
  angularStepDeg?: number;
  isEquispaced?: boolean;
  samplePositions: Point3D[];
  allPositions?: Point3D[];
  compactDsl?: string;
}

/**
 * Normalizes any hole representation (CADHole or summary representation) into NormalizedHole.
 */
export function normalizeHole(h: any): NormalizedHole {
  const dia = typeof h.diameter === 'number' ? h.diameter : (typeof h.diameterMm === 'number' ? h.diameterMm : 5.0);
  const depth = typeof h.depth === 'number' ? h.depth : (typeof h.depthMm === 'number' ? h.depthMm : 10.0);
  const pos: Point3D = Array.isArray(h.axisOrigin) ? h.axisOrigin : (Array.isArray(h.position) ? h.position : [0, 0, 0]);
  const dir: Vector3D = Array.isArray(h.axisDirection) ? h.axisDirection : (Array.isArray(h.direction) ? h.direction : [0, 0, 1]);
  const isThreaded = Boolean(h.isThreaded);
  const threadSpec = h.threadSpec || h.thread || undefined;

  return {
    id: h.id || 'hole_0',
    diameter: dia,
    depth,
    position: pos,
    direction: dir,
    isThreaded,
    threadSpec
  };
}

/**
 * Clusters holes into Pitch Circle Diameter (PCD) bolt circles or linear arrays.
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

    for (let j = i + 1; j < holes.length; j++) {
      if (visited.has(j)) continue;
      const h2 = holes[j];

      if (Math.abs(h1.diameter - h2.diameter) > diaTol) continue;
      if (Math.abs(h1.depth - h2.depth) > depthTol) continue;
      if (h1.isThreaded !== h2.isThreaded) continue;
      if (h1.isThreaded && h1.threadSpec !== h2.threadSpec) continue;

      const dot = h1.direction[0] * h2.direction[0] +
                  h1.direction[1] * h2.direction[1] +
                  h1.direction[2] * h2.direction[2];
      if (dot < dotTol) continue;

      group.push(j);
    }

    if (group.length >= minCount) {
      group.forEach(idx => visited.add(idx));
      const groupHoles = group.map(idx => holes[idx]);

      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < groupHoles.length; k++) {
        const h = groupHoles[k];
        cx += h.position[0];
        cy += h.position[1];
        cz += h.position[2];
      }
      cx /= groupHoles.length;
      cy /= groupHoles.length;
      cz /= groupHoles.length;

      const normDir: Vector3D = [
        parseFloat(h1.direction[0].toFixed(3)),
        parseFloat(h1.direction[1].toFixed(3)),
        parseFloat(h1.direction[2].toFixed(3))
      ];

      // Gram-Schmidt orthonormal basis (u, w) perpendicular to normDir
      let ref: Vector3D = Math.abs(normDir[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
      const projRef = ref[0] * normDir[0] + ref[1] * normDir[1] + ref[2] * normDir[2];
      let ux = ref[0] - projRef * normDir[0];
      let uy = ref[1] - projRef * normDir[1];
      let uz = ref[2] - projRef * normDir[2];
      const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
      ux /= uLen; uy /= uLen; uz /= uLen;

      const wx = normDir[1] * uz - normDir[2] * uy;
      const wy = normDir[2] * ux - normDir[0] * uz;
      const wz = normDir[0] * uy - normDir[1] * ux;

      const radialDistances: number[] = [];
      const angles: number[] = [];

      for (let k = 0; k < groupHoles.length; k++) {
        const h = groupHoles[k];
        const dx = h.position[0] - cx;
        const dy = h.position[1] - cy;
        const dz = h.position[2] - cz;

        const uCoord = dx * ux + dy * uy + dz * uz;
        const wCoord = dx * wx + dy * wy + dz * wz;

        const r = Math.sqrt(uCoord * uCoord + wCoord * wCoord);
        radialDistances.push(r);

        let ang = Math.atan2(wCoord, uCoord) * (180 / Math.PI);
        if (ang < 0) ang += 360;
        angles.push(ang);
      }

      const avgR = radialDistances.reduce((a, b) => a + b, 0) / radialDistances.length;
      const maxRDiff = Math.max(...radialDistances.map(r => Math.abs(r - avgR)));

      const samplePos: Point3D[] = groupHoles.slice(0, 3).map(h => [
        parseFloat(h.position[0].toFixed(2)),
        parseFloat(h.position[1].toFixed(2)),
        parseFloat(h.position[2].toFixed(2))
      ]);

      const allPos: Point3D[] | undefined = preserveAllPositions
        ? groupHoles.map(h => [
            parseFloat(h.position[0].toFixed(2)),
            parseFloat(h.position[1].toFixed(2)),
            parseFloat(h.position[2].toFixed(2))
          ])
        : undefined;

      if (maxRDiff < 0.60 && avgR >= 2.0) {
        // Confirmed circular bolt circle (PCD)
        angles.sort((a, b) => a - b);
        let isEqui = true;
        const expectedStep = 360 / groupHoles.length;
        for (let k = 0; k < angles.length; k++) {
          const next = (k + 1) % angles.length;
          let diff = next === 0 ? (360 + angles[0] - angles[k]) : (angles[next] - angles[k]);
          if (Math.abs(diff - expectedStep) > 4.0) {
            isEqui = false;
            break;
          }
        }

        const pcd = parseFloat((avgR * 2.0).toFixed(2));
        const threadTag = h1.isThreaded ? (h1.threadSpec || 'THREAD') : 'CLEAR';
        const dsl = `PCD(${groupHoles.length}x ø${h1.diameter} on ø${pcd} ${threadTag})`;

        clusters.push({
          type: 'circular_bolt_circle',
          count: groupHoles.length,
          nominalDiameterMm: h1.diameter,
          nominalDepthMm: h1.depth,
          isThreaded: h1.isThreaded,
          threadSpec: h1.threadSpec,
          pitchCircleDiameterMm: pcd,
          center: [parseFloat(cx.toFixed(2)), parseFloat(cy.toFixed(2)), parseFloat(cz.toFixed(2))],
          normalDirection: normDir,
          startAngleDeg: parseFloat(angles[0].toFixed(1)),
          angularStepDeg: parseFloat(expectedStep.toFixed(1)),
          isEquispaced: isEqui,
          samplePositions: samplePos,
          allPositions: allPos,
          compactDsl: dsl
        });
      } else {
        // Generic hole cluster
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
