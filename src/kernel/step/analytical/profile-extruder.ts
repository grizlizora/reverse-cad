// ==============================================================================
// src/kernel/step/analytical/profile-extruder.ts — Direct B-Rep Face Extruder Façade
// Rebuilds 2.5D solid bodies directly as closed analytical B-Rep solids (by-construction).
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { AnalyticLoop2D } from './profile-fitter.js';
import { extrudeLateralFaces } from './profile-lateral-extruder.js';
import { synthesizeProfileCaps } from './profile-cap-synthesizer.js';
import { computeExtrusionNetVolume } from './profile-geometry-evaluator.js';

export interface ExtrudedSolidResult {
  faceIds: string[];
  shellId: string;
  volume: number;
}

/**
 * Directly extrudes a 2D analytical profile into STEP AP242 closed B-Rep solids.
 * Arc segments become true CYLINDRICAL_SURFACE entities.
 * Line segments become true PLANE entities.
 * Includes complete planar top & bottom caps with hole bounds, ensuring closed manifold solids.
 */
export async function extrudeAnalyticProfile(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  outerLoop: AnalyticLoop2D,
  zBottom: number,
  zTop: number,
  holeLoops: AnalyticLoop2D[] = []
): Promise<ExtrudedSolidResult> {
  const height = zTop - zBottom;
  if (height <= 0) {
    throw new Error(`Invalid extrusion height: zBottom=${zBottom}, zTop=${zTop}`);
  }

  const faceIds: string[] = [];

  // 1. Extrude lateral walls for outer loop
  const outerLateralFaces = await extrudeLateralFaces(writer, allocator, outerLoop, zBottom, zTop, false);
  faceIds.push(...outerLateralFaces);

  // 2. Extrude lateral walls for internal hole loops (inward orientation)
  for (let h = 0; h < holeLoops.length; h++) {
    const holeLateralFaces = await extrudeLateralFaces(writer, allocator, holeLoops[h], zBottom, zTop, true);
    faceIds.push(...holeLateralFaces);
  }

  // 3. Synthesize top & bottom capping planar faces with inner hole boundaries
  const { bottomFaceId, topFaceId } = await synthesizeProfileCaps(
    writer,
    allocator,
    outerLoop,
    holeLoops,
    zBottom,
    zTop
  );
  faceIds.push(bottomFaceId, topFaceId);

  // 4. Emit true CLOSED_SHELL referencing all lateral and cap faces
  const shellId = allocator.nextId();
  const faceRefs = faceIds.join(', ');
  await writer.writeBlock(`${shellId} = CLOSED_SHELL('', (${faceRefs}));\n`);

  // 5. Compute exact net volume via Green's theorem (polygon + circular sectors - holes)
  const volume = computeExtrusionNetVolume(outerLoop, holeLoops, height);

  return {
    faceIds,
    shellId,
    volume
  };
}
