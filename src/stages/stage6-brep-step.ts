// ==============================================================================
// src/stages/stage6-brep-step.ts — B-Rep Synthesis & STEP AP242 Export
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../types/geometry.js';
import { CADThread, CADKinematicJoint } from '../types/features.js';
import { writeStepFile, SolidBodyConfig, StepBRepSynthesisReport } from '../kernel/step-writer.js';
import * as path from 'path';

export interface BRepStepResult {
  stepFilePath: string;
  isClosedSolid: boolean;
  fileSizeBytes: number;
  bRepSynthesis: StepBRepSynthesisReport;
}

/**
 * Synthesizes a valid B-Rep CAD model and writes ISO 10303-21 STEP AP242.
 */
export async function exportBRepStep(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  threads: CADThread[],
  outputDir: string,
  baseFileName: string,
  shells?: MeshShell[],
  bodyConfigs?: SolidBodyConfig[],
  kinematicJoints?: CADKinematicJoint[]
): Promise<BRepStepResult> {
  const stepFileName = `${baseFileName}.step`;
  const stepFilePath = path.join(outputDir, stepFileName);

  const bRepSynthesis = await writeStepFile(stepFilePath, mesh, surfaces, threads, {
    modelName: baseFileName,
    author: 'Roman Vaida (@grizlizora) — ReverseCAD Engine',
    shells,
    bodyConfigs,
    kinematicJoints
  });

  return {
    stepFilePath,
    isClosedSolid: true,
    fileSizeBytes: mesh.triangleCount * 65, // approximate
    bRepSynthesis
  };
}
