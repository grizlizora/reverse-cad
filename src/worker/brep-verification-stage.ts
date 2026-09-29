// ==============================================================================
// src/worker/brep-verification-stage.ts — Stages 6 & 7 (B-Rep Export & RSVS Gate 1-4)
// ==============================================================================
// Encapsulates Stage 6 (STEP AP242 B-Rep Solid Synthesis) and Stage 7
// (Two-Tier JSON Export & RSVS Quality Verification) for the worker pipeline.
// ==============================================================================

import { PipelineTaskPayload, PipelineStage } from '../types/worker.js';
import { RawMesh } from '../types/geometry.js';
import { PolyhedralMassProperties } from '../utils/mass-properties.js';
import { exportBRepStep } from '../stages/stage6-brep-step.js';
import { exportCADJson } from '../stages/stage7-export-json.js';
import { runRSVS } from '../rsvs/rsvs-suite.js';
import { PipelineContext } from './pipeline-context.js';
import { WorkerAbortMonitor } from './worker-abort-monitor.js';
import { yieldToEventLoop } from './stage-runner.js';

export interface BRepExportAndVerifyOutputs {
  stepFilePath?: string;
  jsonSummaryPath?: string;
  jsonTopologyPath?: string;
  summaryData?: any;
}

export async function executeBRepAndVerificationStages(
  ctx: PipelineContext,
  payload: PipelineTaskPayload,
  monitor: WorkerAbortMonitor,
  emit: (stageNumber: number, stageName: PipelineStage, percent: number) => void,
  rawGroundTruthMesh?: RawMesh,
  rawMassProps?: PolyhedralMassProperties,
  overrideBaseName?: string
): Promise<BRepExportAndVerifyOutputs> {
  const outDir = payload.options.outDir;
  const baseName = overrideBaseName || ctx.baseName;

  // -------------------------------------------------------------------------
  // Stage 6: STEP AP242 B-Rep Solid Synthesis
  // -------------------------------------------------------------------------
  monitor.checkAbort('6_BREP_STEP_SYNTH');
  emit(6, '6_BREP_STEP_SYNTH', 88);
  const targets = payload.options.emitTargets;
  const shouldEmitStep = targets ? targets.step : !payload.options.jsonOnly;
  const shouldEmitSummary = targets ? targets.summary : !payload.options.stepOnly;
  const shouldEmitTopology = targets ? targets.topology : !payload.options.stepOnly;
  const shouldEmitReport = targets ? targets.report : payload.options.verify;
  const shouldEmitHeatmap = targets ? targets.heatmap : (payload.options.heatmapMode === 'always');

  let stepFilePath: string | undefined;
  if (shouldEmitStep) {
    ctx.stepResult = await exportBRepStep(
      ctx.sanitizeReport!.cleanedMesh,
      ctx.surfaces,
      ctx.profiling!.threads,
      outDir,
      baseName,
      ctx.sanitizeReport!.shells,
      undefined,
      ctx.profiling!.kinematicJoints,
      {
        representationMode: payload.options.representationMode,
        threadMode: payload.options.threadMode,
        material: payload.options.material
      }
    );
    stepFilePath = ctx.stepResult.stepFilePath;
  }
  await yieldToEventLoop(monitor, '6_BREP_STEP_SYNTH');

  // -------------------------------------------------------------------------
  // Stage 7: Two-Tier JSON Export & RSVS Quality Verification
  // -------------------------------------------------------------------------
  monitor.checkAbort('7_EXPORT_JSON_VERIFY');
  emit(7, '7_EXPORT_JSON_VERIFY', 95);
  let jsonSummaryPath: string | undefined;
  let jsonTopologyPath: string | undefined;
  let summaryData: any;

  if (shouldEmitSummary || shouldEmitTopology) {
    ctx.jsonResult = await exportCADJson(
      ctx.sanitizeReport!.cleanedMesh,
      ctx.surfaces,
      ctx.sanitizeReport!.shells,
      ctx.profiling!,
      outDir,
      baseName,
      ctx.stepResult?.bRepSynthesis,
      { skipTopology: !shouldEmitTopology, material: payload.options.material }
    );
    if (shouldEmitSummary) jsonSummaryPath = ctx.jsonResult.summaryPath;
    if (shouldEmitTopology) jsonTopologyPath = ctx.jsonResult.topologyPath;
    summaryData = ctx.jsonResult.summaryData;
    if (ctx.isFacetedFallback && summaryData) {
      summaryData.conversion_mode = 'FACETED_SOLID_FALLBACK';
    }
  }

  if ((shouldEmitReport || shouldEmitHeatmap || payload.options.verify) && !ctx.isFacetedFallback) {
    const activeHeatmapMode = shouldEmitHeatmap
      ? 'always'
      : (targets ? 'none' : payload.options.heatmapMode);

    ctx.rsvsResult = await runRSVS(
      ctx.sanitizeReport!.cleanedMesh,
      ctx.surfaces,
      ctx.sanitizeReport!.shells,
      ctx.profiling!,
      {
        outputDir: outDir,
        baseFileName: baseName,
        isClosedSolid: ctx.sanitizeReport!.isWatertight,
        openEdgesCount: ctx.sanitizeReport!.openEdgesCount,
        degenerateCount: ctx.sanitizeReport!.degenerateTrianglesRemoved,
        eulerCharacteristic: ctx.sanitizeReport!.eulerCharacteristic,
        heatmapMode: activeHeatmapMode,
        rawMesh: rawGroundTruthMesh ?? ctx.rawMesh ?? undefined,
        rawMassProps,
        stepFilePath,
        skipReportFile: targets ? !targets.report : false
      }
    );
  }

  ctx.rawMesh = null;
  emit(7, '7_EXPORT_JSON_VERIFY', 100);

  return {
    stepFilePath,
    jsonSummaryPath,
    jsonTopologyPath,
    summaryData
  };
}
