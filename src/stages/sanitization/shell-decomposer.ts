// ==============================================================================
// src/stages/sanitization/shell-decomposer.ts — Connected Topological Shell Decomposer
// ==============================================================================

import { MeshShell, Point3D } from '../../types/geometry.js';
import { computeShellVolumeAndAreaDirect } from '../../math/index.js';

export interface ShellDecompositionResult {
  shells: MeshShell[];
}

/**
 * Traverses mesh topology to segment disjoint connected shells via BFS,
 * computing exact signed Gauss volume and identifying interior void cavities.
 */
export function decomposeTopologicalShells(
  positions: Float32Array,
  indices: Uint32Array,
  triangleAdjacency: number[][]
): ShellDecompositionResult {
  const triangleCount = Math.floor(indices.length / 3);
  const visited = new Uint8Array(triangleCount);
  const shells: MeshShell[] = [];
  let shellIdx = 0;

  for (let t = 0; t < triangleCount; t++) {
    if (visited[t]) continue;

    const shellTriangles: number[] = [];
    const queue = [t];
    visited[t] = 1;

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    while (queue.length > 0) {
      const cur = queue.pop()!;
      shellTriangles.push(cur);

      const i0 = indices[cur * 3] * 3;
      const i1 = indices[cur * 3 + 1] * 3;
      const i2 = indices[cur * 3 + 2] * 3;

      for (const idx of [i0, i1, i2]) {
        const x = positions[idx];
        const y = positions[idx + 1];
        const z = positions[idx + 2];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }

      const neighbors = triangleAdjacency[cur];
      if (neighbors) {
        for (let n = 0; n < neighbors.length; n++) {
          const neighbor = neighbors[n];
          if (!visited[neighbor]) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }
    }

    const { volume, area } = computeShellVolumeAndAreaDirect(positions, indices, shellTriangles);

    shells.push({
      shellIndex: shellIdx++,
      triangleIndices: shellTriangles,
      signedVolume: volume,
      surfaceArea: area,
      isCavity: volume < 0,
      boundingBox: {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        dimensions: [maxX - minX, maxY - minY, maxZ - minZ],
        center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
        diagonal: Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2)
      }
    });
  }

  // Shell Containment & Cavity Flagging
  if (shells.length > 1) {
    for (let i = 0; i < shells.length; i++) {
      if (shells[i].signedVolume < 0) {
        shells[i].isCavity = true;
      }
    }
  }

  return { shells };
}
