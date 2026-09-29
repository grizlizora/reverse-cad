// ==============================================================================
// src/kernel/step/revolution/revolution-shell-integrator.ts — Shell Revolution B-Rep Integrator
// ==============================================================================

import { RawMesh } from '../../../types/geometry.js';
import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { SurfaceStepMapping } from '../step-analytical-surfaces.js';
import { analyzeRevolutionZSurfaces } from './revolution-zband-analyzer.js';
import { synthesizeRevolutionFaces } from './revolution-face-synthesizer.js';

/**
 * Integrates analytical revolution B-Rep surfaces (cylinders & cones) for a specific shell,
 * synthesizing true ISO 10303-42 split-seam ADVANCED_FACE entities and marking handled triangles
 * in mergedTris to prevent fallback planar facet fragmentation.
 */
export async function integrateShellRevolutionFaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  triIndices: number[],
  mergedTris: Uint8Array,
  surfaceMapping: SurfaceStepMapping
): Promise<string[]> {
  if (!surfaceMapping.surfaces || surfaceMapping.surfaces.length === 0) {
    return [];
  }

  const shellTriSet = new Set<number>(triIndices);
  const relevantSurfaces = surfaceMapping.surfaces.filter(s => {
    if (s.type !== 'cylinder' && s.type !== 'cone') return false;
    return s.inlierIndices && s.inlierIndices.some(t => shellTriSet.has(t) && !mergedTris[t]);
  });

  if (relevantSurfaces.length === 0) return [];

  const zones = analyzeRevolutionZSurfaces(mesh, relevantSurfaces);
  if (zones.length === 0) return [];

  const revResult = await synthesizeRevolutionFaces(
    writer,
    allocator,
    zones,
    mesh,
    surfaceMapping.surfaceToStepId
  );

  for (const t of revResult.handledTriangles) {
    mergedTris[t] = 1;
  }

  return revResult.faceIds;
}
