// ==============================================================================
// src/stages/decimation/mesh-csr.ts — Compressed Sparse Row Mesh Incidence
// ==============================================================================

import { RawMesh, Point3D, Vector3D } from '../../types/geometry.js';
import { triangleNormal } from '../../math/index.js';

export interface MeshCSR {
  faceNormals: Float32Array; // 3 * numTriangles
  vOffsets: Uint32Array;     // numVertices + 1
  vTris: Uint32Array;        // 3 * numTriangles
  edgeToFaces: Map<number, number[]>;
}

/**
 * Fast 53-bit safe integer edge key (zero string/BigInt allocation in V8)
 */
export function getFastEdgeKey(vA: number, vB: number): number {
  return vA < vB ? vA * 67108864 + vB : vB * 67108864 + vA;
}

/**
 * Builds CSR (Compressed Sparse Row) vertex-to-triangle incidence and computes face normals.
 * Uses flat TypedArrays, eliminating millions of temporary small JS array objects and GC pressure.
 */
export function buildMeshCSR(mesh: RawMesh): MeshCSR {
  const numVertices = mesh.vertexCount;
  const numTriangles = mesh.triangleCount;
  const positions = mesh.positions;
  const indices = mesh.indices;

  // 1. Calculate face normals
  const faceNormals = new Float32Array(numTriangles * 3);
  const vDegrees = new Uint32Array(numVertices);

  const edgeToFaces = new Map<number, number[]>();

  for (let t = 0; t < numTriangles; t++) {
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    // Count vertex degrees
    vDegrees[i0]++;
    vDegrees[i1]++;
    vDegrees[i2]++;

    // Compute face normal
    const p0x = positions[i0 * 3], p0y = positions[i0 * 3 + 1], p0z = positions[i0 * 3 + 2];
    const p1x = positions[i1 * 3], p1y = positions[i1 * 3 + 1], p1z = positions[i1 * 3 + 2];
    const p2x = positions[i2 * 3], p2y = positions[i2 * 3 + 1], p2z = positions[i2 * 3 + 2];

    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;

    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);

    if (len > 1e-12) {
      faceNormals[t3] = nx / len;
      faceNormals[t3 + 1] = ny / len;
      faceNormals[t3 + 2] = nz / len;
    } else {
      faceNormals[t3] = 0;
      faceNormals[t3 + 1] = 0;
      faceNormals[t3 + 2] = 1;
    }

    // Build edge map
    const e1 = getFastEdgeKey(i0, i1);
    const e2 = getFastEdgeKey(i1, i2);
    const e3 = getFastEdgeKey(i2, i0);

    for (const key of [e1, e2, e3]) {
      let list = edgeToFaces.get(key);
      if (!list) {
        list = [];
        edgeToFaces.set(key, list);
      }
      list.push(t);
    }
  }

  // 2. Build prefix sum for CSR offsets
  const vOffsets = new Uint32Array(numVertices + 1);
  for (let v = 0; v < numVertices; v++) {
    vOffsets[v + 1] = vOffsets[v] + vDegrees[v];
  }

  // 3. Fill CSR vTris
  const vTris = new Uint32Array(numTriangles * 3);
  const currentInsert = new Uint32Array(vOffsets);

  for (let t = 0; t < numTriangles; t++) {
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    vTris[currentInsert[i0]++] = t;
    vTris[currentInsert[i1]++] = t;
    vTris[currentInsert[i2]++] = t;
  }

  return {
    faceNormals,
    vOffsets,
    vTris,
    edgeToFaces
  };
}
