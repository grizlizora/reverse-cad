// ==============================================================================
// src/kernel/step/planar/coplanar-clusterer.ts — Float64 Point-to-Plane BFS Clusterer
// ==============================================================================

import { TopologyEdgeIndexer } from '../topology-edge-indexer.js';

export interface CoplanarCluster {
  triangleIndices: number[];
  normal: [number, number, number];
  originPoint: [number, number, number];
  surfaceId: string;
  sameSense: number;
}

export interface CoplanarClusterOptions {
  cosAngleTol?: number; // default 0.999 (~2.5 degrees)
  pointToPlaneTol?: number; // default 0.012 mm
}

/**
 * High-precision coplanar triangle clustering using true orthogonal Float64 point-to-plane distance.
 * Completely eliminates the "lever-arm defect" where distance from the coordinate origin distorted clustering.
 */
export function clusterCoplanarTriangles(
  triIndices: number[],
  indices: Uint32Array,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  triangleToSurfaceId: Map<number, string>,
  triangleSameSense: Uint8Array,
  edgeIndexer: TopologyEdgeIndexer,
  options: CoplanarClusterOptions = {}
): CoplanarCluster[] {
  const cosAngleTol = options.cosAngleTol ?? 0.999;
  const pointToPlaneTol = options.pointToPlaneTol ?? 0.012;

  const triCount = triIndices.length;
  if (triCount === 0) return [];

  // Pre-compute high-precision Float64 normals and centroids
  const triNormals = new Float64Array(triCount * 3);
  const triCentroids = new Float64Array(triCount * 3);

  for (let k = 0; k < triCount; k++) {
    const t = triIndices[k];
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    const p0x = stepVerticesX[i0], p0y = stepVerticesY[i0], p0z = stepVerticesZ[i0];
    const p1x = stepVerticesX[i1], p1y = stepVerticesY[i1], p1z = stepVerticesZ[i1];
    const p2x = stepVerticesX[i2], p2y = stepVerticesY[i2], p2z = stepVerticesZ[i2];

    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len; ny /= len; nz /= len;
    } else {
      nx = 0; ny = 0; nz = 1;
    }

    const k3 = k * 3;
    triNormals[k3] = nx;
    triNormals[k3 + 1] = ny;
    triNormals[k3 + 2] = nz;

    triCentroids[k3] = (p0x + p1x + p2x) / 3.0;
    triCentroids[k3 + 1] = (p0y + p1y + p2y) / 3.0;
    triCentroids[k3 + 2] = (p0z + p1z + p2z) / 3.0;
  }

  // Fast mapping from triangle index to shell-local index k
  const triToK = new Map<number, number>();
  for (let k = 0; k < triCount; k++) {
    triToK.set(triIndices[k], k);
  }

  const visited = new Uint8Array(triCount);
  // Zero-allocation fixed typed array queue for BFS
  const bfsQueue = new Int32Array(triCount);
  const clusters: CoplanarCluster[] = [];

  for (let k = 0; k < triCount; k++) {
    if (visited[k]) continue;

    const baseT = triIndices[k];
    const surfBase = triangleToSurfaceId.get(baseT)!;
    const senseBase = triangleSameSense[baseT];

    const k3 = k * 3;
    const nxBase = triNormals[k3];
    const nyBase = triNormals[k3 + 1];
    const nzBase = triNormals[k3 + 2];
    const cxBase = triCentroids[k3];
    const cyBase = triCentroids[k3 + 1];
    const czBase = triCentroids[k3 + 2];

    let qHead = 0;
    let qTail = 0;
    bfsQueue[qTail++] = k;
    visited[k] = 1;

    const compTris: number[] = [];

    while (qHead < qTail) {
      const currK = bfsQueue[qHead++];
      const currT = triIndices[currK];
      compTris.push(currT);

      const t3 = currT * 3;
      const v0 = indices[t3];
      const v1 = indices[t3 + 1];
      const v2 = indices[t3 + 2];

      for (let e = 0; e < 3; e++) {
        const ea = e === 0 ? v0 : (e === 1 ? v1 : v2);
        const eb = e === 0 ? v1 : (e === 1 ? v2 : v0);
        const adj = edgeIndexer.getAdjacentTriangleList(ea, eb);
        if (!adj) continue;

        for (let a = 0; a < adj.length; a++) {
          const neighborT = adj[a];
          const neighborK = triToK.get(neighborT);
          if (neighborK === undefined || visited[neighborK]) continue;

          // Invariant 1: Curved surface boundary protection (cylinders/cones/tori/spheres must not merge with planes)
          const surfNeigh = triangleToSurfaceId.get(neighborT);
          if (surfBase !== undefined && surfNeigh !== undefined && surfNeigh !== surfBase) {
            const isCurvedBase = surfBase.startsWith('cyl_') || surfBase.startsWith('cone_') || surfBase.startsWith('torus_') || surfBase.startsWith('sphere_');
            const isCurvedNeigh = surfNeigh.startsWith('cyl_') || surfNeigh.startsWith('cone_') || surfNeigh.startsWith('torus_') || surfNeigh.startsWith('sphere_');
            if (isCurvedBase || isCurvedNeigh) continue;
          }
          // Invariant 2: Surface orientation sense must match
          if (triangleSameSense && triangleSameSense[neighborT] !== senseBase) continue;

          const nK3 = neighborK * 3;
          // Invariant 3: Normal alignment
          const nDot =
            nxBase * triNormals[nK3] +
            nyBase * triNormals[nK3 + 1] +
            nzBase * triNormals[nK3 + 2];
          if (nDot < cosAngleTol) continue;

          // Invariant 4: True orthogonal point-to-plane distance (fixing lever-arm defect)
          const cNx = triCentroids[nK3];
          const cNy = triCentroids[nK3 + 1];
          const cNz = triCentroids[nK3 + 2];
          const distToPlane = Math.abs(
            nxBase * (cNx - cxBase) +
            nyBase * (cNy - cyBase) +
            nzBase * (cNz - czBase)
          );
          if (distToPlane > pointToPlaneTol) continue;

          visited[neighborK] = 1;
          bfsQueue[qTail++] = neighborK;
        }
      }
    }

    clusters.push({
      triangleIndices: compTris,
      normal: [nxBase, nyBase, nzBase],
      originPoint: [cxBase, cyBase, czBase],
      surfaceId: surfBase,
      sameSense: senseBase
    });
  }

  return clusters;
}
