// ==============================================================================
// src/kernel/step/planar/through-hole-finder.ts — Opposing Hole Pair Finder
// Matches through-hole boundaries across opposing planar faces in O(M) time.
// ==============================================================================

import { RawMesh } from '../../../types/geometry.js';
import { CoplanarCluster } from './coplanar-clusterer.js';
import { extractJordanFacesFromCluster } from './jordan-cycle-extractor.js';
import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';
import { MatchedThroughHole } from './through-hole-types.js';

interface CachedHoleInfo {
  loop: number[];
  cx: number;
  cy: number;
  cz: number;
  approxRadius: number;
}

/**
 * Finds pairs of matching through-holes between opposing planar faces.
 */
export function findMatchingThroughHoles(
  majorClusters: CoplanarCluster[],
  mesh: RawMesh,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  edgeIndexer: TopologyEdgeIndexer
): MatchedThroughHole[] {
  const clusterHolesCache = new Array<CachedHoleInfo[]>(majorClusters.length);

  for (let c = 0; c < majorClusters.length; c++) {
    const jfList = extractJordanFacesFromCluster(
      majorClusters[c],
      mesh.indices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ,
      edgeIndexer
    );
    const holes: CachedHoleInfo[] = [];
    if (jfList) {
      for (let f = 0; f < jfList.length; f++) {
        const hLoops = jfList[f].holeLoops;
        if (!hLoops) continue;
        for (let h = 0; h < hLoops.length; h++) {
          const lp = hLoops[h];
          if (lp.length === 0) continue;
          let cx = 0, cy = 0, cz = 0;
          for (let i = 0; i < lp.length; i++) {
            const v = lp[i];
            cx += stepVerticesX[v];
            cy += stepVerticesY[v];
            cz += stepVerticesZ[v];
          }
          const invLen = 1.0 / lp.length;
          const mcx = cx * invLen, mcy = cy * invLen, mcz = cz * invLen;

          let rSum = 0;
          for (let i = 0; i < lp.length; i++) {
            const v = lp[i];
            rSum += Math.hypot(stepVerticesX[v] - mcx, stepVerticesY[v] - mcy, stepVerticesZ[v] - mcz);
          }
          holes.push({
            loop: lp,
            cx: mcx,
            cy: mcy,
            cz: mcz,
            approxRadius: rSum * invLen
          });
        }
      }
    }
    clusterHolesCache[c] = holes;
  }

  const matchedHoles: MatchedThroughHole[] = [];

  for (let c1 = 0; c1 < majorClusters.length; c1++) {
    const clA = majorClusters[c1];
    const holesA = clusterHolesCache[c1];
    if (!holesA || holesA.length === 0) continue;

    for (let c2 = c1 + 1; c2 < majorClusters.length; c2++) {
      const clB = majorClusters[c2];
      const dot =
        clA.normal[0] * clB.normal[0] +
        clA.normal[1] * clB.normal[1] +
        clA.normal[2] * clB.normal[2];

      if (dot > -0.85) continue; // Opposing planar faces required

      const holesB = clusterHolesCache[c2];
      if (!holesB || holesB.length === 0) continue;

      const usedB = new Set<number>();

      for (let hA = 0; hA < holesA.length; hA++) {
        const { loop: loopA, cx: cxA, cy: cyA, cz: czA, approxRadius: rA } = holesA[hA];
        let bestB = -1;
        let bestDist = Infinity;
        // Scale-aware transverse distance threshold (min 0.5mm, max 3.5mm)
        const maxTransDist = Math.min(3.5, Math.max(0.5, rA * 0.5));

        for (let hB = 0; hB < holesB.length; hB++) {
          if (usedB.has(hB)) continue;
          const { cx: cxB, cy: cyB, cz: czB } = holesB[hB];

          const dx = cxA - cxB, dy = cyA - cyB, dz = czA - czB;
          const dotN = dx * clA.normal[0] + dy * clA.normal[1] + dz * clA.normal[2];
          const transDist = Math.hypot(
            dx - dotN * clA.normal[0],
            dy - dotN * clA.normal[1],
            dz - dotN * clA.normal[2]
          );

          if (transDist < bestDist && transDist < maxTransDist) {
            bestDist = transDist;
            bestB = hB;
          }
        }

        if (bestB !== -1) {
          usedB.add(bestB);
          matchedHoles.push({
            topClusterIdx: c1,
            botClusterIdx: c2,
            topHoleIdx: hA,
            botHoleIdx: bestB,
            cx: cxA,
            cy: cyA,
            cz: czA,
            normal: [clA.normal[0], clA.normal[1], clA.normal[2]],
            topLoop: loopA,
            botLoop: holesB[bestB].loop
          });
        }
      }
    }
  }

  return matchedHoles;
}
