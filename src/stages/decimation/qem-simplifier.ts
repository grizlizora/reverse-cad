// ==============================================================================
// src/stages/decimation/qem-simplifier.ts — Quadric Error Metric Mesh Simplifier
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { MeshCSR } from './mesh-csr.js';
import { QEMCollapseQueue, QEMEdgeCandidate } from './qem-collapse-queue.js';
import { compactDecimatedBuffers } from './buffer-compactor.js';
import { FlatVertexIncidence } from './mesh-incidence-flat.js';
import {
  computeScaleInvariantTolerances,
  computeDatumPlaneVertices,
  computeChamferAndDatumLocks
} from './qem-datum-locks.js';
import { computeVertexQuadrics, evaluateQuadricEdgeCost } from '../../math/quadric-matrix.js';
import { validateCollapseSafety } from './collapse-validator.js';
import { populateQEMCandidateQueue } from './qem-candidate-builder.js';

export interface QEMSimplifierOptions {
  targetTriangles: number;
  maxErrorSq?: number;
  maxNormalDeviationDeg?: number;
}

/**
 * Geometric Quadric Error Metric (QEM) decimation engine.
 * Simplifies curved and helical features (threads, fillets, organic curvature)
 * in strict order of minimal geometric distortion, strictly locking feature boundaries,
 * embossed text relief, and hole entrance chamfers.
 * Uses Zero-Allocation FlatVertexIncidence and Float64 binary heap.
 */
export function simplifyMeshQEM(
  mesh: RawMesh,
  csr: MeshCSR,
  isVertexLocked: Uint8Array,
  options: QEMSimplifierOptions
): RawMesh {
  const { positions, indices } = mesh;
  const numVertices = mesh.vertexCount;
  const numTriangles = mesh.triangleCount;
  const { faceNormals } = csr;
  const maxErrorSq = options.maxErrorSq ?? 0.04;
  const cosMaxDev = Math.cos(((options.maxNormalDeviationDeg ?? 20.0) * Math.PI) / 180.0);

  // 1. Compute vertex quadrics (10 Float64 values per vertex)
  const Q = computeVertexQuadrics(mesh, faceNormals);

  // 2. Compute scale-invariant tolerances, datum plane locks, and chamfer locks
  const tol = computeScaleInvariantTolerances(positions);
  const scaledMaxErrorSq = maxErrorSq * tol.scaleRatio * tol.scaleRatio;
  const isDatumPlaneVertex = computeDatumPlaneVertices(
    positions,
    numVertices,
    tol.minZ,
    tol.maxZ,
    tol.datumTol
  );
  const isChamferVertex = computeChamferAndDatumLocks(csr, numVertices);
  for (let v = 0; v < numVertices; v++) {
    if (isChamferVertex[v]) isVertexLocked[v] = 1;
  }

  // 3. Populate Min-Heap with valid edge collapses (Zero-Alloc)
  const queue = new QEMCollapseQueue();
  populateQEMCandidateQueue(
    queue,
    mesh,
    csr,
    Q,
    tol,
    isVertexLocked,
    isDatumPlaneVertex,
    { scaledMaxErrorSq }
  );

  // 4. Union-Find structure for vertex remapping
  const remap = new Int32Array(numVertices);
  for (let i = 0; i < numVertices; i++) remap[i] = i;

  function findRoot(v: number): number {
    let curr = v;
    while (remap[curr] !== curr) {
      remap[curr] = remap[remap[curr]];
      curr = remap[curr];
    }
    return curr;
  }

  // 5. Zero-allocation flat linked vertex-triangle incidence
  const incidence = new FlatVertexIncidence(numVertices, csr);
  const { head, next, vTris } = incidence;

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
    minCosNormalDev: cosMaxDev,
    maxInwardDisp: tol.maxInwardDisp
  };

  let remainingTriangles = numTriangles;
  const candidate: QEMEdgeCandidate = { vA: 0, vB: 0, cost: 0 };

  while (remainingTriangles > options.targetTriangles && queue.popInto(candidate)) {
    const rootTarget = findRoot(candidate.vA);
    const rootRemove = findRoot(candidate.vB);

    if (rootTarget === rootRemove) continue;

    // Lock State Erasure Prevention: re-verify datum and feature lock states after prior merges
    if (isDatumPlaneVertex[rootTarget] || isDatumPlaneVertex[rootRemove]) continue;
    if (isVertexLocked[rootRemove] === 1 && isVertexLocked[rootTarget] === 0) continue;

    // Re-evaluate quadric cost after prior merges into rootTarget/rootRemove
    const currentCost = evaluateQuadricEdgeCost(Q, positions, rootTarget, rootRemove, rootTarget);
    if (currentCost > scaledMaxErrorSq) continue;

    if (!validateCollapseSafety(validationCtx, rootTarget, rootRemove, validationOpts)) {
      continue;
    }

    // Perform collapse and propagate lock state so locked vertices never lose protection
    remap[rootRemove] = rootTarget;
    if (isVertexLocked[rootRemove]) isVertexLocked[rootTarget] = 1;
    if (isDatumPlaneVertex[rootRemove]) isDatumPlaneVertex[rootTarget] = 1;
    remainingTriangles -= 2;

    // Merge quadrics
    const qT = rootTarget * 10;
    const qR = rootRemove * 10;
    for (let k = 0; k < 10; k++) {
      Q[qT + k] += Q[qR + k];
    }

    // O(1) zero-allocation incident triangle list merge
    incidence.merge(rootTarget, rootRemove);
  }

  return compactDecimatedBuffers(mesh, remap);
}
