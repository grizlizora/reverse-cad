// ==============================================================================
// src/kernel/step/planar/boundary-loop-unifier.ts — Coplanar B-Rep Face Unifier
// ==============================================================================

import { computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import {
  computeSignedArea2D,
  isPolygonSimple2D,
  assignHolesToEnclosingOuters,
  simplifyCollinearLoop2D,
  extractBoundaryHalfEdgeAdjacency,
  traceKeepLeftJordanCycles2D
} from '../../geometry/index.js';

export interface Point2D {
  x: number;
  y: number;
}

export interface UnifiedJordanFace {
  outerLoop: number[];     // 3D vertex indices in CCW order
  holeLoops: number[][];   // Array of internal island holes (3D vertex indices in CW order)
  planeNormal: [number, number, number];
  planeOrigin: [number, number, number];
  area: number;
}

/**
 * Extracts unified B-Rep faces with outer bounds and inner holes from coplanar mesh triangles.
 * Uses 53-bit half-edge cancellation, Keep-Left pinch-point peeling, chordal collinear reduction,
 * and smallest-area Containment Forest hole assignment with zero duplicate 2D math.
 */
export function extractUnifiedCoplanarBoundary(
  triangles: number[],
  indices: Uint32Array,
  positions: Float32Array,
  normal: [number, number, number],
  origin: [number, number, number],
  collinearTol: number = 1e-4
): UnifiedJordanFace[] {
  if (triangles.length === 0) return [];

  const adj = extractBoundaryHalfEdgeAdjacency(triangles, indices);
  if (adj.size === 0) return [];

  const basis = computeOrthonormalBasis(normal);
  const nz = basis.dirZ;
  const vx = basis.dirX;
  const vy: [number, number, number] = [
    nz[1] * vx[2] - nz[2] * vx[1],
    nz[2] * vx[0] - nz[0] * vx[2],
    nz[0] * vx[1] - nz[1] * vx[0]
  ];

  const coordCache = new Map<number, [number, number]>();
  const getCoord2D = (vIdx: number): [number, number] => {
    let pt = coordCache.get(vIdx);
    if (!pt) {
      const i3 = vIdx * 3;
      const px = positions[i3] - origin[0];
      const py = positions[i3 + 1] - origin[1];
      const pz = positions[i3 + 2] - origin[2];
      pt = [
        px * vx[0] + py * vx[1] + pz * vx[2],
        px * vy[0] + py * vy[1] + pz * vy[2]
      ];
      coordCache.set(vIdx, pt);
    }
    return pt;
  };

  const rawLoops = traceKeepLeftJordanCycles2D(adj, getCoord2D);
  if (rawLoops.length === 0) return [];

  interface LoopMeta {
    loop: number[];
    coords2D: [number, number][];
    area: number;
  }
  const loopsMeta: LoopMeta[] = [];

  for (let i = 0; i < rawLoops.length; i++) {
    const rawLoop = rawLoops[i];
    if (rawLoop.length < 3) continue;
    const rawCoords = rawLoop.map(getCoord2D);
    const { loop, coords2D } = simplifyCollinearLoop2D(rawLoop, rawCoords, collinearTol);
    if (loop.length < 3) continue;
    const area = computeSignedArea2D(coords2D);
    if (Math.abs(area) < 1e-10) continue;
    loopsMeta.push({ loop, coords2D, area });
  }

  if (loopsMeta.length === 0) return [];

  const outers = loopsMeta.filter(l => l.area > 0);
  const holes = loopsMeta.filter(l => l.area < 0);

  if (outers.length === 0 && holes.length > 0) {
    for (let i = 0; i < holes.length; i++) {
      const h = holes[i];
      h.loop.reverse();
      h.coords2D.reverse();
      h.area = -h.area;
    }
    outers.push(...holes.filter(l => l.area > 0));
    holes.length = 0;
  }

  const validOuters = outers.filter(o => isPolygonSimple2D(o.coords2D));
  const validHoles = holes.filter(h => isPolygonSimple2D(h.coords2D));
  if (validOuters.length === 0) return [];

  const holeAssignmentMap = assignHolesToEnclosingOuters(validOuters, validHoles);
  const result: UnifiedJordanFace[] = [];

  for (let oIdx = 0; oIdx < validOuters.length; oIdx++) {
    const outer = validOuters[oIdx];
    const assignedHoles = holeAssignmentMap.get(oIdx) || [];
    result.push({
      outerLoop: outer.loop,
      holeLoops: assignedHoles.map(h => h.loop),
      planeNormal: normal,
      planeOrigin: origin,
      area: outer.area
    });
  }

  return result;
}
