// ==============================================================================
// src/math/quadric-matrix.ts — Garland-Heckbert 4x4 Quadric Error Matrices
// ==============================================================================

import { RawMesh } from '../types/geometry.js';

/**
 * Assembles symmetric 4x4 Garland-Heckbert Quadric Error Matrices (10 Float64 values per vertex),
 * weighted by triangle surface area.
 */
export function computeVertexQuadrics(mesh: RawMesh, faceNormals: Float32Array): Float64Array {
  const { positions, indices, vertexCount: numVertices, triangleCount: numTriangles } = mesh;
  const Q = new Float64Array(numVertices * 10);

  for (let t = 0; t < numTriangles; t++) {
    const t3 = t * 3;
    const v0 = indices[t3], v1 = indices[t3 + 1], v2 = indices[t3 + 2];
    const nx = faceNormals[t3], ny = faceNormals[t3 + 1], nz = faceNormals[t3 + 2];

    const p0x = positions[v0 * 3], p0y = positions[v0 * 3 + 1], p0z = positions[v0 * 3 + 2];
    const p1x = positions[v1 * 3], p1y = positions[v1 * 3 + 1], p1z = positions[v1 * 3 + 2];
    const p2x = positions[v2 * 3], p2y = positions[v2 * 3 + 1], p2z = positions[v2 * 3 + 2];

    const e10x = p1x - p0x, e10y = p1y - p0y, e10z = p1z - p0z;
    const e20x = p2x - p0x, e20y = p2y - p0y, e20z = p2z - p0z;
    const cx = e10y * e20z - e10z * e20y;
    const cy = e10z * e20x - e10x * e20z;
    const cz = e10x * e20y - e10y * e20x;
    const area = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);

    const d = -(nx * p0x + ny * p0y + nz * p0z);

    const a00 = area * nx * nx, a01 = area * nx * ny, a02 = area * nx * nz, a03 = area * nx * d;
    const a11 = area * ny * ny, a12 = area * ny * nz, a13 = area * ny * d;
    const a22 = area * nz * nz, a23 = area * nz * d;
    const a33 = area * d * d;

    const i0 = v0 * 10;
    Q[i0] += a00;     Q[i0 + 1] += a01; Q[i0 + 2] += a02; Q[i0 + 3] += a03;
    Q[i0 + 4] += a11; Q[i0 + 5] += a12; Q[i0 + 6] += a13;
    Q[i0 + 7] += a22; Q[i0 + 8] += a23; Q[i0 + 9] += a33;

    const i1 = v1 * 10;
    Q[i1] += a00;     Q[i1 + 1] += a01; Q[i1 + 2] += a02; Q[i1 + 3] += a03;
    Q[i1 + 4] += a11; Q[i1 + 5] += a12; Q[i1 + 6] += a13;
    Q[i1 + 7] += a22; Q[i1 + 8] += a23; Q[i1 + 9] += a33;

    const i2 = v2 * 10;
    Q[i2] += a00;     Q[i2 + 1] += a01; Q[i2 + 2] += a02; Q[i2 + 3] += a03;
    Q[i2 + 4] += a11; Q[i2 + 5] += a12; Q[i2 + 6] += a13;
    Q[i2 + 7] += a22; Q[i2 + 8] += a23; Q[i2 + 9] += a33;
  }

  return Q;
}

/**
 * Evaluates quadratic form v^T (Q_A + Q_B) v for collapsing edge (vA, vB) into vertex targetPosV.
 */
export function evaluateQuadricEdgeCost(
  Q: Float64Array,
  positions: Float32Array,
  vA: number,
  vB: number,
  targetPosV: number
): number {
  const qA = vA * 10;
  const qB = vB * 10;
  const q00 = Q[qA] + Q[qB];
  const q01 = Q[qA + 1] + Q[qB + 1];
  const q02 = Q[qA + 2] + Q[qB + 2];
  const q03 = Q[qA + 3] + Q[qB + 3];
  const q11 = Q[qA + 4] + Q[qB + 4];
  const q12 = Q[qA + 5] + Q[qB + 5];
  const q13 = Q[qA + 6] + Q[qB + 6];
  const q22 = Q[qA + 7] + Q[qB + 7];
  const q23 = Q[qA + 8] + Q[qB + 8];
  const q33 = Q[qA + 9] + Q[qB + 9];

  const x = positions[targetPosV * 3];
  const y = positions[targetPosV * 3 + 1];
  const z = positions[targetPosV * 3 + 2];

  return (
    q00 * x * x + 2.0 * q01 * x * y + 2.0 * q02 * x * z + 2.0 * q03 * x +
    q11 * y * y + 2.0 * q12 * y * z + 2.0 * q13 * y +
    q22 * z * z + 2.0 * q23 * z +
    q33
  );
}
