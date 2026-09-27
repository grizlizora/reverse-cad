// ==============================================================================
// src/kernel/step/step-brep-builder.ts — STEP AP242 Multi-Body B-Rep Assembly
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SolidBodyConfig, StepSolidBodyMetadata, StepBRepSynthesisReport } from './step-types.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { buildFastMultiBodyBRep } from './fast-brep-builder.js';

export interface BRepAssemblyResult {
  solidBRepIds: string[];
  allStyledItemIds: string[];
  report: StepBRepSynthesisReport;
}

export { buildFastMultiBodyBRep };

/**
 * Builds standard STEP AP242 Multi-Body solid B-Rep topology (Closed Shells, Faces, Loops)
 * and calculates exact analytical metadata using high-throughput block buffering.
 */
export async function buildMultiBodyBRep(
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
  return buildFastMultiBodyBRep(
    writer,
    allocator,
    mesh,
    targetShells,
    bodyDefinitions,
    bodyPresentationStyles,
    surfaceMapping,
    pointIds,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ
  );
}

/**
 * Emits top-level AP242 shape representations, product definitions, and closes file.
 */
export async function writeProductDefinitionHierarchy(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  modelName: string,
  solidBRepIds: string[],
  axisPlacementId: string,
  geometricContextId: string,
  author = 'CAD Reverse-Engineering Engine v1.0',
  organization = 'Open Source CAD Project'
): Promise<void> {
  const shapeRepId = allocator.nextId();
  const shapeDefRepId = allocator.nextId();
  const prodDefShapeId = allocator.nextId();
  const prodDefId = allocator.nextId();
  const prodDefFormId = allocator.nextId();
  const prodId = allocator.nextId();
  const appContextId = allocator.nextId();
  const prodContextId = allocator.nextId();
  const appMechContextId = allocator.nextId();
  const appProtocolDefId = allocator.nextId();

  const repItems = [axisPlacementId, ...solidBRepIds].join(', ');
  await writer.writeLine(`${shapeRepId} = ADVANCED_BREP_SHAPE_REPRESENTATION('${modelName}_Assembly', (${repItems}), ${geometricContextId});`);
  await writer.writeLine(`${shapeDefRepId} = SHAPE_DEFINITION_REPRESENTATION(${prodDefShapeId}, ${shapeRepId});`);
  await writer.writeLine(`${prodDefShapeId} = PRODUCT_DEFINITION_SHAPE('${modelName}_Shape', 'Shape of ${modelName}', ${prodDefId});`);
  await writer.writeLine(`${prodDefId} = PRODUCT_DEFINITION('${modelName}_PD', 'Product definition for ${modelName}', ${prodDefFormId}, ${prodContextId});`);
  await writer.writeLine(`${prodDefFormId} = PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('${modelName}_PDF', 'Formation 1', ${prodId}, .NOT_KNOWN.);`);
  await writer.writeLine(`${prodId} = PRODUCT('${modelName}', '${modelName}', 'Converted from 3D Mesh', (${appMechContextId}));`);
  await writer.writeLine(`${appContextId} = APPLICATION_CONTEXT('core data for automotive mechanical design processes');`);
  await writer.writeLine(`${prodContextId} = PRODUCT_DEFINITION_CONTEXT('part definition', ${appContextId}, 'design');`);
  await writer.writeLine(`${appMechContextId} = MECHANICAL_CONTEXT('mechanical', ${appContextId}, 'mechanical design');`);
  await writer.writeLine(`${appProtocolDefId} = APPLICATION_PROTOCOL_DEFINITION('international standard', 'automotive_design', 2000, ${appContextId});`);
}

/**
 * Finalizes and closes the STEP ISO 10303-21 data section and file.
 */
export async function writeStepFooter(writer: StepStreamWriter): Promise<void> {
  await writer.writeLine('ENDSEC;');
  await writer.writeLine('END-ISO-10303-21;');
  await writer.close();
}
