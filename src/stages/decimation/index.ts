// ==============================================================================
// src/stages/decimation/index.ts — Unified Feature-Preserving 2-Stage Decimation Engine
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { buildMeshCSR } from './mesh-csr.js';
import { buildFeatureShield, KeepoutBox } from './feature-shield.js';
import { collapseCoplanarEdges } from './coplanar-collapser.js';
import { compactDecimatedBuffers } from './buffer-compactor.js';
import { simplifyMeshQEM } from './qem-simplifier.js';

export * from './mesh-csr.js';
export * from './mesh-incidence-flat.js';
export * from './feature-shield.js';
export * from './qem-datum-locks.js';
export * from './qem-collapse-queue.js';
export * from './qem-simplifier.js';
export * from './coplanar-collapser.js';
export * from './buffer-compactor.js';

export interface DecimationOptions {
  targetReductionRatio?: number;    // e.g. 0.5 = reduce to 50%
  maxTrianglesThreshold?: number;   // Decimate only if > threshold (default 35,000)
  featureAngleDeg?: number;         // Preserve sharp edges > featureAngleDeg (default 8°)
  curvatureAngleDeg?: number;       // Preserve fillets/chamfers: 1-ring normal spread > deg (default 10°)
  fineFeatureAngleDeg?: number;     // Preserve fine feature chords (default 4°)
  coplanarAngleDeg?: number;        // Collapse only internal coplanar edges with angle < deg (default 0.5°)
  keepoutZones?: KeepoutBox[];      // Geometric keepout zones (notches, pads, holes)
  enableCoplanarPrepass?: boolean;  // Optional Stage 2A fast linear coplanar pre-pass before Stage 2B QEM
}

/**
 * Precision 2-stage mesh decimation (Stage 2A Coplanar Collapse + Stage 2B QEM Simplifier)
 * with 100% preservation of mechanical feature elements
 * (ratchet notches, pad cutouts, fillets, chamfers, thin walls, stampings).
 */
export function decimateMesh(mesh: RawMesh, options: DecimationOptions = {}): RawMesh {
  const threshold = options.maxTrianglesThreshold ?? 12000;
  if (mesh.triangleCount <= threshold) {
    // Triangle count is already within budget, keep original 100% mesh fidelity
    return mesh;
  }

  const featureAngleRad = ((options.featureAngleDeg ?? 12) * Math.PI) / 180.0;
  const curvatureAngleRad = ((options.curvatureAngleDeg ?? 12) * Math.PI) / 180.0;
  const fineFeatureAngleRad = ((options.fineFeatureAngleDeg ?? 15.0) * Math.PI) / 180.0;
  const coplanarAngleRad = ((options.coplanarAngleDeg ?? 1.5) * Math.PI) / 180.0;
  const targetTriangles = options.targetReductionRatio !== undefined
    ? Math.max(threshold, Math.floor(mesh.triangleCount * options.targetReductionRatio))
    : threshold;

  let workingMesh = mesh;
  let csr = buildMeshCSR(workingMesh);
  let isVertexLocked = buildFeatureShield(workingMesh, csr, {
    featureAngleRad,
    curvatureAngleRad,
    fineFeatureAngleRad,
    keepoutZones: options.keepoutZones
  });

  // Stage 2A: Fast linear coplanar pre-pass when explicitly requested or on ultra-dense meshes (> 250k tris)
  if (options.enableCoplanarPrepass === true || workingMesh.triangleCount > 250000) {
    const prepassTarget = Math.max(targetTriangles, Math.floor(workingMesh.triangleCount * 0.6));
    const { remap, collapsedCount } = collapseCoplanarEdges(
      workingMesh,
      csr,
      isVertexLocked,
      coplanarAngleRad,
      prepassTarget
    );
    if (collapsedCount > 0) {
      workingMesh = compactDecimatedBuffers(workingMesh, remap);
      if (workingMesh.triangleCount <= targetTriangles) {
        return workingMesh;
      }
      csr = buildMeshCSR(workingMesh);
      isVertexLocked = buildFeatureShield(workingMesh, csr, {
        featureAngleRad,
        curvatureAngleRad,
        fineFeatureAngleRad,
        keepoutZones: options.keepoutZones
      });
    }
  }

  // Stage 2B: High-precision Quadric Error Metric (QEM) simplification
  return simplifyMeshQEM(workingMesh, csr, isVertexLocked, {
    targetTriangles,
    maxErrorSq: 0.01,
    maxNormalDeviationDeg: 20.0
  });
}
