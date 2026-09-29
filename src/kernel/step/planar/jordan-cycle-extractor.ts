// ==============================================================================
// src/kernel/step/planar/jordan-cycle-extractor.ts — Robust Jordan Face Extractor
// ==============================================================================

import { CoplanarCluster } from './coplanar-clusterer.js';
import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';
import { computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import { JordanFaceDefinition } from '../step-face-emitter.js';
import {
  computeSignedArea2D,
  isPolygonSimple2D,
  assignHolesToEnclosingOuters
} from '../../geometry/index.js';
import { peelPlanarBoundaryCycles } from './jordan-cycle-peeler.js';

export { isPolygonSimple2D } from '../../geometry/index.js';

interface ClassifiedLoop {
  loop: number[];
  coords2D: [number, number][];
  area: number;
  isOuter: boolean;
}

/**
 * Extracts simple, non-self-intersecting Jordan boundary cycles from coplanar triangle clusters.
 * Features dynamic local Keep-Left cycle peeling and a Containment Forest DAG resolver.
 */
export function extractJordanFacesFromCluster(
  cluster: CoplanarCluster,
  _indices: Uint32Array,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  edgeIndexer: TopologyEdgeIndexer
): JordanFaceDefinition[] | null {
  const boundaryEdges = edgeIndexer.extractComponentBoundaryHalfEdges(cluster.triangleIndices);
  if (boundaryEdges.length < 3) return null;

  // 1. Orthonormal Projection Basis
  const basis = computeOrthonormalBasis(cluster.normal);
  const dirZ = basis.dirZ;
  const dirX = basis.dirX;
  const dirY: [number, number, number] = [
    dirZ[1] * dirX[2] - dirZ[2] * dirX[1],
    dirZ[2] * dirX[0] - dirZ[0] * dirX[2],
    dirZ[0] * dirX[1] - dirZ[1] * dirX[0]
  ];
  const [ox, oy, oz] = cluster.originPoint;

  // Coordinate projection cache: prevents duplicate math & garbage churn
  const coordCache = new Map<number, [number, number]>();
  const getCoord2D = (vIdx: number): [number, number] => {
    let pt = coordCache.get(vIdx);
    if (!pt) {
      const dx = stepVerticesX[vIdx] - ox;
      const dy = stepVerticesY[vIdx] - oy;
      const dz = stepVerticesZ[vIdx] - oz;
      pt = [
        dx * dirX[0] + dy * dirX[1] + dz * dirX[2],
        dx * dirY[0] + dy * dirY[1] + dz * dirY[2]
      ];
      coordCache.set(vIdx, pt);
    }
    return pt;
  };

  // 2. Dynamic Keep-Left Eulerian Peeling
  const peeled = peelPlanarBoundaryCycles(boundaryEdges, getCoord2D);
  if (peeled.length === 0) return null;

  // 3. Classify and Validate Jordan Loops
  const loops: ClassifiedLoop[] = [];
  let outerCount = 0;

  for (let i = 0; i < peeled.length; i++) {
    const { loop, coords2D } = peeled[i];
    const area = computeSignedArea2D(coords2D);
    if (Math.abs(area) < 1e-10) continue; // Degenerate micro-loop

    if (!isPolygonSimple2D(coords2D)) return null;

    const isOuter = cluster.sameSense === 1 ? area > 0 : area < 0;
    if (isOuter) outerCount++;
    loops.push({ loop, coords2D, area, isOuter });
  }

  if (outerCount === 0) return null;
  const sameSenseBool = cluster.sameSense === 1;

  // 4. Single-Outer Face Fast Path
  if (outerCount === 1) {
    const outer = loops.find(l => l.isOuter)!;
    const holes = loops.filter(l => !l.isOuter).map(l => l.loop);
    return [{
      outerLoop: outer.loop,
      holeLoops: holes.length > 0 ? holes : undefined,
      surfaceId: cluster.surfaceId,
      sameSense: sameSenseBool
    }];
  }

  // 5. Multi-Outer Face Assignment via Containment Forest DAG
  const outers = loops.filter(l => l.isOuter);
  const holes = loops.filter(l => !l.isOuter);
  const holeMap = assignHolesToEnclosingOuters(outers, holes);
  const faces: JordanFaceDefinition[] = [];

  for (let oIdx = 0; oIdx < outers.length; oIdx++) {
    const outer = outers[oIdx];
    const assignedHoles = holeMap.get(oIdx) || [];
    faces.push({
      outerLoop: outer.loop,
      holeLoops: assignedHoles.length > 0 ? assignedHoles.map(h => h.loop) : undefined,
      surfaceId: cluster.surfaceId,
      sameSense: sameSenseBool
    });
  }

  return faces;
}
