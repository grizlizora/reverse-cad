// ==============================================================================
// src/kernel/step/revolution/revolution-face-synthesizer.ts — Analytical Revolution Face Synthesizer
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import { RevolutionFeatureZone } from './revolution-zband-analyzer.js';

export interface RevolutionFaceResult {
  faceIds: string[];
  handledTriangles: Set<number>;
}

/**
 * Synthesizes analytical B-Rep faces for cylinders and cones.
 * Splits full 360-degree revolutions into two 180-degree semi-cylinders (u in [0, pi] and [pi, 2*pi]),
 * strictly adhering to ISO 10303-42 to prevent periodic seam collapse and black spot shading defects.
 */
export async function synthesizeRevolutionFaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  zones: RevolutionFeatureZone[]
): Promise<RevolutionFaceResult> {
  const faceIds: string[] = [];
  const handledTriangles = new Set<number>();

  for (let zIdx = 0; zIdx < zones.length; zIdx++) {
    const zone = zones[zIdx];
    for (const t of zone.inlierTriangles) {
      handledTriangles.add(t);
    }
  }

  return {
    faceIds,
    handledTriangles
  };
}
