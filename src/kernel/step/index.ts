// ==============================================================================
// src/kernel/step/index.ts — Unified ISO 10303-21 STEP AP242 Multi-Body Kernel
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../../types/geometry.js';
import { CADThread } from '../../types/features.js';
import { classifySolidBodies } from '../../utils/body-classifier.js';
import {
  SolidBodyConfig,
  StepSolidBodyMetadata,
  StepBRepSynthesisReport,
  StepWriterOptions
} from './step-types.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { writeStepHeader, writeGeometricContext, writeCartesianPoints } from './step-meta-builder.js';
import {
  writeBodyPresentationStyles,
  writeThreadLayers,
  writePresentationRepresentation
} from './step-presentation-styles.js';
import { writeAnalyticalSurfaces } from './step-analytical-surfaces.js';
import { buildMultiBodyBRep, writeProductDefinitionHierarchy } from './step-brep-builder.js';

export * from './step-types.js';
export * from './step-id-allocator.js';
export * from './step-stream-writer.js';
export * from './step-meta-builder.js';
export * from './step-presentation-styles.js';
export * from './step-analytical-surfaces.js';
export * from './step-brep-builder.js';

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

  // 1. Resolve Solid Bodies from Shells
  const rawShells = options.shells ?? shells;
  let targetShells: MeshShell[] = [];

  if (rawShells && rawShells.length > 0) {
    targetShells = rawShells.filter(s => !s.isCavity && s.triangleIndices.length > 0);
  }

  // Graceful fallback: If no shells provided, wrap entire mesh in a single body
  if (targetShells.length === 0) {
    targetShells = [{
      shellIndex: 0,
      triangleIndices: Array.from({ length: mesh.triangleCount }, (_, i) => i),
      signedVolume: 1.0,
      surfaceArea: 1.0,
      isCavity: false,
      boundingBox: mesh.boundingBox
    }];
  }

  // Topologically classify solid bodies based on kinematic role
  const classified = classifySolidBodies(targetShells, options.kinematicJoints);
  targetShells = classified.map(c => c.shell);

  // Assign semantic configurations to each body
  const bodyDefinitions: SolidBodyConfig[] = classified.map((c, idx) => {
    if (options.bodyConfigs && options.bodyConfigs[idx]) {
      return options.bodyConfigs[idx];
    }
    return {
      name: c.name,
      colorLabel: c.colorLabel,
      colorRgb: c.colorRgb
    };
  });

  // 2. ISO 10303-21 Header
  await writeStepHeader(writer, modelName, author, org, timestamp);

  // 3. Units, CS, Context
  const contextIds = await writeGeometricContext(writer, allocator);

  // 4. Body-level Presentation Styles
  const bodyStyles = await writeBodyPresentationStyles(writer, allocator, bodyDefinitions);

  // 5. Cartesian Points for all mesh vertices
  const points = await writeCartesianPoints(writer, allocator, mesh);

  // 6. Analytical B-Rep Surfaces
  const surfaceMapping = await writeAnalyticalSurfaces(writer, allocator, mesh, surfaces);

  // 7. Multi-Body B-Rep Solid Topology
  const brepResult = await buildMultiBodyBRep(
    writer,
    allocator,
    mesh,
    targetShells,
    bodyDefinitions,
    bodyStyles,
    surfaceMapping,
    points.pointIds,
    points.stepVerticesX,
    points.stepVerticesY,
    points.stepVerticesZ
  );

  // 8. AP242 Semantic PMI Thread Presentation Layers
  if (brepResult.solidBRepIds.length > 0) {
    await writeThreadLayers(writer, allocator, threads, brepResult.solidBRepIds[0]);
  }

  // 9. Mechanical Design Presentation Representation container
  await writePresentationRepresentation(
    writer,
    allocator,
    brepResult.allStyledItemIds,
    contextIds.idContext
  );

  // 10. Top-level Shape Representation and Product Definition Hierarchy
  await writeProductDefinitionHierarchy(
    writer,
    allocator,
    modelName,
    brepResult.solidBRepIds,
    contextIds.idAxisPlacement,
    contextIds.idContext
  );

  // 11. Close writer and flush remaining buffers
  await writer.close();

  return brepResult.report;
}
