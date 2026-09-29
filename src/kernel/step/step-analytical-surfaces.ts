// ==============================================================================
// src/kernel/step/step-analytical-surfaces.ts — Analytical B-Rep Surfaces Generator Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive, PlaneSurface, CylinderSurface, Vector3D } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';
import { preIndexFacetPlanes } from './step-facet-plane-indexer.js';
import { createFacetPlaneResolver } from './facet-plane-fallback-resolver.js';

export interface SurfaceStepMapping {
  surfaceToStepId: Map<string, string>;
  triangleToSurfaceId: Map<number, string>;
  triangleSameSense: Uint8Array;
  getOrCreateFacetPlane: (tIdx: number) => Promise<string>;
  surfaces?: SurfacePrimitive[];
}

export { preIndexFacetPlanes };

/**
 * Emits analytical B-Rep surfaces (PLANE, CYLINDRICAL_SURFACE) in batched stream blocks.
 */
export async function writeAnalyticalSurfaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  surfaces: SurfacePrimitive[]
): Promise<SurfaceStepMapping> {
  const surfaceToStepId = new Map<string, string>();
  const triangleToSurfaceId = new Map<number, string>();
  const triangleSameSense = new Uint8Array(mesh.triangleCount).fill(1);

  let buffer = '';
  const flush = async () => {
    if (buffer.length > 32768) {
      await writer.writeBlock(buffer);
      buffer = '';
    }
  };

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];

    if (s.type === 'plane') {
      const p = s as PlaneSurface;
      const ptId = allocator.nextId();
      buffer += `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(p.origin[0])}, ${formatStepFloat(p.origin[1])}, ${formatStepFloat(p.origin[2])}));\n`;

      const basis = computeOrthonormalBasis(p.normal);
      const dirZ = allocator.nextId();
      buffer += `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n`;
      const dirX = allocator.nextId();
      buffer += `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n`;

      const axisPlace = allocator.nextId();
      buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n`;
      const planeId = allocator.nextId();
      buffer += `${planeId} = PLANE('${s.id}', ${axisPlace});\n`;
      surfaceToStepId.set(s.id, planeId);

      const positions = mesh.positions;
      const indices = mesh.indices;
      for (let k = 0; k < s.inlierIndices.length; k++) {
        const tIdx = s.inlierIndices[k];
        triangleToSurfaceId.set(tIdx, planeId);

        const i0 = indices[tIdx * 3] * 3;
        const i1 = indices[tIdx * 3 + 1] * 3;
        const i2 = indices[tIdx * 3 + 2] * 3;
        const e1x = positions[i1] - positions[i0];
        const e1y = positions[i1 + 1] - positions[i0 + 1];
        const e1z = positions[i1 + 2] - positions[i0 + 2];
        const e2x = positions[i2] - positions[i0];
        const e2y = positions[i2 + 1] - positions[i0 + 1];
        const e2z = positions[i2 + 2] - positions[i0 + 2];
        const tnx = e1y * e2z - e1z * e2y;
        const tny = e1z * e2x - e1x * e2z;
        const tnz = e1x * e2y - e1y * e2x;
        const dot = tnx * p.normal[0] + tny * p.normal[1] + tnz * p.normal[2];
        if (dot < 0) {
          triangleSameSense[tIdx] = 0;
        }
      }
    } else if (s.type === 'cylinder') {
      const c = s as CylinderSurface;
      const dirVec: Vector3D = [...c.axisDirection];

      const ptId = allocator.nextId();
      buffer += `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(c.axisOrigin[0])}, ${formatStepFloat(c.axisOrigin[1])}, ${formatStepFloat(c.axisOrigin[2])}));\n`;

      const basis = computeOrthonormalBasis(dirVec);
      const dirZ = allocator.nextId();
      buffer += `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n`;
      const dirX = allocator.nextId();
      buffer += `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n`;

      const axisPlace = allocator.nextId();
      buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n`;
      const cylId = allocator.nextId();
      buffer += `${cylId} = CYLINDRICAL_SURFACE('${s.id}', ${axisPlace}, ${formatStepFloat(c.radius)});\n`;
      surfaceToStepId.set(s.id, cylId);

      if (c.inlierIndices && c.inlierIndices.length > 0) {
        for (let k = 0; k < c.inlierIndices.length; k++) {
          triangleToSurfaceId.set(c.inlierIndices[k], cylId);
        }
      }
    }

    await flush();
  }

  if (buffer.length > 0) {
    await writer.writeBlock(buffer);
  }

  const getOrCreateFacetPlane = createFacetPlaneResolver(
    writer,
    allocator,
    mesh,
    triangleToSurfaceId,
    triangleSameSense,
    surfaceToStepId,
    surfaces
  );

  return {
    surfaceToStepId,
    triangleToSurfaceId,
    triangleSameSense,
    getOrCreateFacetPlane,
    surfaces
  };
}
