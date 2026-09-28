// ==============================================================================
// src/stages/decimation/feature-shield.ts — 5-Tier Feature Shield Protection
// ==============================================================================

import { RawMesh, Point3D } from '../../types/geometry.js';
import { MeshCSR } from './mesh-csr.js';

export interface KeepoutBox {
  min: Point3D;
  max: Point3D;
}

export interface ShieldOptions {
  featureAngleRad: number;
  curvatureAngleRad: number;
  fineFeatureAngleRad?: number;
  keepoutZones?: KeepoutBox[];
}

/**
 * Builds the 5-tier feature shield to lock vertices belonging to mechanical features,
 * sharp creases, boundaries, fillets, threads, and keepout regions.
 */
export function buildFeatureShield(
  mesh: RawMesh,
  csr: MeshCSR,
  options: ShieldOptions
): Uint8Array {
  const numVertices = mesh.vertexCount;
  const isVertexLocked = new Uint8Array(numVertices);
  const { faceNormals, vOffsets, vTris, edgeToFaces } = csr;
  const positions = mesh.positions;

  const cosFeature = Math.cos(options.featureAngleRad);
  const cosCurvature = Math.cos(options.curvatureAngleRad);
  const cosFineFeature = Math.cos(options.fineFeatureAngleRad ?? ((4.0 * Math.PI) / 180.0));

  // Tier A: Boundary edges and non-manifold connections
  // Tier B: Sharp CAD feature edges (dihedral angle > featureAngleRad)
  // Tier E: Fine Feature & Thread Shield (edges < 2.0mm)
  for (const [key, faces] of edgeToFaces.entries()) {
    const vA = Math.floor(key / 67108864);
    const vB = key % 67108864;

    if (faces.length !== 2) {
      isVertexLocked[vA] = 1;
      isVertexLocked[vB] = 1;
      continue;
    }

    const t0 = faces[0] * 3;
    const t1 = faces[1] * 3;
    const dotNorm =
      faceNormals[t0] * faceNormals[t1] +
      faceNormals[t0 + 1] * faceNormals[t1 + 1] +
      faceNormals[t0 + 2] * faceNormals[t1 + 2];

    // Dihedral angle > featureAngleRad <=> dotNorm < cos(featureAngleRad)
    if (dotNorm < cosFeature) {
      isVertexLocked[vA] = 1;
      isVertexLocked[vB] = 1;
    }

    // Tier E check
    const dx = positions[vA * 3] - positions[vB * 3];
    const dy = positions[vA * 3 + 1] - positions[vB * 3 + 1];
    const dz = positions[vA * 3 + 2] - positions[vB * 3 + 2];
    const edgeLenSq = dx * dx + dy * dy + dz * dz;

    if (edgeLenSq < 4.0) { // 2.0mm ^ 2
      if (dotNorm < cosFineFeature) {
        isVertexLocked[vA] = 1;
        isVertexLocked[vB] = 1;
      }
    }
  }

  // Tier C: Multi-facet fillets, chamfers, and tooth crests (Curvature Spread Shield via CSR)
  for (let v = 0; v < numVertices; v++) {
    if (isVertexLocked[v]) continue;

    const start = vOffsets[v];
    const end = vOffsets[v + 1];
    const triCount = end - start;
    if (triCount < 2) continue;

    const baseT = vTris[start] * 3;
    const bnx = faceNormals[baseT];
    const bny = faceNormals[baseT + 1];
    const bnz = faceNormals[baseT + 2];

    for (let i = start + 1; i < end; i++) {
      const curT = vTris[i] * 3;
      const dotVal = bnx * faceNormals[curT] + bny * faceNormals[curT + 1] + bnz * faceNormals[curT + 2];
      if (dotVal < cosCurvature) {
        isVertexLocked[v] = 1;
        break;
      }
    }
  }

  // Tier D: Keepout Boxes
  if (options.keepoutZones && options.keepoutZones.length > 0) {
    for (let v = 0; v < numVertices; v++) {
      if (isVertexLocked[v]) continue;
      const x = positions[v * 3];
      const y = positions[v * 3 + 1];
      const z = positions[v * 3 + 2];

      for (const box of options.keepoutZones) {
        if (
          x >= box.min[0] && x <= box.max[0] &&
          y >= box.min[1] && y <= box.max[1] &&
          z >= box.min[2] && z <= box.max[2]
        ) {
          isVertexLocked[v] = 1;
          break;
        }
      }
    }
  }

  return isVertexLocked;
}
