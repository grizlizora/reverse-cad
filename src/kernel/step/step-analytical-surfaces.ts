// ==============================================================================
// src/kernel/step/step-analytical-surfaces.ts — Analytical B-Rep Surfaces Generator
// ==============================================================================

import { RawMesh, SurfacePrimitive, PlaneSurface, CylinderSurface, Vector3D } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';
import { preIndexFacetPlanes } from './step-facet-plane-indexer.js';

export interface SurfaceStepMapping {
  surfaceToStepId: Map<string, string>;
  triangleToSurfaceId: Map<number, string>;
  getOrCreateFacetPlane: (tIdx: number) => Promise<string>;
}

export { preIndexFacetPlanes };

/**
 * Emits analytical B-Rep surfaces (PLANE, CYLINDRICAL_SURFACE) and pre-indexes
 * all unclassified facet planes to allow non-blocking, continuous 256KB stream writes.
 */
export async function writeAnalyticalSurfaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  surfaces: SurfacePrimitive[]
): Promise<SurfaceStepMapping> {
  const surfaceToStepId = new Map<string, string>();
  const triangleToSurfaceId = new Map<number, string>();

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];

    if (s.type === 'plane') {
      const p = s as PlaneSurface;
      const ptId = allocator.nextId();
      await writer.writeLine(
        `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(p.origin[0])}, ${formatStepFloat(p.origin[1])}, ${formatStepFloat(p.origin[2])}));`
      );

      const basis = computeOrthonormalBasis(p.normal);
      const dirZ = allocator.nextId();
      await writer.writeLine(
        `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));`
      );

      const dirX = allocator.nextId();
      await writer.writeLine(
        `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));`
      );

      const axisPlace = allocator.nextId();
      await writer.writeLine(`${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});`);
      const planeId = allocator.nextId();
      await writer.writeLine(`${planeId} = PLANE('${s.id}', ${axisPlace});`);
      surfaceToStepId.set(s.id, planeId);

      for (let k = 0; k < s.inlierIndices.length; k++) {
        triangleToSurfaceId.set(s.inlierIndices[k], planeId);
      }
    } else if (s.type === 'cylinder') {
      const c = s as CylinderSurface;
      const dirVec: Vector3D = [...c.axisDirection];

      const ptId = allocator.nextId();
      await writer.writeLine(
        `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(c.axisOrigin[0])}, ${formatStepFloat(c.axisOrigin[1])}, ${formatStepFloat(c.axisOrigin[2])}));`
      );

      const basis = computeOrthonormalBasis(dirVec);
      const dirZ = allocator.nextId();
      await writer.writeLine(
        `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));`
      );

      const dirX = allocator.nextId();
      await writer.writeLine(
        `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));`
      );

      const axisPlace = allocator.nextId();
      await writer.writeLine(`${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});`);
      const cylId = allocator.nextId();
      await writer.writeLine(`${cylId} = CYLINDRICAL_SURFACE('${s.id}', ${axisPlace}, ${formatStepFloat(c.radius)});`);
      surfaceToStepId.set(s.id, cylId);

      const positions = mesh.positions;
      const indices = mesh.indices;
      for (let k = 0; k < s.inlierIndices.length; k++) {
        const tIdx = s.inlierIndices[k];
        if (triangleToSurfaceId.has(tIdx)) continue;

        // Verify normal perpendicularity against cylinder axis
        const i0 = indices[tIdx * 3] * 3;
        const i1 = indices[tIdx * 3 + 1] * 3;
        const i2 = indices[tIdx * 3 + 2] * 3;
        const e1x = positions[i1] - positions[i0];
        const e1y = positions[i1 + 1] - positions[i0 + 1];
        const e1z = positions[i1 + 2] - positions[i0 + 2];
        const e2x = positions[i2] - positions[i0];
        const e2y = positions[i2 + 1] - positions[i0 + 1];
        const e2z = positions[i2 + 2] - positions[i0 + 2];
        let tnx = e1y * e2z - e1z * e2y;
        let tny = e1z * e2x - e1x * e2z;
        let tnz = e1x * e2y - e1y * e2x;
        const tLen = Math.sqrt(tnx * tnx + tny * tny + tnz * tnz);
        if (tLen > 1e-12) {
          tnx /= tLen; tny /= tLen; tnz /= tLen;
          const normalDotAxis = Math.abs(tnx * dirVec[0] + tny * dirVec[1] + tnz * dirVec[2]);
          if (normalDotAxis > 0.22) continue; // Skip flat or angled facets (chamfers, flanks)

          // Verify normal points radially towards/away from cylinder axis
          const cx = (positions[i0] + positions[i1] + positions[i2]) / 3;
          const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3;
          const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3;
          const dx = cx - c.axisOrigin[0];
          const dy = cy - c.axisOrigin[1];
          const dz = cz - c.axisOrigin[2];
          const pDot = dx * dirVec[0] + dy * dirVec[1] + dz * dirVec[2];
          const rx = dx - pDot * dirVec[0];
          const ry = dy - pDot * dirVec[1];
          const rz = dz - pDot * dirVec[2];
          const rDist = Math.hypot(rx, ry, rz);
          if (rDist > 1e-4) {
            const radialAlign = Math.abs((tnx * rx + tny * ry + tnz * rz) / rDist);
            if (radialAlign < 0.70) continue; // Not pointing radially: reject!
          }
        }
        triangleToSurfaceId.set(tIdx, cylId);
      }
    }
  }

  // Pre-index all remaining unclassified facet planes in batch
  const facetPlaneCache = await preIndexFacetPlanes(writer, allocator, mesh, triangleToSurfaceId);

  const getOrCreateFacetPlane = async (tIdx: number): Promise<string> => {
    const existing = triangleToSurfaceId.get(tIdx);
    if (existing) return existing;
    return facetPlaneCache.values().next().value || allocator.nextId();
  };

  return {
    surfaceToStepId,
    triangleToSurfaceId,
    getOrCreateFacetPlane
  };
}
