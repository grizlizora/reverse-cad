// ==============================================================================
// src/stages/export/cad-material-summary-builder.ts — CAD Materials & Bodies Builder
// Computes physical mass properties, transparency, and per-body material specs.
// ==============================================================================

import { MeshShell } from '../../types/geometry.js';
import { CADMaterialElement, CADMaterialsSummary, CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import { classifySolidBodies } from '../../utils/body-classifier.js';
import { StepBRepSynthesisReport } from '../../kernel/step/step-types.js';
import { round2, round3, round4 } from '../../utils/numeric-format.js';
import { resolveBodyMaterials } from '../../standards/material-assignment.js';

export type CADSolidBody = NonNullable<CADFeaturesSummary['solidBodies']>[number];

export function buildMaterialsSummaryAndBodies(
  shells: MeshShell[],
  profiling: ProfilingResult,
  bRepSynthesis?: StepBRepSynthesisReport,
  materialSpecStr?: string
): { materialsSummary: CADMaterialsSummary; solidBodies: CADSolidBody[] } {
  const classified = classifySolidBodies(shells, profiling.kinematicJoints);
  const solidShells = classified.map(c => c.shell);
  const assignedMaterials = resolveBodyMaterials(solidShells, classified, materialSpecStr, profiling);

  let totalMassGrams = 0;
  let hasTransparentOptics = false;
  const materialElements: CADMaterialElement[] = [];

  for (let i = 0; i < classified.length; i++) {
    const c = classified[i];
    const mat = assignedMaterials[i] ?? assignedMaterials[0];
    const vol = bRepSynthesis?.solidBodies[i]?.volumeMm3 ?? Math.abs(c.shell.signedVolume);
    const density = bRepSynthesis?.solidBodies[i]?.densityGcm3 ?? mat.densityGcm3;
    const mass = (vol / 1000.0) * density;
    totalMassGrams += mass;
    if (mat.transparency > 0.0) {
      hasTransparentOptics = true;
    }

    materialElements.push({
      bodyIndex: i,
      name: c.name,
      role: c.role,
      materialName: mat.materialName ?? mat.materialSpec.name,
      category: mat.materialSpec.category,
      densityGcm3: round3(density),
      volumeMm3: round2(vol),
      massGrams: round2(mass),
      transparency: round2(mat.transparency),
      refractiveIndex: mat.refractiveIndex,
      youngsModulusGpa: mat.youngsModulusGpa,
      colorRgb: mat.colorRgb ?? [0.70, 0.70, 0.72]
    });
  }

  const materialsSummary: CADMaterialsSummary = {
    totalMassGrams: round2(totalMassGrams),
    hasTransparentOptics,
    elements: materialElements
  };

  const solidBodies: CADSolidBody[] = bRepSynthesis
    ? bRepSynthesis.solidBodies.map((sb, i) => {
        const mat = assignedMaterials[i];
        return {
          ...sb,
          materialName: sb.materialName ?? mat?.materialName,
          densityGcm3: sb.densityGcm3 ?? mat?.densityGcm3,
          transparency: sb.transparency ?? mat?.transparency,
          massGrams: sb.massGrams ?? (mat?.densityGcm3 ? round2((sb.volumeMm3 / 1000.0) * mat.densityGcm3) : undefined)
        };
      })
    : classified.map((c, i) => {
        const mat = assignedMaterials[i];
        const vol = round4(Math.abs(c.shell.signedVolume));
        const density = mat?.densityGcm3 ?? 7.85;
        return {
          name: c.name,
          volumeMm3: vol,
          materialName: mat?.materialName,
          densityGcm3: density,
          massGrams: round2((vol / 1000.0) * density),
          transparency: mat?.transparency,
          boundingBox: {
            min: [
              round4(c.shell.boundingBox.min[0]),
              round4(c.shell.boundingBox.min[1]),
              round4(c.shell.boundingBox.min[2])
            ] as [number, number, number],
            max: [
              round4(c.shell.boundingBox.max[0]),
              round4(c.shell.boundingBox.max[1]),
              round4(c.shell.boundingBox.max[2])
            ] as [number, number, number],
            dimensions: [
              round4(c.shell.boundingBox.dimensions[0]),
              round4(c.shell.boundingBox.dimensions[1]),
              round4(c.shell.boundingBox.dimensions[2])
            ] as [number, number, number],
            center: [
              round4(c.shell.boundingBox.center[0]),
              round4(c.shell.boundingBox.center[1]),
              round4(c.shell.boundingBox.center[2])
            ] as [number, number, number],
            diagonal: round4(c.shell.boundingBox.diagonal)
          }
        };
      });

  return { materialsSummary, solidBodies };
}
