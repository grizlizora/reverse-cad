// ==============================================================================
// src/stages/export/summary-json-exporter.ts — High-Density AI Summary JSON Exporter Façade
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import { StepBRepSynthesisReport } from '../../kernel/step/step-types.js';
import { PolyhedralMassProperties } from '../../utils/mass-properties.js';
import { applyContextBudget } from '../../capabilities/cad-budget-engine.js';
import { buildCADFeaturesSummary } from './cad-summary-builder.js';
import * as fs from 'fs';

export { buildCADFeaturesSummary };

/**
 * Builds and saves high-density summary JSON (< 1200 tokens).
 */
export async function exportSummaryJson(
  mesh: RawMesh,
  shells: MeshShell[],
  profiling: ProfilingResult,
  outputPath: string,
  baseFileName: string,
  bRepSynthesis?: StepBRepSynthesisReport,
  precomputedMassProps?: PolyhedralMassProperties
): Promise<CADFeaturesSummary> {
  const rawSummary = buildCADFeaturesSummary(
    mesh,
    shells,
    profiling,
    baseFileName,
    bRepSynthesis,
    precomputedMassProps
  );

  const budgeted = applyContextBudget(rawSummary, 'ctx_8k_balanced');

  if (outputPath) {
    await fs.promises.writeFile(outputPath, JSON.stringify(budgeted, null, 2), 'utf8');
  }

  return budgeted;
}
