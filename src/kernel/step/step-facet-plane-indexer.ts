// ==============================================================================
// src/kernel/step/step-facet-plane-indexer.ts — Canonical Pre-Pass Facet Plane Indexer Façade
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';
import { classifyFacetPlanes, type FacetPlaneDescriptor } from './facet-plane-classifier.js';

export type { FacetPlaneDescriptor };

/**
 * Sanitizes floating point value for backwards-compatible format lookups.
 */
export function formatQuantizedCoord(val: number, step: number, decimals: number): string {
  const rounded = Math.round(val * step) / step;
  return formatStepFloat(rounded, decimals);
}

/**
 * Pre-indexes all unclassified mesh triangles into deduplicated facet planes,
 * eliminating runtime microtask queue pauses and buffer flushes during B-Rep synthesis.
 */
export async function preIndexFacetPlanes(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  triangleToSurfaceId: Map<number, string>
): Promise<Map<string, string>> {
  const facetPlaneCache = new Map<string, string>();
  const classification = classifyFacetPlanes(mesh, triangleToSurfaceId);
  const uniquePlanes = classification.uniquePlanes;

  if (uniquePlanes.length === 0) {
    return facetPlaneCache;
  }

  // 1. Batch emit unique PLANE STEP entities
  let buffer = '';
  const FLUSH_THRESHOLD = 128 * 1024;
  const planeStepIds: string[] = new Array(uniquePlanes.length);

  for (let pIdx = 0; pIdx < uniquePlanes.length; pIdx++) {
    const desc = uniquePlanes[pIdx];
    const ptId = allocator.nextId();
    buffer += `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(desc.cx)}, ${formatStepFloat(desc.cy)}, ${formatStepFloat(desc.cz)}));\n`;

    const basis = computeOrthonormalBasis([desc.snx, desc.sny, desc.snz]);
    const dirZ = allocator.nextId();
    buffer += `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n`;

    const dirX = allocator.nextId();
    buffer += `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n`;

    const axisPlace = allocator.nextId();
    buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n`;

    const planeId = allocator.nextId();
    buffer += `${planeId} = PLANE('FACET_SURFACE', ${axisPlace});\n`;

    planeStepIds[pIdx] = planeId;
    facetPlaneCache.set(`plane_${pIdx}`, planeId);

    if (buffer.length >= FLUSH_THRESHOLD) {
      await writer.writeBlock(buffer);
      buffer = '';
    }
  }

  if (buffer.length > 0) {
    await writer.writeBlock(buffer);
    buffer = '';
  }

  // 2. Fast O(1) map of each unclassified triangle to its allocated planeId
  const trianglePlaneIndices = classification.trianglePlaneIndices;
  const unclassifiedTriangles = classification.unclassifiedTriangles;

  for (let k = 0; k < unclassifiedTriangles.length; k++) {
    const t = unclassifiedTriangles[k];
    const pIdx = trianglePlaneIndices[t];
    if (pIdx >= 0 && pIdx < planeStepIds.length) {
      triangleToSurfaceId.set(t, planeStepIds[pIdx]);
    }
  }

  return facetPlaneCache;
}
