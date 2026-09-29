// ==============================================================================
// src/kernel/step/brep-fallback-planar-emitter.ts — B-Rep Cluster Fallback Planar Emitter
// ==============================================================================

import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { StepFaceEmitter } from './step-face-emitter.js';

interface TrianglePlaneData {
  tA: number;
  v0: number;
  v1: number;
  v2: number;
  planeId: string;
}

/**
 * Deterministic fallback: decomposes un-peeled clusters into exact 0-deviation triangular planar faces.
 * Batches inline PLANE entity creation into consolidated blocks to eliminate per-triangle flush overhead.
 */
export async function emitFallbackQuadsAndTris(
  compTris: number[],
  indices: Uint32Array,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mergedTris: Uint8Array,
  emitter: StepFaceEmitter,
  surfaceMapping?: SurfaceStepMapping
): Promise<string[]> {
  const faceIds: string[] = [];
  const pendingFaces: TrianglePlaneData[] = [];
  let planeBlockBuffer = '';

  // Flush any preceding B-Rep faces once so all subsequent planes are defined before their faces
  await emitter.flush();

  for (let cIdx = 0; cIdx < compTris.length; cIdx++) {
    const tA = compTris[cIdx];
    if (mergedTris[tA]) continue;

    const t3 = tA * 3;
    const v0 = indices[t3], v1 = indices[t3 + 1], v2 = indices[t3 + 2];
    const p0x = stepVerticesX[v0], p0y = stepVerticesY[v0], p0z = stepVerticesZ[v0];
    const p1x = stepVerticesX[v1], p1y = stepVerticesY[v1], p1z = stepVerticesZ[v1];
    const p2x = stepVerticesX[v2], p2y = stepVerticesY[v2], p2z = stepVerticesZ[v2];
    let planeId: string | undefined;
    const existingSurfId = surfaceMapping?.triangleToSurfaceId?.get(tA);
    if (existingSurfId && existingSurfId.startsWith('#')) {
      planeId = existingSurfId;
    } else if (surfaceMapping?.getOrCreateFacetPlane) {
      if (planeBlockBuffer.length > 0) {
        await writer.writeBlock(planeBlockBuffer);
        planeBlockBuffer = '';
      }
      planeId = await surfaceMapping.getOrCreateFacetPlane(tA);
    }

    if (!planeId) {
      const d10x = p1x - p0x, d10y = p1y - p0y, d10z = p1z - p0z;
      const d20x = p2x - p0x, d20y = p2y - p0y, d20z = p2z - p0z;
      let nx = d10y * d20z - d10z * d20y;
      let ny = d10z * d20x - d10x * d20z;
      let nz = d10x * d20y - d10y * d20x;
      const len = Math.hypot(nx, ny, nz);
      if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
      else { nx = 0; ny = 0; nz = 1; }

      const ptId = allocator.nextId();
      const basis = computeOrthonormalBasis([nx, ny, nz]);
      const dirZ = allocator.nextId();
      const dirX = allocator.nextId();
      const axisPlace = allocator.nextId();
      planeId = allocator.nextId();

      planeBlockBuffer +=
        `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(p0x)}, ${formatStepFloat(p0y)}, ${formatStepFloat(p0z)}));\n` +
        `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n` +
        `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n` +
        `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n` +
        `${planeId} = PLANE('', ${axisPlace});\n`;

      if (planeBlockBuffer.length >= 65536) {
        await writer.writeBlock(planeBlockBuffer);
        planeBlockBuffer = '';
      }
    }

    mergedTris[tA] = 1;
    pendingFaces.push({ tA, v0, v1, v2, planeId });
  }

  if (planeBlockBuffer.length > 0) {
    await writer.writeBlock(planeBlockBuffer);
    planeBlockBuffer = '';
  }

  for (let i = 0; i < pendingFaces.length; i++) {
    const f = pendingFaces[i];
    const sameSense = surfaceMapping?.triangleSameSense ? surfaceMapping.triangleSameSense[f.tA] === 1 : true;
    faceIds.push(await emitter.emitTriangleFace(f.v0, f.v1, f.v2, f.planeId, sameSense));
  }

  return faceIds;
}
