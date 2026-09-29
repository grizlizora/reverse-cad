// ==============================================================================
// src/kernel/step/planar/hole-cylinder-synthesizer.ts — Analytical Hole Cylinder Synthesizer
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import type { MatchedThroughHole } from './through-hole-types.js';

export {
  synthesizeThroughHoleBands,
  emitExactTrianglePlaneFace
} from './hole-facet-band-stitcher.js';

/**
 * Emits an analytical ISO 10303-42 `CYLINDRICAL_SURFACE` entity fitted to a matched through-hole loop.
 */
export async function emitAnalyticalHoleCylinderSurface(
  mh: MatchedThroughHole,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  writer: StepStreamWriter,
  allocator: StepIdAllocator
): Promise<{ surfaceId: string; radius: number }> {
  let radiusSum = 0;
  const loop = mh.topLoop;
  const [nx, ny, nz] = mh.normal;

  for (let i = 0; i < loop.length; i++) {
    const v = loop[i];
    const dx = stepVerticesX[v] - mh.cx;
    const dy = stepVerticesY[v] - mh.cy;
    const dz = stepVerticesZ[v] - mh.cz;
    const axial = dx * nx + dy * ny + dz * nz;
    const rx = dx - axial * nx;
    const ry = dy - axial * ny;
    const rz = dz - axial * nz;
    radiusSum += Math.hypot(rx, ry, rz);
  }
  const radius = loop.length > 0 ? Math.max(1e-4, radiusSum / loop.length) : 1.0;

  const ptId = allocator.nextId();
  const basis = computeOrthonormalBasis(mh.normal);
  const dirZ = allocator.nextId();
  const dirX = allocator.nextId();
  const axisPlace = allocator.nextId();
  const cylId = allocator.nextId();

  const block =
    `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(mh.cx)}, ${formatStepFloat(mh.cy)}, ${formatStepFloat(mh.cz)}));\n` +
    `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n` +
    `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n` +
    `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n` +
    `${cylId} = CYLINDRICAL_SURFACE('', ${axisPlace}, ${formatStepFloat(radius)});\n`;

  await writer.writeBlock(block);

  return { surfaceId: cylId, radius };
}
