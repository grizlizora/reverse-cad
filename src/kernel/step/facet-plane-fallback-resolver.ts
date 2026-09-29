// ==============================================================================
// src/kernel/step/facet-plane-fallback-resolver.ts — On-Demand Facet Plane Resolver
// Deduplicates and batches planar fallback entities for unclassified mesh triangles.
// ==============================================================================

import { RawMesh, SurfacePrimitive } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';

export function createFacetPlaneResolver(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  triangleToSurfaceId: Map<number, string>,
  triangleSameSense: Uint8Array,
  surfaceToStepId: Map<string, string>,
  surfaces?: SurfacePrimitive[]
): (tIdx: number) => Promise<string> {
  const facetPlaneKeyCache = new Map<string, string>();
  let buffer = '';

  return async (tIdx: number): Promise<string> => {
    const existing = triangleToSurfaceId.get(tIdx);
    if (existing) {
      const isNonPlane = surfaces?.some(s => s.type !== 'plane' && surfaceToStepId.get(s.id) === existing);
      if (!isNonPlane) {
        return existing;
      }
    }

    const indices = mesh.indices;
    const positions = mesh.positions;
    const t3 = tIdx * 3;
    const i0 = indices[t3] * 3, i1 = indices[t3 + 1] * 3, i2 = indices[t3 + 2] * 3;
    const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
    const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
    const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];
    const cx = (p0x + p1x + p2x) / 3.0;
    const cy = (p0y + p1y + p2y) / 3.0;
    const cz = (p0z + p1z + p2z) / 3.0;
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 0; nz = 1; }

    let snx = nx, sny = ny, snz = nz;
    if (Math.abs(snx) > 0.9995) { snx = Math.sign(snx); sny = 0; snz = 0; }
    else if (Math.abs(sny) > 0.9995) { snx = 0; sny = Math.sign(sny); snz = 0; }
    else if (Math.abs(snz) > 0.9995) { snx = 0; sny = 0; snz = Math.sign(snz); }

    const dist = snx * cx + sny * cy + snz * cz;
    const qnx = Math.round(snx * 100);
    const qny = Math.round(sny * 100);
    const qnz = Math.round(snz * 100);
    const qdist = Math.round(dist * 200);
    const key = `${qnx}_${qny}_${qnz}:${qdist}`;

    const cachedPlaneId = facetPlaneKeyCache.get(key);
    if (cachedPlaneId) {
      triangleToSurfaceId.set(tIdx, cachedPlaneId);
      triangleSameSense[tIdx] = 1;
      return cachedPlaneId;
    }

    const ptId = allocator.nextId();
    buffer += `${ptId} = CARTESIAN_POINT('', (${formatStepFloat(cx)}, ${formatStepFloat(cy)}, ${formatStepFloat(cz)}));\n`;
    const basis = computeOrthonormalBasis([snx, sny, snz]);
    const dirZ = allocator.nextId();
    buffer += `${dirZ} = DIRECTION('', (${formatStepFloat(basis.dirZ[0])}, ${formatStepFloat(basis.dirZ[1])}, ${formatStepFloat(basis.dirZ[2])}));\n`;
    const dirX = allocator.nextId();
    buffer += `${dirX} = DIRECTION('', (${formatStepFloat(basis.dirX[0])}, ${formatStepFloat(basis.dirX[1])}, ${formatStepFloat(basis.dirX[2])}));\n`;
    const axisPlace = allocator.nextId();
    buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptId}, ${dirZ}, ${dirX});\n`;
    const planeId = allocator.nextId();
    buffer += `${planeId} = PLANE('FACET_SURFACE', ${axisPlace});\n`;

    await writer.writeBlock(buffer);
    buffer = '';

    facetPlaneKeyCache.set(key, planeId);
    triangleToSurfaceId.set(tIdx, planeId);
    triangleSameSense[tIdx] = 1;
    return planeId;
  };
}
