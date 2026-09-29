// ==============================================================================
// src/stages/decimation/coplanar-collapser.ts — Safe Coplanar Edge Collapse
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { MeshCSR } from './mesh-csr.js';
import { FlatVertexIncidence } from './mesh-incidence-flat.js';
import {
  computeScaleInvariantTolerances,
  computeDatumPlaneVertices,
  computeChamferAndDatumLocks
} from './qem-datum-locks.js';
import { validateCollapseSafety } from './collapse-validator.js';

export interface CollapseResult {
  remap: Int32Array;
  collapsedCount: number;
}

/**
 * Collapses internal coplanar edges while strictly preventing normal flips,
 * aspect-ratio slivers, and datum plane erosion. Uses Zero-Allocation FlatVertexIncidence,
 * synchronized datum locks, and scale-invariant edge thresholds.
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
  const { faceNormals, edgeToFaces } = csr;

  const cosCoplanar = Math.cos(coplanarAngleRad);

  const remap = new Int32Array(numVertices);
  for (let i = 0; i < numVertices; i++) remap[i] = i;

  const findRoot = (v: number): number => {
    let curr = v;
    while (remap[curr] !== curr) {
      remap[curr] = remap[remap[curr]];
      curr = remap[curr];
    }
    return curr;
  };

  // Zero-allocation flat linked vertex-triangle incidence
  const incidence = new FlatVertexIncidence(numVertices, csr);
  const { head, next, vTris } = incidence;

  // Scale-invariant thresholds, datum plane locks, and entrance chamfer locks
  const tol = computeScaleInvariantTolerances(positions);
  const scaleSq = tol.scaleRatio * tol.scaleRatio;
  const maxCoplanarLockedLenSq = 0.64 * scaleSq;
  const maxFlankLenSq = 0.36 * scaleSq;
  const maxCreaseMicroLenSq = 0.16 * scaleSq;

  const isDatumPlaneVertex = computeDatumPlaneVertices(
    positions,
    numVertices,
    tol.minZ,
    tol.maxZ,
    tol.datumTol
  );
  const isChamferVertex = computeChamferAndDatumLocks(csr, numVertices);

  let remainingTriangles = numTriangles;

  const validationCtx = {
    positions,
    indices,
    faceNormals,
    vTris,
    head,
    next,
    findRoot
  };

  const validationOpts = {
    minCosNormalDev: 0.98,
    minHeightRatio: 0.01
  };

  for (const [key, faces] of edgeToFaces.entries()) {
    if (remainingTriangles <= targetTriangles) break;
    if (faces.length !== 2) continue;

    const vA = Math.floor(key / 67108864);
    const vB = key % 67108864;

    const rootA = findRoot(vA);
    const rootB = findRoot(vB);
    if (rootA === rootB) continue;

    const t0 = faces[0] * 3;
    const t1 = faces[1] * 3;
    const dotVal =
      faceNormals[t0] * faceNormals[t1] +
      faceNormals[t0 + 1] * faceNormals[t1 + 1] +
      faceNormals[t0 + 2] * faceNormals[t1 + 2];

    const dx = positions[rootA * 3] - positions[rootB * 3];
    const dy = positions[rootA * 3 + 1] - positions[rootB * 3 + 1];
    const dz = positions[rootA * 3 + 2] - positions[rootB * 3 + 2];
    const edgeLenSq = dx * dx + dy * dy + dz * dz;

    let targetV = -1;
    let removeV = -1;

    const lockedA = isVertexLocked[rootA];
    const lockedB = isVertexLocked[rootB];
    const datumA = isDatumPlaneVertex[rootA];
    const datumB = isDatumPlaneVertex[rootB];
    const isChamfer = isChamferVertex[rootA] || isChamferVertex[rootB];

    // NEVER collapse curved entrance chamfers to maintain 100% circular quad symmetry
    if (isChamfer) {
      continue;
    }

    // Branch 1: Strictly coplanar (flat walls, flat faces, planar pockets)
    if (dotVal >= cosCoplanar) {
      if (datumA && !datumB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootA; removeV = rootB; }
      } else if (!datumA && datumB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootB; removeV = rootA; }
      } else if (datumA && datumB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootA; removeV = rootB; }
      } else if (!lockedA && !lockedB) {
        targetV = rootA;
        removeV = rootB;
      } else if (lockedA && !lockedB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootA; removeV = rootB; }
      } else if (!lockedA && lockedB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootB; removeV = rootA; }
      } else if (lockedA && lockedB) {
        if (edgeLenSq <= maxCoplanarLockedLenSq) { targetV = rootA; removeV = rootB; }
      }
    }
    // Branch 2: Smooth flank surface collapse
    else if (dotVal >= Math.cos((5.0 * Math.PI) / 180.0) && edgeLenSq <= maxFlankLenSq) {
      if (datumA || datumB) {
        continue;
      }
      if (!lockedA && !lockedB) {
        targetV = rootA;
        removeV = rootB;
      } else if (lockedA && !lockedB) {
        targetV = rootA;
        removeV = rootB;
      } else if (!lockedA && lockedB) {
        targetV = rootB;
        removeV = rootA;
      }
    }
    // Branch 3: Sharp crease ridge micro-collapse
    else if (lockedA && lockedB && !datumA && !datumB && dotVal < 0.90 && edgeLenSq <= maxCreaseMicroLenSq) {
      targetV = rootA;
      removeV = rootB;
    }

    if (targetV === -1 || removeV === -1) continue;

    if (!validateCollapseSafety(validationCtx, targetV, removeV, validationOpts)) {
      continue;
    }

    // Perform collapse and propagate lock states
    remap[removeV] = targetV;
    if (isVertexLocked[removeV]) isVertexLocked[targetV] = 1;
    if (isDatumPlaneVertex[removeV]) isDatumPlaneVertex[targetV] = 1;
    if (isChamferVertex[removeV]) isChamferVertex[targetV] = 1;
    remainingTriangles -= 2;

    incidence.merge(targetV, removeV);
  }

  return {
    remap,
    collapsedCount: numTriangles - remainingTriangles
  };
}
