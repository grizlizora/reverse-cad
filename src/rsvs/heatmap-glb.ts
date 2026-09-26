// ==============================================================================
// src/rsvs/heatmap-glb.ts — glTF 2.0 Binary Heatmap Mesh Serializer Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { encodeMeshToGlb } from './glb-serializer.js';
import * as fs from 'fs';

export * from './glb-serializer.js';

/**
 * Maps a scalar deviation value in [0, 1] to Turbo / Viridis RGB gradient.
 */
export function deviationToColor(t: number): [number, number, number] {
  if (isNaN(t) || t <= 0) return [0, 0, 1];
  const val = Math.max(0, Math.min(1, t));

  // Blue (0.0) -> Cyan (0.25) -> Green (0.5) -> Yellow (0.75) -> Red (1.0)
  if (val < 0.25) {
    const f = val / 0.25;
    return [0, f, 1];
  } else if (val < 0.5) {
    const f = (val - 0.25) / 0.25;
    return [0, 1, 1 - f];
  } else if (val < 0.75) {
    const f = (val - 0.5) / 0.25;
    return [f, 1, 0];
  } else {
    const f = (val - 0.75) / 0.25;
    return [1, 1 - f, 0];
  }
}

/**
 * Encodes mesh geometry and residual deviation colors into a compliant binary glTF (GLB) buffer.
 */
export function generateBinaryHeatmapGlb(mesh: RawMesh, surfaces: SurfacePrimitive[]): Buffer {
  const vertexCount = mesh.vertexCount;
  const colors = new Float32Array(vertexCount * 3);

  // Default color: Green [0.1, 0.85, 0.2]
  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3;
    colors[i3] = 0.1;
    colors[i3 + 1] = 0.85;
    colors[i3 + 2] = 0.2;
  }

  // Highlight freeform/high-residual faces with Orange/Red
  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    if (s.type === 'freeform') {
      const inliers = s.inlierIndices;
      for (let k = 0; k < inliers.length; k++) {
        const t = inliers[k];
        const t3 = t * 3;
        for (let j = 0; j < 3; j++) {
          const vIdx = mesh.indices[t3 + j];
          const v3 = vIdx * 3;
          colors[v3] = 0.95;     // R
          colors[v3 + 1] = 0.35; // G
          colors[v3 + 2] = 0.05; // B
        }
      }
    }
  }

  return encodeMeshToGlb({
    positions: mesh.positions,
    colors,
    indices: mesh.indices,
    boundingBox: mesh.boundingBox,
    generatorName: 'Antigravity RSVS Heatmap Generator'
  });
}

/**
 * Builds and saves a binary glTF (.glb) file encoding point/vertex deviation heatmaps.
 */
export async function exportHausdorffHeatmapGlb(
  mesh: RawMesh,
  deviations: Float32Array,
  outputPath: string,
  maxExpectedDevMm: number = 0.5
): Promise<void> {
  const vertexCount = mesh.vertexCount;
  const colors = new Float32Array(vertexCount * 3);

  const vertDevCounts = new Uint32Array(vertexCount);
  const vertDevSums = new Float32Array(vertexCount);

  const triCount = mesh.triangleCount;
  const indices = mesh.indices;
  const safeMaxExpected = maxExpectedDevMm > 1e-6 ? maxExpectedDevMm : 0.5;

  for (let t = 0; t < triCount && t < deviations.length; t++) {
    const dev = deviations[t];
    const t3 = t * 3;
    for (let v = 0; v < 3; v++) {
      const vi = indices[t3 + v];
      vertDevSums[vi] += dev;
      vertDevCounts[vi]++;
    }
  }

  for (let v = 0; v < vertexCount; v++) {
    const count = vertDevCounts[v];
    const avgDev = count > 0 ? vertDevSums[v] / count : 0;
    const normalized = avgDev / safeMaxExpected;
    const [r, g, b] = deviationToColor(normalized);
    const v3 = v * 3;
    colors[v3] = r;
    colors[v3 + 1] = g;
    colors[v3 + 2] = b;
  }

  const glb = encodeMeshToGlb({
    positions: mesh.positions,
    colors,
    indices: mesh.indices,
    boundingBox: mesh.boundingBox,
    generatorName: 'Antigravity RSVS Hausdorff Heatmap'
  });

  await fs.promises.writeFile(outputPath, glb);
}
