// ==============================================================================
// src/stages/decimation/index.ts — Unified Feature-Preserving Decimation Engine
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { buildMeshCSR } from './mesh-csr.js';
import { buildFeatureShield, KeepoutBox } from './feature-shield.js';
import { collapseCoplanarEdges } from './coplanar-collapser.js';
import { compactDecimatedBuffers } from './buffer-compactor.js';

export * from './mesh-csr.js';
export * from './feature-shield.js';
export * from './qem-collapse-queue.js';
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
}

/**
 * Precision mesh decimation with 100% preservation of mechanical feature elements
 * (ratchet notches, pad cutouts, fillets, chamfers, thin walls, stampings).
 */
export function decimateMesh(mesh: RawMesh, options: DecimationOptions = {}): RawMesh {
  const threshold = options.maxTrianglesThreshold ?? 12000;
  if (mesh.triangleCount <= threshold) {
    // Triangle count is already within budget, keep original 100% mesh fidelity
    return mesh;
  }

  const featureAngleRad = ((options.featureAngleDeg ?? 15) * Math.PI) / 180.0;
  const curvatureAngleRad = ((options.curvatureAngleDeg ?? 15) * Math.PI) / 180.0;
  const fineFeatureAngleRad = ((options.fineFeatureAngleDeg ?? 15.0) * Math.PI) / 180.0;
  const coplanarAngleRad = ((options.coplanarAngleDeg ?? 0.5) * Math.PI) / 180.0;
  const targetTriangles = options.targetReductionRatio !== undefined
    ? Math.max(threshold, Math.floor(mesh.triangleCount * options.targetReductionRatio))
    : threshold;

  let currentMesh = mesh;
  const maxPasses = 4;

  for (let pass = 0; pass < maxPasses; pass++) {
    if (currentMesh.triangleCount <= targetTriangles) break;

    // 1. Build CSR (Compressed Sparse Row) and compute face normals
    const csr = buildMeshCSR(currentMesh);

    // 2. Build 5-Tier Feature Shield
    const isVertexLocked = buildFeatureShield(currentMesh, csr, {
      featureAngleRad,
      curvatureAngleRad,
      fineFeatureAngleRad,
      keepoutZones: options.keepoutZones
    });

    // 3. Safe coplanar & crease-tangent interior edge collapse
    const { remap, collapsedCount } = collapseCoplanarEdges(
      currentMesh,
      csr,
      isVertexLocked,
      coplanarAngleRad,
      targetTriangles
    );

    if (collapsedCount === 0) break;

    // 4. Compact mesh buffers
    currentMesh = compactDecimatedBuffers(currentMesh, remap);
  }

  return currentMesh;
}
