// ==============================================================================
// src/rsvs/procedural-chamfer-model.ts — Procedural Chamfer Crease Benchmark Model
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import { computeBoundingBox } from '../utils/math3d.js';

/**
 * Procedural Model 5: Chamfered Crease Solid with 90° and 45° dihedral angles.
 * Generates an in-memory watertight mesh where each quadrilateral face is subdivided
 * into an S x S quad grid (S=6 by default) to test feature-preserving decimation.
 * Guaranteed zero degenerate triangles (all quad vertices are strictly distinct).
 */
export function generateChamferCreaseModel(subdivision: number = 6): RawMesh {
  const S = subdivision;
  const vertices: number[] = [];
  const indices: number[] = [];
  const coordMap = new Map<string, number>();

  const getOrAddVertex = (x: number, y: number, z: number): number => {
    const qx = Math.round(x * 1000) / 1000;
    const qy = Math.round(y * 1000) / 1000;
    const qz = Math.round(z * 1000) / 1000;
    const key = `${qx.toFixed(3)},${qy.toFixed(3)},${qz.toFixed(3)}`;
    let idx = coordMap.get(key);
    if (idx === undefined) {
      idx = vertices.length / 3;
      coordMap.set(key, idx);
      vertices.push(qx, qy, qz);
    }
    return idx;
  };

  const addQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number]
  ) => {
    const grid: number[][] = [];
    for (let u = 0; u <= S; u++) {
      grid[u] = [];
      for (let v = 0; v <= S; v++) {
        const fu = u / S, fv = v / S;
        const x = (1 - fu) * ((1 - fv) * p0[0] + fv * p3[0]) + fu * ((1 - fv) * p1[0] + fv * p2[0]);
        const y = (1 - fu) * ((1 - fv) * p0[1] + fv * p3[1]) + fu * ((1 - fv) * p1[1] + fv * p2[1]);
        const z = (1 - fu) * ((1 - fv) * p0[2] + fv * p3[2]) + fu * ((1 - fv) * p1[2] + fv * p2[2]);
        grid[u][v] = getOrAddVertex(x, y, z);
      }
    }
    for (let u = 0; u < S; u++) {
      for (let v = 0; v < S; v++) {
        const i0 = grid[u][v];
        const i1 = grid[u + 1][v];
        const i2 = grid[u + 1][v + 1];
        const i3 = grid[u][v + 1];
        indices.push(i0, i1, i2, i0, i2, i3);
      }
    }
  };

  // 1. Top face (Z = 10, normal +Z)
  addQuad([-10, -10, 10], [10, -10, 10], [10, 10, 10], [-10, 10, 10]);
  // 2. 45° Chamfer face (from [10, Z=10] to [15, Z=5])
  addQuad([10, -10, 10], [15, -10, 5], [15, 10, 5], [10, 10, 10]);
  // 3. 90° Right wall (X = 15, normal +X)
  addQuad([15, -10, 5], [15, -10, 0], [15, 10, 0], [15, 10, 5]);
  // 4. Bottom face (Z = 0, normal -Z) split into two quads to align with X=10 split
  addQuad([15, -10, 0], [10, -10, 0], [10, 10, 0], [15, 10, 0]);
  addQuad([10, -10, 0], [-10, -10, 0], [-10, 10, 0], [10, 10, 0]);
  // 5. 90° Back wall (X = -10, normal -X)
  addQuad([-10, 10, 0], [-10, -10, 0], [-10, -10, 10], [-10, 10, 10]);
  // 6. Front endcap (Y = -10, normal -Y): non-degenerate rectangular + trapezoidal quads
  addQuad([-10, -10, 0], [10, -10, 0], [10, -10, 10], [-10, -10, 10]);
  addQuad([10, -10, 0], [15, -10, 0], [15, -10, 5], [10, -10, 10]);
  // 7. Back endcap (Y = +10, normal +Y): non-degenerate rectangular + trapezoidal quads
  addQuad([10, 10, 0], [-10, 10, 0], [-10, 10, 10], [10, 10, 10]);
  addQuad([15, 10, 0], [10, 10, 0], [10, 10, 10], [15, 10, 5]);

  const pos = new Float32Array(vertices);
  const ind = new Uint32Array(indices);
  return {
    positions: pos,
    indices: ind,
    vertexCount: pos.length / 3,
    triangleCount: ind.length / 3,
    boundingBox: computeBoundingBox(pos)
  };
}
