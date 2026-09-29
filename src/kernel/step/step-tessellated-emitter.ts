// ==============================================================================
// src/kernel/step/step-tessellated-emitter.ts — Adaptive AP242 Organic Mesh Emitter
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { SolidBodyConfig } from './step-types.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { streamCoordinatesList, streamTriangulatedFace } from './step-tessellated-packer.js';

export interface TessellatedSynthesisReport {
  coordinatesListId: string;
  triangulatedFaceId: string;
  tessellatedSolidId: string;
  solidIds: string[];
  totalVertices: number;
  totalTriangles: number;
}

/** Calculates analytical CAD primitive coverage ratio: eta = Area(Planes + Cylinders + Cones + Tori) / TotalArea */
export function computeAnalyticalCoverageRatio(
  surfaces: Array<{ type: string; area: number; inlierIndices?: ArrayLike<number>; triangleIndices?: ArrayLike<number> }>,
  totalMeshTriangles?: number
): number {
  if (!surfaces || surfaces.length === 0) return 0.0;
  if (typeof totalMeshTriangles === 'number' && totalMeshTriangles > 0) {
    let analyticalTris = 0;
    for (const s of surfaces) {
      if (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus') {
        const indices = s.inlierIndices ?? s.triangleIndices;
        analyticalTris += indices ? indices.length : 0;
      }
    }
    return analyticalTris / totalMeshTriangles;
  }
  let analyticalArea = 0;
  let totalArea = 0;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    const a = Math.max(0, s.area);
    totalArea += a;
    if (s.type === 'plane' || s.type === 'cylinder' || s.type === 'cone' || s.type === 'torus') analyticalArea += a;
  }
  return totalArea > 1e-9 ? analyticalArea / totalArea : 0.0;
}

/**
 * Emits an ultra-compact ISO 10303-42 / AP242 COORDINATES_LIST and TRIANGULATED_FACE.
 * Streams data in chunks without accumulating gigabytes in V8 heap memory.
 */
export async function writeTessellatedShapeAP242(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  solidName: string = 'ORGANIC_SOLID',
  targetShells?: MeshShell[],
  bodyDefinitions?: SolidBodyConfig[]
): Promise<TessellatedSynthesisReport> {
  const vertexCount = mesh.vertexCount;
  const triangleCount = mesh.triangleCount;
  const pos = mesh.positions;
  const idx = mesh.indices;

  // 1. COORDINATES_LIST: single contiguous coordinate array
  const coordListId = await streamCoordinatesList(writer, allocator, pos, vertexCount);

  const solidIds: string[] = [];
  let firstTriFaceId = '';

  if (targetShells && targetShells.length > 1) {
    // Multi-body assembly support: emit per-shell TRIANGULATED_FACE, TESSELLATED_SHELL, and TESSELLATED_SOLID
    for (let b = 0; b < targetShells.length; b++) {
      const shTris = targetShells[b].triangleIndices;
      if (shTris.length === 0) continue;

      const bName = bodyDefinitions?.[b]?.name ?? `${solidName}_${b + 1}`;
      const triFaceId = await streamTriangulatedFace(writer, allocator, coordListId, idx, shTris);
      if (!firstTriFaceId) firstTriFaceId = triFaceId;

      const shellId = allocator.nextId();
      await writer.writeLine(`${shellId} = TESSELLATED_SHELL('', (${triFaceId}));`);

      const solidId = allocator.nextId();
      await writer.writeLine(`${solidId} = TESSELLATED_SOLID('${bName}', (${shellId}));`);
      solidIds.push(solidId);
    }
  } else {
    // Single monolithic solid
    const triFaceId = await streamTriangulatedFace(writer, allocator, coordListId, idx, undefined, triangleCount);
    firstTriFaceId = triFaceId;

    const shellId = allocator.nextId();
    await writer.writeLine(`${shellId} = TESSELLATED_SHELL('', (${triFaceId}));`);

    const solidId = allocator.nextId();
    await writer.writeLine(`${solidId} = TESSELLATED_SOLID('${solidName}', (${shellId}));`);
    solidIds.push(solidId);
  }

  return {
    coordinatesListId: coordListId,
    triangulatedFaceId: firstTriFaceId,
    tessellatedSolidId: solidIds[0],
    solidIds,
    totalVertices: vertexCount,
    totalTriangles: triangleCount
  };
}
