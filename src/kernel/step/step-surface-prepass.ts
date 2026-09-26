// ==============================================================================
// src/kernel/step/step-surface-prepass.ts — Deterministic Surface Pre-Pass Classifier
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../../types/geometry.js';
import { StepIdAllocator } from './step-id-allocator.js';

export interface PrepassResult {
  triangleToSurfaceStepId: string[];
  totalSurfaceEntities: number;
}

/**
 * Builds an immutable mapping from triangle index to STEP surface entity ID.
 * Resolves all facet plane quantization prior to B-Rep face writing, eliminating on-the-fly mutations.
 */
export function buildSurfacePrepassMap(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  surfaceToStepId: Map<string, string>,
  allocator: StepIdAllocator
): PrepassResult {
  const triCount = mesh.triangleCount;
  const triangleToSurfaceStepId = new Array<string>(triCount);

  // Map analytical surfaces
  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    const stepId = surfaceToStepId.get(s.id);
    if (!stepId) continue;
    for (let i = 0; i < s.inlierIndices.length; i++) {
      const t = s.inlierIndices[i];
      if (t < triCount) {
        triangleToSurfaceStepId[t] = stepId;
      }
    }
  }

  // Pre-allocate facet plane buckets for unassigned triangles to ensure determinism
  let allocatedFacets = 0;
  for (let t = 0; t < triCount; t++) {
    if (!triangleToSurfaceStepId[t]) {
      // Allocate unique facet plane ID
      triangleToSurfaceStepId[t] = allocator.nextId();
      allocatedFacets++;
    }
  }

  return {
    triangleToSurfaceStepId,
    totalSurfaceEntities: surfaces.length + allocatedFacets
  };
}
