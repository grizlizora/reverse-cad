// ==============================================================================
// src/stages/stage7-export-json.ts — Two-Tier AI JSON Export (< 1200 tokens summary)
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../types/geometry.js';
import { CADFeaturesSummary } from '../types/features.js';
import { ProfilingResult } from './stage5-profiling.js';
import { StepBRepSynthesisReport } from '../kernel/step-writer.js';
import { exportSummaryJson } from './export/summary-json-exporter.js';
import { exportTopologyJsonStream } from './export/topology-json-exporter.js';
import * as path from 'path';

export * from './export/dfm-rules-engine.js';
export * from './export/summary-json-exporter.js';
export * from './export/topology-json-exporter.js';

export interface JsonExportResult {
  summaryPath: string;
  topologyPath: string;
  summaryData: CADFeaturesSummary;
}

/**
 * Exports two-tier JSON data:
 * 1. High-density summary JSON (< 1200 tokens) designed for LLMs / AI reasoning
 * 2. Detailed topology JSON containing all primitive coordinates and mesh shells
 */
export async function exportCADJson(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  profiling: ProfilingResult,
  outputDir: string,
  baseFileName: string,
  bRepSynthesis?: StepBRepSynthesisReport,
  options?: { skipTopology?: boolean; material?: string }
): Promise<JsonExportResult> {
  const summaryFileName = `${baseFileName}.cad_features.summary.json`;
  const topologyFileName = `${baseFileName}.cad_features.topology.json`;

  const summaryPath = path.join(outputDir, summaryFileName);
  const topologyPath = path.join(outputDir, topologyFileName);

  const summaryData = await exportSummaryJson(
    mesh,
    shells,
    profiling,
    summaryPath,
    baseFileName,
    bRepSynthesis,
    undefined,
    options?.material
  );

  if (!options?.skipTopology) {
    await exportTopologyJsonStream(
      summaryData,
      surfaces,
      profiling,
      topologyPath
    );
  }

  return { summaryPath, topologyPath, summaryData };
}
