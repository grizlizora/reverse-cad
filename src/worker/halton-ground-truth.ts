// ==============================================================================
// src/worker/halton-ground-truth.ts — Deterministic Halton Ground-Truth Sampler
// ==============================================================================
// Extracts a compact, deterministic 3,000-triangle ground-truth reference mesh
// (~84 KB) when the input mesh is huge (> 50,000 triangles), allowing a 500MB
// rawMesh to be freed immediately after Stage 2 without OOM while preserving
// Gate 4 ground-truth verification.
// ==============================================================================

import { RawMesh } from '../types/geometry.js';

export function haltonSequence(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}

function computeTriangleDoubleAreaSq(
  pos: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number {
  const v0 = i0 * 3, v1 = i1 * 3, v2 = i2 * 3;
  const ax = pos[v1] - pos[v0], ay = pos[v1 + 1] - pos[v0 + 1], az = pos[v1 + 2] - pos[v0 + 2];
  const bx = pos[v2] - pos[v0], by = pos[v2 + 1] - pos[v0 + 1], bz = pos[v2 + 2] - pos[v0 + 2];
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  return cx * cx + cy * cy + cz * cz;
}

/**
 * Extracts a compact, deterministic ground-truth reference mesh (~84 KB) when
 * `rawMesh.triangleCount > 50,000`. Prioritizes any large structural facets so
 * hybrid meshes (few huge datum triangles + thousands of micro-facets) never lose
 * their primary datum planes, then fills the remaining budget via Halton base-3
 * sampling without replacement.
 * For standard meshes (<= 50,000 triangles), returns the exact original mesh.
 */
export function extractHaltonGroundTruthReference(
  rawMesh: RawMesh,
  sampleCount: number = 3000
): RawMesh {
  const totalTris = rawMesh.triangleCount;
  if (totalTris <= 50000 || totalTris <= sampleCount) {
    return rawMesh;
  }

  const k = Math.min(sampleCount, totalTris);
  const pos = rawMesh.positions;
  const idx = rawMesh.indices;
  const picked = new Uint8Array(totalTris);
  const selectedTris = new Uint32Array(k);
  let selectedCount = 0;

  // 1. Seed large structural triangles (area > 4x mean triangle area) up to k/4 budget
  let sumAreaSq = 0;
  const stride = Math.max(1, Math.floor(totalTris / 4096));
  let sampledForMean = 0;
  for (let t = 0; t < totalTris; t += stride) {
    const t3 = t * 3;
    sumAreaSq += computeTriangleDoubleAreaSq(pos, idx[t3], idx[t3 + 1], idx[t3 + 2]);
    sampledForMean++;
  }
  const largeThresholdSq = (sumAreaSq / Math.max(1, sampledForMean)) * 16.0;
  const maxLargeBudget = k >> 2;

  if (largeThresholdSq > 0) {
    for (let t = 0; t < totalTris && selectedCount < maxLargeBudget; t++) {
      const t3 = t * 3;
      if (computeTriangleDoubleAreaSq(pos, idx[t3], idx[t3 + 1], idx[t3 + 2]) >= largeThresholdSq) {
        picked[t] = 1;
        selectedTris[selectedCount++] = t;
      }
    }
  }

  // 2. Fill remaining budget using deterministic Halton base-3 sequence without replacement
  for (let s = 0; selectedCount < k; s++) {
    let tIdx = Math.min(totalTris - 1, Math.floor(haltonSequence(s + 1, 3) * totalTris));
    while (picked[tIdx] !== 0) {
      tIdx = (tIdx + 1) % totalTris;
    }
    picked[tIdx] = 1;
    selectedTris[selectedCount++] = tIdx;
  }

  const outPositions = new Float32Array(k * 9);
  const outNormals = new Float32Array(k * 3);
  const outIndices = new Uint32Array(k * 3);

  for (let s = 0; s < k; s++) {
    const tIdx = selectedTris[s];
    const i0 = idx[tIdx * 3];
    const i1 = idx[tIdx * 3 + 1];
    const i2 = idx[tIdx * 3 + 2];

    const vBase = s * 9;
    outPositions[vBase] = pos[i0 * 3];
    outPositions[vBase + 1] = pos[i0 * 3 + 1];
    outPositions[vBase + 2] = pos[i0 * 3 + 2];

    outPositions[vBase + 3] = pos[i1 * 3];
    outPositions[vBase + 4] = pos[i1 * 3 + 1];
    outPositions[vBase + 5] = pos[i1 * 3 + 2];

    outPositions[vBase + 6] = pos[i2 * 3];
    outPositions[vBase + 7] = pos[i2 * 3 + 1];
    outPositions[vBase + 8] = pos[i2 * 3 + 2];

    if (rawMesh.normals) {
      outNormals[s * 3] = rawMesh.normals[tIdx * 3];
      outNormals[s * 3 + 1] = rawMesh.normals[tIdx * 3 + 1];
      outNormals[s * 3 + 2] = rawMesh.normals[tIdx * 3 + 2];
    }

    outIndices[s * 3] = s * 3;
    outIndices[s * 3 + 1] = s * 3 + 1;
    outIndices[s * 3 + 2] = s * 3 + 2;
  }

  return {
    positions: outPositions,
    normals: outNormals,
    indices: outIndices,
    triangleCount: k,
    vertexCount: k * 3,
    boundingBox: rawMesh.boundingBox
  };
}
