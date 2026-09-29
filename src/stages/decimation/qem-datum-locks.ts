// ==============================================================================
// src/stages/decimation/qem-datum-locks.ts — Scale-Invariant Tolerances & Datum Locks
// ==============================================================================

import { MeshCSR } from './mesh-csr.js';

export {
  computeVertexQuadrics,
  evaluateQuadricEdgeCost
} from '../../math/quadric-matrix.js';

export interface ScaleInvariantQEMTolerances {
  bboxDiag: number;
  scaleRatio: number;
  maxCreaseLenSq: number;
  maxFeatureLenSq: number;
  maxInteriorLenSq: number;
  maxInwardDisp: number;
  datumTol: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Computes scale-invariant characteristic dimensions and collapse length limits
 * calibrated for arbitrary part sizes (from micro-components to large castings).
 */
export function computeScaleInvariantTolerances(positions: Float32Array): ScaleInvariantQEMTolerances {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }

  const bboxDiag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
  // Calibrated reference diagonal for typical 100-150mm mechanical parts
  const scaleRatio = bboxDiag > 1e-4 ? Math.max(0.01, Math.min(100.0, bboxDiag / 140.0)) : 1.0;

  const maxCreaseLen = 0.20 * scaleRatio;
  const maxFeatureLen = 0.35 * scaleRatio;
  const maxInteriorLen = 1.20 * scaleRatio;
  const maxInwardDisp = 0.08 * scaleRatio;
  const datumTol = 0.05 * scaleRatio;

  return {
    bboxDiag,
    scaleRatio,
    maxCreaseLenSq: maxCreaseLen * maxCreaseLen,
    maxFeatureLenSq: maxFeatureLen * maxFeatureLen,
    maxInteriorLenSq: maxInteriorLen * maxInteriorLen,
    maxInwardDisp,
    datumTol,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ
  };
}

/**
 * Identifies vertices lying on datum cap planes (minZ and maxZ)
 * to preserve exact top/bottom mounting surfaces and hole rims.
 */
export function computeDatumPlaneVertices(
  positions: Float32Array,
  numVertices: number,
  minZ: number,
  maxZ: number,
  datumTol: number
): Uint8Array {
  const isDatumPlaneVertex = new Uint8Array(numVertices);
  for (let v = 0; v < numVertices; v++) {
    const z = positions[v * 3 + 2];
    if (Math.abs(z - minZ) < datumTol || Math.abs(z - maxZ) < datumTol) {
      isDatumPlaneVertex[v] = 1;
    }
  }
  return isDatumPlaneVertex;
}

/**
 * Detects entrance chamfer vertices (30°–60° slope bordering a planar datum face along any primary axis)
 * and orientation-independent planar boundary rims so FeatureShield locks them against QEM collapse.
 */
export function computeChamferAndDatumLocks(
  csr: MeshCSR,
  numVertices: number
): Uint8Array {
  const { vOffsets, vTris, faceNormals } = csr;
  const isChamferVertex = new Uint8Array(numVertices);

  for (let v = 0; v < numVertices; v++) {
    const start = vOffsets[v];
    const end = vOffsets[v + 1];
    let hasChamferSlope = false;
    let hasFlatAdjacent = false;
    for (let i = start; i < end; i++) {
      const t = vTris[i] * 3;
      const nx = Math.abs(faceNormals[t]);
      const ny = Math.abs(faceNormals[t + 1]);
      const nz = Math.abs(faceNormals[t + 2]);
      const maxAxisComp = Math.max(nx, ny, nz);
      if (maxAxisComp >= 0.45 && maxAxisComp <= 0.88) hasChamferSlope = true;
      if (maxAxisComp >= 0.98) hasFlatAdjacent = true;
    }
    if (hasChamferSlope && hasFlatAdjacent) {
      isChamferVertex[v] = 1;
    }
  }

  return isChamferVertex;
}
