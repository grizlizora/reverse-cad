// ==============================================================================
// src/kernel/step/planar/hole-facet-band-stitcher.ts — High-Throughput Hole Band Stitcher
// ==============================================================================

import { triangulateBetweenLoops } from './loop-band-triangulator.js';
import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { StepFaceEmitter } from '../step-face-emitter.js';
import { formatStepFloat, computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import type { MatchedThroughHole } from './through-hole-types.js';

/**
 * Builds a single analytical PLANE STEP entity definition block for a triangle
 * and returns the allocated plane entity ID and formatted block.
 */
function buildTrianglePlaneBlock(
  v0: number,
  v1: number,
  v2: number,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  allocator: StepIdAllocator
): { planeId: string; block: string } {
  const p0x = stepVerticesX[v0], p0y = stepVerticesY[v0], p0z = stepVerticesZ[v0];
  const p1x = stepVerticesX[v1], p1y = stepVerticesY[v1], p1z = stepVerticesZ[v1];
  const p2x = stepVerticesX[v2], p2y = stepVerticesY[v2], p2z = stepVerticesZ[v2];

  const d10x = p1x - p0x, d10y = p1y - p0y, d10z = p1z - p0z;
  const d20x = p2x - p0x, d20y = p2y - p0y, d20z = p2z - p0z;
  let nx = d10y * d20z - d10z * d20y;
  let ny = d10z * d20x - d10x * d20z;
  let nz = d10x * d20y - d10y * d20x;
  const len = Math.hypot(nx, ny, nz);
  if (len > 1e-12) {
    const invLen = 1 / len;
    nx *= invLen; ny *= invLen; nz *= invLen;
  } else {
    nx = 0; ny = 0; nz = 1;
  }

  const ptId = allocator.nextId();
  const basis = computeOrthonormalBasis([nx, ny, nz]);
  const dirZ = allocator.nextId();
  const dirX = allocator.nextId();
  const axisPlace = allocator.nextId();
  const planeId = allocator.nextId();

  const block =
    `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(p0x)}, ${formatStepFloat(p0y)}, ${formatStepFloat(p0z)}));\n` +
    `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n` +
    `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n` +
    `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n` +
    `${planeId} = PLANE('', ${axisPlace});\n`;

  return { planeId, block };
}

/**
 * Emits an exact analytical PLANE and ADVANCED_FACE for a single 3D triangle (v0, v1, v2)
 * with zero chordal deviation. Backward-compatible function.
 */
export async function emitExactTrianglePlaneFace(
  v0: number,
  v1: number,
  v2: number,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  emitter: StepFaceEmitter
): Promise<string> {
  const { planeId, block } = buildTrianglePlaneBlock(
    v0, v1, v2, stepVerticesX, stepVerticesY, stepVerticesZ, allocator
  );
  await emitter.flush();
  await writer.writeBlock(block);
  return emitter.emitTriangleFace(v0, v1, v2, planeId, true);
}

/**
 * Synthesizes closed 2-manifold triangular bands between matched through-hole loops,
 * guaranteeing 0 chordal deviation by allocating exact analytical surfaces.
 * Utilizes batch plane buffering and buffered StepFaceEmitter emission to prevent micro-flushes.
 */
export async function synthesizeThroughHoleBands(
  matchedHoles: MatchedThroughHole[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  emitter: StepFaceEmitter
): Promise<string[]> {
  const shellFaceIds: string[] = [];

  for (let h = 0; h < matchedHoles.length; h++) {
    const mh = matchedHoles[h];
    const bandFaces = triangulateBetweenLoops(
      mh.topLoop,
      mh.botLoop,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ,
      mh.cx,
      mh.cy,
      mh.cz,
      mh.normal
    );
    if (bandFaces.length === 0) continue;

    // Batch plane definitions per hole to eliminate per-triangle writer flushes
    let planeBlock = '';
    const planeIds: string[] = new Array(bandFaces.length);
    for (let f = 0; f < bandFaces.length; f++) {
      const bf = bandFaces[f];
      const { planeId, block } = buildTrianglePlaneBlock(
        bf.v0, bf.v1, bf.v2, stepVerticesX, stepVerticesY, stepVerticesZ, allocator
      );
      planeIds[f] = planeId;
      planeBlock += block;
    }

    // Flush any previously buffered faces once, then write all plane entities as a single block
    await emitter.flush();
    await writer.writeBlock(planeBlock);

    // Emit all band triangle faces into the emitter's high-speed 256KB chunkBuffer
    for (let f = 0; f < bandFaces.length; f++) {
      const bf = bandFaces[f];
      const fid = await emitter.emitTriangleFace(bf.v0, bf.v1, bf.v2, planeIds[f], true);
      shellFaceIds.push(fid);
    }
  }

  return shellFaceIds;
}
