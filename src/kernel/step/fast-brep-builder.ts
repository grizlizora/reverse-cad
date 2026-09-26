// ==============================================================================
// src/kernel/step/fast-brep-builder.ts — High-Throughput Buffered B-Rep STEP Synthesizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { BRepAssemblyResult } from './step-brep-builder.js';
import { SolidBodyConfig } from './step-types.js';
import { computeShellMetrics } from './brep-mesh-metrics.js';
import { BRepReportAggregator } from './brep-report-calculator.js';

/**
 * Builds multi-body topological B-Rep geometry using continuous block buffering.
 * Accumulates lines in memory and writes them in full 256KB chunks without per-triangle microtasks.
 */
export async function buildFastMultiBodyBRep(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  targetShells: MeshShell[],
  bodyDefinitions: SolidBodyConfig[],
  bodyPresentationStyles: string[],
  surfaceMapping: SurfaceStepMapping,
  pointIds: string[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array
): Promise<BRepAssemblyResult> {
  const solidBRepIds: string[] = [];
  const allStyledItemIds: string[] = [];
  const reportAggregator = new BRepReportAggregator();

  // Buffer lines locally to flush in large 256KB chunks
  let chunkBuffer = '';
  const CHUNK_CHAR_LIMIT = 256 * 1024;

  const flushBuffer = async () => {
    if (chunkBuffer.length > 0) {
      await writer.writeBlock(chunkBuffer);
      chunkBuffer = '';
    }
  };

  const indices = mesh.indices;
  const triangleToSurfaceId = surfaceMapping.triangleToSurfaceId;

  for (let b = 0; b < targetShells.length; b++) {
    const shell = targetShells[b];
    const bDef = bodyDefinitions[b];
    const shellFaceIds: string[] = [];

    // Exact topological metrics via divergence theorem
    const metrics = computeShellMetrics(
      mesh,
      shell.triangleIndices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ
    );

    reportAggregator.addShell(metrics, bDef);

    const triIndices = shell.triangleIndices;
    const triCount = triIndices.length;

    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      const t3 = t * 3;
      const i0 = indices[t3];
      const i1 = indices[t3 + 1];
      const i2 = indices[t3 + 2];

      const pt0 = pointIds[i0];
      const pt1 = pointIds[i1];
      const pt2 = pointIds[i2];

      const polyLoopId = allocator.nextId();
      chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${pt0}, ${pt1}, ${pt2}));\n`;

      const faceBoundId = allocator.nextId();
      chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;

      let surfaceRef = triangleToSurfaceId.get(t);
      if (!surfaceRef) {
        if (chunkBuffer.length > 0) await flushBuffer();
        surfaceRef = await surfaceMapping.getOrCreateFacetPlane(t);
      }

      const faceId = allocator.nextId();
      chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfaceRef}, .T.);\n`;
      shellFaceIds.push(faceId);

      if (chunkBuffer.length >= CHUNK_CHAR_LIMIT) {
        await flushBuffer();
      }
    }

    if (chunkBuffer.length > 0) await flushBuffer();

    // Stream CLOSED_SHELL in chunks without giant 12MB string concatenation
    const closedShellId = allocator.nextId();
    chunkBuffer += `${closedShellId} = CLOSED_SHELL('', (\n`;
    for (let fIdx = 0; fIdx < shellFaceIds.length; fIdx++) {
      chunkBuffer += shellFaceIds[fIdx];
      chunkBuffer += fIdx === shellFaceIds.length - 1 ? '));\n' : ', ';
      if (chunkBuffer.length >= CHUNK_CHAR_LIMIT) {
        await flushBuffer();
      }
    }
    if (chunkBuffer.length > 0) await flushBuffer();

    const brepId = allocator.nextId();
    await writer.writeLine(`${brepId} = MANIFOLD_SOLID_BREP('${bDef.name}', ${closedShellId});`);
    solidBRepIds.push(brepId);

    const styleId = bodyPresentationStyles[b];
    if (styleId) {
      const styledItemId = allocator.nextId();
      await writer.writeLine(`${styledItemId} = STYLED_ITEM('', (${styleId}), ${brepId});`);
      allStyledItemIds.push(styledItemId);
    }
  }

  return {
    solidBRepIds,
    allStyledItemIds,
    report: reportAggregator.buildReport()
  };
}
