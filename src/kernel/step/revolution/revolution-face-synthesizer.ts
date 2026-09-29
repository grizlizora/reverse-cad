// ==============================================================================
// src/kernel/step/revolution/revolution-face-synthesizer.ts — Analytical Revolution Face Synthesizer Façade
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { RevolutionFeatureZone } from './revolution-zband-analyzer.js';
import { RawMesh } from '../../../types/geometry.js';
import {
  getOrCreateRevolutionSurfaceEntity,
  filterBandTriangles
} from './revolution-surface-entity-builder.js';
import { emitSemiRevolutionBand } from './revolution-semi-surface-emitter.js';

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
  zones: RevolutionFeatureZone[],
  mesh?: RawMesh,
  surfaceToStepId?: Map<string, string>
): Promise<RevolutionFaceResult> {
  const faceIds: string[] = [];
  const handledTriangles = new Set<number>();

  if (!zones || zones.length === 0) {
    return { faceIds, handledTriangles };
  }

  const positions = mesh?.positions;
  const indices = mesh?.indices;

  for (let zIdx = 0; zIdx < zones.length; zIdx++) {
    const zone = zones[zIdx];
    if ((zone.type !== 'cylinder' && zone.type !== 'cone') || !zone.bands || zone.bands.length === 0) {
      continue;
    }

    const { context, stepBuffer } = getOrCreateRevolutionSurfaceEntity(allocator, zone, surfaceToStepId);
    if (!context) continue;

    if (stepBuffer.length > 0) {
      await writer.writeBlock(stepBuffer);
    }

    for (let bIdx = 0; bIdx < zone.bands.length; bIdx++) {
      const band = zone.bands[bIdx];
      if (band.isObstacleZone) {
        // Keep inlier triangles for high-fidelity fallback around obstacles
        continue;
      }

      const h = band.zMax - band.zMin;
      if (h < 0.05) continue;

      const bandFaces = await emitSemiRevolutionBand(writer, allocator, zone, band, context);
      faceIds.push(...bandFaces);

      const inBandTris = filterBandTriangles(zone, band.zMin, band.zMax, positions, indices);
      for (let k = 0; k < inBandTris.length; k++) {
        handledTriangles.add(inBandTris[k]);
      }
    }
  }

  return {
    faceIds,
    handledTriangles
  };
}
