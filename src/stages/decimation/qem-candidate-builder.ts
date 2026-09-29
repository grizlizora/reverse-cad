// ==============================================================================
// src/stages/decimation/qem-candidate-builder.ts — Zero-Alloc QEM Candidate Builder
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { MeshCSR } from './mesh-csr.js';
import { QEMCollapseQueue } from './qem-collapse-queue.js';
import { ScaleInvariantQEMTolerances } from './qem-datum-locks.js';
import { evaluateQuadricEdgeCost } from '../../math/quadric-matrix.js';

export interface CandidateBuilderOptions {
  scaledMaxErrorSq: number;
}

/**
 * Zero-allocation population of binary heap QEM candidate queue.
 * Iterates directly via keys() without generating intermediate MapIterator tuple entries.
 */
export function populateQEMCandidateQueue(
  queue: QEMCollapseQueue,
  mesh: RawMesh,
  csr: MeshCSR,
  Q: Float64Array,
  tol: ScaleInvariantQEMTolerances,
  isVertexLocked: Uint8Array,
  isDatumPlaneVertex: Uint8Array,
  options: CandidateBuilderOptions
): void {
  const { positions } = mesh;
  const { faceNormals, edgeToFaces } = csr;
  const scaledMaxErrorSq = options.scaledMaxErrorSq;

  for (const key of edgeToFaces.keys()) {
    const faces = edgeToFaces.get(key)!;
    if (faces.length !== 2) continue;

    const vA = Math.floor(key / 67108864);
    const vB = key % 67108864;

    if (isDatumPlaneVertex[vA] || isDatumPlaneVertex[vB]) continue;

    const dx = positions[vA * 3] - positions[vB * 3];
    const dy = positions[vA * 3 + 1] - positions[vB * 3 + 1];
    const dz = positions[vA * 3 + 2] - positions[vB * 3 + 2];
    const edgeLenSq = dx * dx + dy * dy + dz * dz;

    const lockedA = isVertexLocked[vA] === 1;
    const lockedB = isVertexLocked[vB] === 1;

    // Strict geometric safeguards against hole plugging, webbing, and bore penetration:
    if (lockedA && lockedB) {
      if (edgeLenSq > tol.maxCreaseLenSq) continue;
    }
    if ((lockedA || lockedB) && edgeLenSq > tol.maxFeatureLenSq) continue;
    if (edgeLenSq > tol.maxInteriorLenSq) continue;

    let targetV = -1;
    let removeV = -1;
    let bestCost = Infinity;

    if (lockedA && !lockedB) {
      targetV = vA;
      removeV = vB;
      bestCost = evaluateQuadricEdgeCost(Q, positions, vA, vB, vA);
    } else if (!lockedA && lockedB) {
      targetV = vB;
      removeV = vA;
      bestCost = evaluateQuadricEdgeCost(Q, positions, vA, vB, vB);
    } else if (!lockedA && !lockedB) {
      const costA = evaluateQuadricEdgeCost(Q, positions, vA, vB, vA);
      const costB = evaluateQuadricEdgeCost(Q, positions, vA, vB, vB);
      bestCost = costA < costB ? costA : costB;
      targetV = costA < costB ? vA : vB;
      removeV = costA < costB ? vB : vA;
    } else {
      const t0 = faces[0] * 3, t1 = faces[1] * 3;
      const dot =
        faceNormals[t0] * faceNormals[t1] +
        faceNormals[t0 + 1] * faceNormals[t1 + 1] +
        faceNormals[t0 + 2] * faceNormals[t1 + 2];
      if (dot < 0.40) continue;

      const costA = evaluateQuadricEdgeCost(Q, positions, vA, vB, vA);
      const costB = evaluateQuadricEdgeCost(Q, positions, vA, vB, vB);
      bestCost = costA < costB ? costA : costB;
      targetV = costA < costB ? vA : vB;
      removeV = costA < costB ? vB : vA;
    }

    if (bestCost <= scaledMaxErrorSq) {
      queue.pushValues(targetV, removeV, bestCost);
    }
  }
}
