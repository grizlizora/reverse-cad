// ==============================================================================
// src/kernel/step/brep-mesh-metrics.ts — Pure Gauss-Ostrogradsky Topological Metrics
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { StepBoundingBox } from './step-types.js';

export interface ShellMetricResult {
  volumeMm3: number;
  surfaceAreaMm2: number;
  boundingBox: StepBoundingBox;
}

/**
 * Computes exact analytical volume (Gauss-Ostrogradsky divergence theorem),
 * surface area, and bounding box for a shell's triangles using 64-bit precision buffers.
 */
export function computeShellMetrics(
  mesh: RawMesh,
  triangleIndices: number[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array
): ShellMetricResult {
  let shellVol6 = 0.0;
  let shellArea = 0.0;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const count = triangleIndices.length;
  const indices = mesh.indices;

  for (let k = 0; k < count; k++) {
    const t = triangleIndices[k];
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    const x0 = stepVerticesX[i0], y0 = stepVerticesY[i0], z0 = stepVerticesZ[i0];
    const x1 = stepVerticesX[i1], y1 = stepVerticesY[i1], z1 = stepVerticesZ[i1];
    const x2 = stepVerticesX[i2], y2 = stepVerticesY[i2], z2 = stepVerticesZ[i2];

    if (x0 < minX) minX = x0; if (x0 > maxX) maxX = x0;
    if (y0 < minY) minY = y0; if (y0 > maxY) maxY = y0;
    if (z0 < minZ) minZ = z0; if (z0 > maxZ) maxZ = z0;

    if (x1 < minX) minX = x1; if (x1 > maxX) maxX = x1;
    if (y1 < minY) minY = y1; if (y1 > maxY) maxY = y1;
    if (z1 < minZ) minZ = z1; if (z1 > maxZ) maxZ = z1;

    if (x2 < minX) minX = x2; if (x2 > maxX) maxX = x2;
    if (y2 < minY) minY = y2; if (y2 > maxY) maxY = y2;
    if (z2 < minZ) minZ = z2; if (z2 > maxZ) maxZ = z2;

    // Divergence theorem for exact polyhedral volume:
    // cx, cy, cz is the cross product of (v1, v2)
    const cx = y1 * z2 - z1 * y2;
    const cy = z1 * x2 - x1 * z2;
    const cz = x1 * y2 - y1 * x2;
    shellVol6 += (x0 * cx + y0 * cy + z0 * cz);

    // Surface area from edge cross product
    const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
    const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
    const acx = e1y * e2z - e1z * e2y;
    const acy = e1z * e2x - e1x * e2z;
    const acz = e1x * e2y - e1y * e2x;
    shellArea += 0.5 * Math.hypot(acx, acy, acz);
  }

  const bodyVol = Math.abs(shellVol6 / 6.0);
  const diagX = maxX - minX;
  const diagY = maxY - minY;
  const diagZ = maxZ - minZ;

  return {
    volumeMm3: bodyVol,
    surfaceAreaMm2: shellArea,
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
      center: [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5],
      dimensions: [diagX, diagY, diagZ],
      diagonal: Math.hypot(diagX, diagY, diagZ)
    }
  };
}
