// ==============================================================================
// src/utils/mesh-transform.ts — Coordinate Transformation & Alignment Utilities
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import { computeBoundingBox } from '../math/mesh-buffers.js';

/**
 * Automatically transforms mesh coordinates from STL 3D printing frame (Z-up)
 * to standard CAD Viewer frame (Y-up, Autodesk Viewer / ISO standard):
 *   X' =  X
 *   Y' =  Z
 *   Z' = -Y
 * This is a pure proper rigid body rotation (Rx(-90°), det = +1).
 * Preserves volume, chirality, surface normals and manifold topology, while ensuring
 * that all 6 orthogonal views (Top, Bottom, Front, Back, Left, Right) in CAD viewers
 * match 1:1 with the original STL's build orientation without manual ViewCube clicks.
 */
export function alignMeshForCadViewer(mesh: RawMesh): void {
  const pos = mesh.positions;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    pos[i] = x;
    pos[i + 1] = z;
    pos[i + 2] = -y;
  }
  if (mesh.normals && mesh.normals.length > 0) {
    const n = mesh.normals;
    for (let i = 0; i < n.length; i += 3) {
      const nx = n[i];
      const ny = n[i + 1];
      const nz = n[i + 2];
      n[i] = nx;
      n[i + 1] = nz;
      n[i + 2] = -ny;
    }
  }
  mesh.boundingBox = computeBoundingBox(pos);
}

/**
 * Non-mutating version of mesh transformation to CAD viewer frame.
 */
export function transformMeshCadViewer(mesh: RawMesh): RawMesh {
  const positions = new Float32Array(mesh.positions);
  const indices = new Uint32Array(mesh.indices);
  const normals = mesh.normals ? new Float32Array(mesh.normals) : new Float32Array(0);

  const transformed: RawMesh = {
    ...mesh,
    positions,
    indices,
    normals
  };
  alignMeshForCadViewer(transformed);
  return transformed;
}
