// ==============================================================================
// src/kernel/step/step-file-orchestrator.ts — STEP AP242 Export Orchestrator
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../../types/geometry.js';
import { CADThread } from '../../types/features.js';
import { computePolyhedralMassProperties } from '../../utils/mass-properties.js';
import { StepBRepSynthesisReport, StepWriterOptions } from './step-types.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { writeStepHeader, writeGeometricContext, writeCartesianPoints } from './step-meta-builder.js';
import {
  writeBodyPresentationStyles,
  writeMaterialDesignations,
  writeThreadLayers,
  writePresentationRepresentation
} from './step-presentation-styles.js';
import { writeAnalyticalSurfaces } from './step-analytical-surfaces.js';
import { buildMultiBodyBRep, writeProductDefinitionHierarchy, writeStepFooter } from './step-brep-builder.js';
import { writeTessellatedShapeAP242 } from './step-tessellated-emitter.js';
import { prepareStepSolidBodies } from './step-body-preparation.js';

/**
 * Generates standard-compliant ISO 10303-21 (STEP AP242) Multi-Body Solid representations
 * using 256KB block buffered disk streaming, analytical B-Rep surfaces
 * (PLANE, CYLINDRICAL_SURFACE) and ISO 10303-46 7-tier per-body presentation styling.
 */
export async function writeStepFile(
  outputPath: string,
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  threads: CADThread[],
  options: StepWriterOptions = {},
  shells?: MeshShell[]
): Promise<StepBRepSynthesisReport> {
  const modelName = options.modelName ?? 'CAD_MODEL';
  const author = options.author ?? 'Antigravity 3D Reverse Engineering';
  const org = options.organization ?? 'CAD Automation';
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];

  const writer = new StepStreamWriter(outputPath, 256 * 1024);
  const allocator = new StepIdAllocator(10);

  const {
    targetShells,
    cavityShells,
    bodyDefinitions,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ,
    usedVertices,
    precomputedShells
  } = prepareStepSolidBodies(mesh, surfaces, options, shells);

  const useTessellated = (options.representationMode ?? 'brep') === 'tessellated';

  await writeStepHeader(writer, modelName, author, org, timestamp);
  const contextIds = await writeGeometricContext(writer, allocator);
  const bodyStyles = await writeBodyPresentationStyles(writer, allocator, bodyDefinitions);

  if (useTessellated) {
    const tessReport = await writeTessellatedShapeAP242(
      writer, allocator, mesh, modelName, targetShells, bodyDefinitions
    );
    const styledItemIds: string[] = [];
    for (let b = 0; b < tessReport.solidIds.length; b++) {
      if (bodyStyles[b]) {
        const styledItemId = allocator.nextId();
        await writer.writeLine(`${styledItemId} = STYLED_ITEM('', (${bodyStyles[b]}), ${tessReport.solidIds[b]});`);
        styledItemIds.push(styledItemId);
      }
    }
    await writeMaterialDesignations(writer, allocator, bodyDefinitions, tessReport.solidIds);
    await writePresentationRepresentation(writer, allocator, styledItemIds, contextIds.idContext);
    await writeProductDefinitionHierarchy(
      writer, allocator, modelName, tessReport.solidIds,
      contextIds.idAxisPlacement, contextIds.idContext, author, org,
      'TESSELLATED_SHAPE_REPRESENTATION'
    );
    await writeStepFooter(writer);

    const mass = computePolyhedralMassProperties(mesh);
    const primaryDef = bodyDefinitions[0];
    const bbox = {
      min: mesh.boundingBox.min,
      max: mesh.boundingBox.max,
      dimensions: mesh.boundingBox.dimensions,
      center: mesh.boundingBox.center,
      diagonal: mesh.boundingBox.diagonal
    };

    return {
      totalVolumeMm3: mass.volumeMm3,
      totalSurfaceAreaMm2: mass.surfaceAreaMm2,
      boundingBox: bbox,
      solidBodies: [{
        name: primaryDef?.name ?? modelName,
        volumeMm3: mass.volumeMm3,
        surfaceAreaMm2: mass.surfaceAreaMm2,
        materialName: primaryDef?.materialName,
        densityGcm3: primaryDef?.densityGcm3,
        transparency: primaryDef?.transparency,
        massGrams: primaryDef?.densityGcm3 !== undefined ? (mass.volumeMm3 / 1000.0) * primaryDef.densityGcm3 : undefined,
        boundingBox: bbox
      }]
    };
  }

  const points = await writeCartesianPoints(writer, allocator, mesh, usedVertices, {
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ
  });
  const surfaceMapping = await writeAnalyticalSurfaces(writer, allocator, mesh, surfaces);

  const brepResult = await buildMultiBodyBRep(
    writer, allocator, mesh, targetShells, bodyDefinitions, bodyStyles,
    surfaceMapping, points.pointIds, points.stepVerticesX, points.stepVerticesY,
    points.stepVerticesZ, cavityShells, precomputedShells
  );

  if (brepResult.solidBRepIds.length > 0) {
    await writeThreadLayers(writer, allocator, threads, brepResult.solidBRepIds[0]);
  }
  await writeMaterialDesignations(writer, allocator, bodyDefinitions, brepResult.solidBRepIds);
  await writePresentationRepresentation(
    writer, allocator, brepResult.allStyledItemIds, contextIds.idContext
  );
  await writeProductDefinitionHierarchy(
    writer, allocator, modelName, brepResult.solidBRepIds,
    contextIds.idAxisPlacement, contextIds.idContext
  );
  await writeStepFooter(writer);

  for (let b = 0; b < brepResult.report.solidBodies.length; b++) {
    const sb = brepResult.report.solidBodies[b];
    const bDef = bodyDefinitions[b];
    if (bDef) {
      sb.materialName = bDef.materialName;
      sb.densityGcm3 = bDef.densityGcm3;
      sb.transparency = bDef.transparency;
      if (bDef.densityGcm3 !== undefined) {
        sb.massGrams = (sb.volumeMm3 / 1000.0) * bDef.densityGcm3;
      }
    }
  }

  return brepResult.report;
}
