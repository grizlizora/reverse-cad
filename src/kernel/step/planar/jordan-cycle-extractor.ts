// ==============================================================================
// src/kernel/step/planar/jordan-cycle-extractor.ts — Robust Jordan Cycle Extractor
// ==============================================================================

import { CoplanarCluster } from './coplanar-clusterer.js';
import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';
import { computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import { JordanFaceDefinition } from '../step-face-emitter.js';

interface ProjectedLoop {
  loop: number[];
  coords2D: [number, number][];
  area: number;
  isOuter: boolean;
}

/**
 * Extracts simple, non-self-intersecting Jordan boundary cycles from coplanar triangle clusters.
 * Features an angular pinch-resolver that prevents figure-8 bow-tie loops at pinch-points (e.g. letter 'X').
 */
export function extractJordanFacesFromCluster(
  cluster: CoplanarCluster,
  indices: Uint32Array,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  edgeIndexer: TopologyEdgeIndexer
): JordanFaceDefinition[] | null {
  const boundaryEdges = edgeIndexer.extractComponentBoundaryHalfEdges(cluster.triangleIndices);
  if (boundaryEdges.length < 3) return null;

  // Build directed boundary adjacency graph
  const adjList = new Map<number, number[]>();
  for (let i = 0; i < boundaryEdges.length; i++) {
    const [u, v] = boundaryEdges[i];
    let list = adjList.get(u);
    if (!list) adjList.set(u, list = []);
    list.push(v);
  }

  // Set up 2D orthonormal projection basis
  const [nx, ny, nz] = cluster.normal;
  const basis = computeOrthonormalBasis([nx, ny, nz]);
  const dirZ = basis.dirZ;
  const dirX = basis.dirX;
  const dirY: [number, number, number] = [
    dirZ[1] * dirX[2] - dirZ[2] * dirX[1],
    dirZ[2] * dirX[0] - dirZ[0] * dirX[2],
    dirZ[0] * dirX[1] - dirZ[1] * dirX[0]
  ];

  const [ox, oy, oz] = cluster.originPoint;

  const project2D = (vIdx: number): [number, number] => {
    const dx = stepVerticesX[vIdx] - ox;
    const dy = stepVerticesY[vIdx] - oy;
    const dz = stepVerticesZ[vIdx] - oz;
    return [
      dx * dirX[0] + dy * dirX[1] + dz * dirX[2],
      dx * dirY[0] + dy * dirY[1] + dz * dirY[2]
    ];
  };

  // Angular Pinch Resolver: at nodes with outDegree > 1, sort outgoing edges radially (Keep-Left Rule)
  for (const [u, neighbors] of adjList.entries()) {
    if (neighbors.length > 1) {
      const [ux, uy] = project2D(u);
      neighbors.sort((a, b) => {
        const [ax, ay] = project2D(a);
        const [bx, by] = project2D(b);
        const angA = Math.atan2(ay - uy, ax - ux);
        const angB = Math.atan2(by - uy, bx - ux);
        return angA - angB;
      });
    }
  }

  // Eulerian cycle peeling into simple Jordan cycles
  const rawLoops: number[][] = [];
  const startNodes = Array.from(adjList.keys());

  for (let sIdx = 0; sIdx < startNodes.length; sIdx++) {
    const startNode = startNodes[sIdx];
    while ((adjList.get(startNode)?.length || 0) > 0) {
      const path: number[] = [startNode];
      const pos = new Map<number, number>();
      pos.set(startNode, 0);

      while (path.length > 0) {
        const curr = path[path.length - 1];
        const neighbors = adjList.get(curr);
        if (neighbors && neighbors.length > 0) {
          const nxt = neighbors.pop()!;
          const existingPos = pos.get(nxt);
          if (existingPos !== undefined) {
            const cycle = path.slice(existingPos);
            if (cycle.length >= 3) {
              rawLoops.push(cycle);
            }
            while (path.length > existingPos) {
              const removed = path.pop()!;
              pos.delete(removed);
            }
            pos.set(nxt, path.length);
            path.push(nxt);
          } else {
            pos.set(nxt, path.length);
            path.push(nxt);
          }
        } else {
          const removed = path.pop()!;
          pos.delete(removed);
        }
      }
    }
  }

  if (rawLoops.length === 0) return null;

  // Classify loops by 2D Shoelace area and orientation
  const projectedLoops: ProjectedLoop[] = [];
  let outerCount = 0;

  for (let l = 0; l < rawLoops.length; l++) {
    let lp = rawLoops[l];
    const len = lp.length;
    const coords2D: [number, number][] = new Array(len);

    for (let i = 0; i < len; i++) {
      coords2D[i] = project2D(lp[i]);
    }

    let area2 = 0;
    for (let i = 0; i < len; i++) {
      const [x0, y0] = coords2D[i];
      const [x1, y1] = coords2D[(i + 1) % len];
      area2 += x0 * y1 - x1 * y0;
    }
    const area = 0.5 * area2;
    if (Math.abs(area) < 1e-10) continue; // degenerate micro-loop

    const isOuter = cluster.sameSense === 1 ? area > 0 : area < 0;

    // ISO 10303-42 Invariant: outer loop must be strictly counter-clockwise (CCW, area > 0)
    // relative to the face normal. If orientation does not match, reverse vertices.
    if ((isOuter && area < 0 && cluster.sameSense === 1) ||
        (isOuter && area > 0 && cluster.sameSense === 0)) {
      lp = lp.slice().reverse();
      coords2D.reverse();
    }

    if (isOuter) outerCount++;
    projectedLoops.push({ loop: lp, coords2D, area, isOuter });
  }

  if (outerCount === 0) return null;

  const sameSenseBool = cluster.sameSense === 1;

  // Single outer boundary face
  if (outerCount === 1) {
    const outer = projectedLoops.find(p => p.isOuter)!;
    const holes = projectedLoops.filter(p => !p.isOuter).map(p => p.loop);
    return [{
      outerLoop: outer.loop,
      holeLoops: holes.length > 0 ? holes : undefined,
      surfaceId: cluster.surfaceId,
      sameSense: sameSenseBool
    }];
  }

  // Multi-outer boundary faces (e.g. crossing branches of 'X', disjoint islands)
  const outers = projectedLoops.filter(p => p.isOuter);
  const holes = projectedLoops.filter(p => !p.isOuter);
  const faces: JordanFaceDefinition[] = [];

  for (let oIdx = 0; oIdx < outers.length; oIdx++) {
    const outer = outers[oIdx];
    const myHoles: number[][] = [];

    for (let hIdx = 0; hIdx < holes.length; hIdx++) {
      const h = holes[hIdx];
      // Robust multi-point centroid testing for point-in-polygon
      let sumX = 0, sumY = 0;
      for (let i = 0; i < h.coords2D.length; i++) {
        sumX += h.coords2D[i][0];
        sumY += h.coords2D[i][1];
      }
      const testX = sumX / h.coords2D.length;
      const testY = sumY / h.coords2D.length;

      let inside = false;
      const poly = outer.coords2D;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1];
        const xj = poly[j][0], yj = poly[j][1];
        const intersect =
          yi > testY !== yj > testY &&
          testX < ((xj - xi) * (testY - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
      }

      if (inside) {
        myHoles.push(h.loop);
      }
    }

    faces.push({
      outerLoop: outer.loop,
      holeLoops: myHoles.length > 0 ? myHoles : undefined,
      surfaceId: cluster.surfaceId,
      sameSense: sameSenseBool
    });
  }

  return faces;
}
