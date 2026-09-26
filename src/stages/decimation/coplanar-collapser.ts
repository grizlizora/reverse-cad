// ==============================================================================
// src/stages/decimation/coplanar-collapser.ts — Safe Coplanar Edge Collapse
// ==============================================================================

import { RawMesh, Point3D } from '../../types/geometry.js';
import { MeshCSR } from './mesh-csr.js';

export interface CollapseResult {
  remap: Int32Array;
  collapsedCount: number;
}

/**
 * Collapses internal coplanar edges while strictly preventing normal flips
 * and aspect-ratio slivers.
 */
export function collapseCoplanarEdges(
  mesh: RawMesh,
  csr: MeshCSR,
  isVertexLocked: Uint8Array,
  coplanarAngleRad: number,
  targetTriangles: number
): CollapseResult {
  const numVertices = mesh.vertexCount;
  const numTriangles = mesh.triangleCount;
  const positions = mesh.positions;
  const indices = mesh.indices;
  const { faceNormals, vOffsets, vTris, edgeToFaces } = csr;

  const cosCoplanar = Math.cos(coplanarAngleRad);

  const remap = new Int32Array(numVertices);
  for (let i = 0; i < numVertices; i++) remap[i] = i;

  const findRoot = (v: number): number => {
    let curr = v;
    while (remap[curr] !== curr) {
      curr = remap[curr];
    }
    remap[v] = curr;
    return curr;
  };

  // Convert CSR into mutable incident array for vertices that get modified
  const vTrisLists: number[][] = new Array(numVertices);
  for (let v = 0; v < numVertices; v++) {
    const start = vOffsets[v];
    const end = vOffsets[v + 1];
    const count = end - start;
    const list = new Array(count);
    for (let j = 0; j < count; j++) {
      list[j] = vTris[start + j];
    }
    vTrisLists[v] = list;
  }

  let remainingTriangles = numTriangles;

  const wouldInvertNormal = (vTarget: number, vRemove: number): boolean => {
    const pTargetX = positions[vTarget * 3];
    const pTargetY = positions[vTarget * 3 + 1];
    const pTargetZ = positions[vTarget * 3 + 2];

    const incidentTris = vTrisLists[vRemove];
    if (!incidentTris) return false;

    for (let k = 0; k < incidentTris.length; k++) {
      const t = incidentTris[k];
      const t3 = t * 3;
      const i0 = findRoot(indices[t3]);
      const i1 = findRoot(indices[t3 + 1]);
      const i2 = findRoot(indices[t3 + 2]);

      const newI0 = i0 === vRemove ? vTarget : i0;
      const newI1 = i1 === vRemove ? vTarget : i1;
      const newI2 = i2 === vRemove ? vTarget : i2;

      // Degenerate collapsed triangle
      if (newI0 === newI1 || newI1 === newI2 || newI2 === newI0) {
        continue;
      }

      const p0x = newI0 === vTarget ? pTargetX : positions[newI0 * 3];
      const p0y = newI0 === vTarget ? pTargetY : positions[newI0 * 3 + 1];
      const p0z = newI0 === vTarget ? pTargetZ : positions[newI0 * 3 + 2];

      const p1x = newI1 === vTarget ? pTargetX : positions[newI1 * 3];
      const p1y = newI1 === vTarget ? pTargetY : positions[newI1 * 3 + 1];
      const p1z = newI1 === vTarget ? pTargetZ : positions[newI1 * 3 + 2];

      const p2x = newI2 === vTarget ? pTargetX : positions[newI2 * 3];
      const p2y = newI2 === vTarget ? pTargetY : positions[newI2 * 3 + 1];
      const p2z = newI2 === vTarget ? pTargetZ : positions[newI2 * 3 + 2];

      // New face normal
      const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
      const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-12) return true;

      const invLen = 1.0 / len;
      const normNx = nx * invLen;
      const normNy = ny * invLen;
      const normNz = nz * invLen;

      const oldNx = faceNormals[t3];
      const oldNy = faceNormals[t3 + 1];
      const oldNz = faceNormals[t3 + 2];

      const dotVal = normNx * oldNx + normNy * oldNy + normNz * oldNz;
      if (dotVal < 0.98) {
        return true;
      }

      // Check aspect ratio to prevent creating sliver triangles
      const e01x = p1x - p0x, e01y = p1y - p0y, e01z = p1z - p0z;
      const e12x = p2x - p1x, e12y = p2y - p1y, e12z = p2z - p1z;
      const e20x = p0x - p2x, e20y = p0y - p2y, e20z = p0z - p2z;

      const l01 = Math.sqrt(e01x * e01x + e01y * e01y + e01z * e01z);
      const l12 = Math.sqrt(e12x * e12x + e12y * e12y + e12z * e12z);
      const l20 = Math.sqrt(e20x * e20x + e20y * e20y + e20z * e20z);
      const maxEdge = Math.max(l01, l12, l20);

      const crossX = e01y * (-e20z) - e01z * (-e20y);
      const crossY = e01z * (-e20x) - e01x * (-e20z);
      const crossZ = e01x * (-e20y) - e01y * (-e20x);
      const area2 = Math.sqrt(crossX * crossX + crossY * crossY + crossZ * crossZ);
      const minHeight = area2 / (maxEdge + 1e-12);
      if (minHeight < 0.04 * maxEdge) {
        return true;
      }
    }
    return false;
  };

  for (const [key, faces] of edgeToFaces.entries()) {
    if (remainingTriangles <= targetTriangles) break;
    if (faces.length !== 2) continue;

    const vA = Math.floor(key / 67108864);
    const vB = key % 67108864;

    const rootA = findRoot(vA);
    const rootB = findRoot(vB);
    if (rootA === rootB) continue;

    if (isVertexLocked[rootA] || isVertexLocked[rootB]) continue;

    const t0 = faces[0] * 3;
    const t1 = faces[1] * 3;
    const dotVal =
      faceNormals[t0] * faceNormals[t1] +
      faceNormals[t0 + 1] * faceNormals[t1 + 1] +
      faceNormals[t0 + 2] * faceNormals[t1 + 2];

    if (dotVal < cosCoplanar) continue;

    if (wouldInvertNormal(rootA, rootB)) continue;

    remap[rootB] = rootA;
    remainingTriangles -= 2;

    const listA = vTrisLists[rootA];
    const listB = vTrisLists[rootB];
    if (listA && listB) {
      for (let k = 0; k < listB.length; k++) {
        listA.push(listB[k]);
      }
    }
  }

  return {
    remap,
    collapsedCount: numTriangles - remainingTriangles
  };
}
