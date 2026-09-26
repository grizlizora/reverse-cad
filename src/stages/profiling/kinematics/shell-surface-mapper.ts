// ==============================================================================
// src/stages/profiling/kinematics/shell-surface-mapper.ts — Fast Shell-Surface Mapper
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell, Point3D } from '../../../types/geometry.js';

/**
 * Pre-computes triangle -> shell index array for fast O(1) lookups.
 */
export function buildTriangleToShellMap(mesh: RawMesh, shells: MeshShell[]): Int32Array {
  const triangleToShell = new Int32Array(mesh.triangleCount).fill(-1);
  for (let sIdx = 0; sIdx < shells.length; sIdx++) {
    const sh = shells[sIdx];
    if (sh.isCavity) continue;
    const tIndices = sh.triangleIndices;
    if (tIndices) {
      for (let k = 0; k < tIndices.length; k++) {
        const t = tIndices[k];
        if (t < triangleToShell.length) {
          triangleToShell[t] = sh.shellIndex;
        }
      }
    }
  }
  return triangleToShell;
}

/**
 * Maps an array of surfaces to their host shell index in a single O(N) pass.
 */
export function mapSurfacesToShells(
  surfaces: SurfacePrimitive[],
  triangleToShell: Int32Array,
  outerShells: MeshShell[]
): Int32Array {
  const shellMap = new Int32Array(surfaces.length).fill(-1);

  for (let i = 0; i < surfaces.length; i++) {
    const surf = surfaces[i];
    let bestShell = -1;

    if (surf.inlierIndices && surf.inlierIndices.length > 0) {
      // Find mode of shell indices using a tiny flat counter for up to 32 shells or fallback
      const inliers = surf.inlierIndices;
      let maxCount = 0;

      // Count using a compact map
      const counts = new Map<number, number>();
      for (let k = 0; k < inliers.length; k++) {
        const t = inliers[k];
        if (t < triangleToShell.length) {
          const shId = triangleToShell[t];
          if (shId >= 0) {
            const newCount = (counts.get(shId) ?? 0) + 1;
            counts.set(shId, newCount);
            if (newCount > maxCount) {
              maxCount = newCount;
              bestShell = shId;
            }
          }
        }
      }
    }

    if (bestShell === -1) {
      // Bounding box centroid fallback
      const pt: Point3D | null = surf.type === 'cylinder' ? surf.axisOrigin : surf.type === 'plane' ? surf.origin : null;
      if (pt) {
        for (let s = 0; s < outerShells.length; s++) {
          const b = outerShells[s].boundingBox;
          if (
            pt[0] >= b.min[0] - 0.5 && pt[0] <= b.max[0] + 0.5 &&
            pt[1] >= b.min[1] - 0.5 && pt[1] <= b.max[1] + 0.5 &&
            pt[2] >= b.min[2] - 0.5 && pt[2] <= b.max[2] + 0.5
          ) {
            bestShell = outerShells[s].shellIndex;
            break;
          }
        }
      }
    }

    shellMap[i] = bestShell;
  }

  return shellMap;
}
