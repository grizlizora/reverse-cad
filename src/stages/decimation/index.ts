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
  maxTrianglesThreshold?: number;   // Decimate only if > threshold (default 800,000)
  featureAngleDeg?: number;         // Preserve sharp edges > featureAngleDeg (default 8°)
  curvatureAngleDeg?: number;       // Preserve fillets/chamfers: 1-ring normal spread > deg (default 10°)
  coplanarAngleDeg?: number;        // Collapse only internal coplanar edges with angle < deg (default 0.5°)
  keepoutZones?: KeepoutBox[];      // Geometric keepout zones (notches, pads, holes)
}

/**
 * Precision mesh decimation with 100% preservation of mechanical feature elements
 * (ratchet notches, pad cutouts, fillets, chamfers, thin walls, stampings).
 */
export function decimateMesh(mesh: RawMesh, options: DecimationOptions = {}): RawMesh {
  const threshold = options.maxTrianglesThreshold ?? 800000;
  if (mesh.triangleCount <= threshold) {
    // Triangle count is already within budget, keep original 100% mesh fidelity
    return mesh;
  }

  const featureAngleRad = ((options.featureAngleDeg ?? 8) * Math.PI) / 180.0;
  const curvatureAngleRad = ((options.curvatureAngleDeg ?? 10) * Math.PI) / 180.0;
  const coplanarAngleRad = ((options.coplanarAngleDeg ?? 0.5) * Math.PI) / 180.0;
  const targetRatio = options.targetReductionRatio ?? 0.5;
  const targetTriangles = Math.max(threshold, Math.floor(mesh.triangleCount * targetRatio));

  const numVertices = mesh.vertexCount;

  // 1. Build CSR (Compressed Sparse Row) and compute face normals
  const csr = buildMeshCSR(mesh);

  // 2. Build 5-Tier Feature Shield
  const isVertexLocked = buildFeatureShield(mesh, csr, {
    featureAngleRad,
    curvatureAngleRad,
    keepoutZones: options.keepoutZones
  });

  // Check locked ratio
  let lockedCount = 0;
  for (let v = 0; v < numVertices; v++) {
    if (isVertexLocked[v]) lockedCount++;
  }

  if (lockedCount > numVertices * 0.85) {
    return mesh;
  }

  // 3. Safe coplanar interior edge collapse
  const { remap, collapsedCount } = collapseCoplanarEdges(
    mesh,
    csr,
    isVertexLocked,
    coplanarAngleRad,
    targetTriangles
  );

  if (collapsedCount === 0) {
    return mesh;
  }

  // 4. Compact mesh buffers
  return compactDecimatedBuffers(mesh, remap);
}
