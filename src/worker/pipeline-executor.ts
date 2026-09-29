// ==============================================================================
// src/worker/pipeline-executor.ts — Full Pipeline Orchestrator (7 Stages)
// ==============================================================================

import { PipelineTaskPayload, PipelineResult } from '../types/worker.js';
import { RawMesh } from '../types/geometry.js';
import { readSTL } from '../stages/stage1-read.js';
import { decimateMesh } from '../stages/stage2-decimate.js';
import { sanitizeTopology } from '../stages/stage3-sanitize.js';
import { segmentSurfaces } from '../stages/stage4-segmentation.js';
import { profileFeatures } from '../stages/stage5-profiling.js';
import { alignMeshForCadViewer } from '../utils/math3d.js';
import { computePolyhedralMassProperties, PolyhedralMassProperties } from '../utils/mass-properties.js';
import { PipelineContext } from './pipeline-context.js';
import { WorkerAbortMonitor, WorkerAbortedError } from './worker-abort-monitor.js';
import { StageProgressEmitter, yieldToEventLoop, type ProgressCallback } from './stage-runner.js';
import { extractHaltonGroundTruthReference, haltonSequence } from './halton-ground-truth.js';
import { executeBRepAndVerificationStages } from './brep-verification-stage.js';

export type { ProgressCallback };
export { extractHaltonGroundTruthReference, haltonSequence, executeBRepAndVerificationStages };

export interface StageExecutionOptions {
  stopAfterStage?: 3 | 5 | 7;
  rawBuffer?: ArrayBuffer;
  onProgress?: ProgressCallback;
  overrideBaseName?: string;
}

export interface StageExecutionSummary {
  trianglesIn: number;
  rawGroundTruthMesh?: RawMesh;
  rawMassProps?: PolyhedralMassProperties;
  stepFilePath?: string;
  jsonSummaryPath?: string;
  jsonTopologyPath?: string;
  summaryData?: any;
}

export async function executePipelineStages(
  ctx: PipelineContext,
  payload: PipelineTaskPayload,
  monitor: WorkerAbortMonitor,
  execOptions: StageExecutionOptions = {}
): Promise<StageExecutionSummary> {
  const stopAfterStage = execOptions.stopAfterStage ?? 7;
  const progressEmitter = new StageProgressEmitter(payload, ctx.startTime, execOptions.onProgress);
  const emit = progressEmitter.emit.bind(progressEmitter);
  const targets = payload.options.emitTargets;
  const needGate4 = Boolean(
    payload.options.verify || payload.options.heatmapMode === 'always' ||
    targets?.report || targets?.heatmap
  );

  // Stage 1: Read & Index STL Mesh + Conditional Halton Ground-Truth
  monitor.checkAbort('1_READ_INTAKE');
  emit(1, '1_READ_INTAKE', 10);
  ctx.rawMesh = await readSTL(payload.rawBuffer || payload.filePath);
  const trianglesIn = ctx.rawMesh.triangleCount;

  if (payload.options.alignCadViewer === true) alignMeshForCadViewer(ctx.rawMesh);
  const rawMassProps = (needGate4 && ctx.rawMesh) ? computePolyhedralMassProperties(ctx.rawMesh) : undefined;
  const rawGroundTruthMesh = (needGate4 && ctx.rawMesh) ? extractHaltonGroundTruthReference(ctx.rawMesh, 3000) : undefined;
  await yieldToEventLoop(monitor, '1_READ_INTAKE');

  // Stage 2: QEM Decimation (if oversized > maxTrianglesThreshold)
  monitor.checkAbort('2_QEM_DECIMATE');
  emit(2, '2_QEM_DECIMATE', 25);
  ctx.decimatedMesh = ctx.rawMesh;
  const threshold = payload.options.maxTrianglesThreshold ?? 35000;
  if (payload.options.decimate !== false && ctx.rawMesh!.triangleCount > threshold) {
    ctx.decimatedMesh = decimateMesh(ctx.rawMesh!, {
      maxTrianglesThreshold: threshold,
      featureAngleDeg: 12,
      curvatureAngleDeg: 12,
      fineFeatureAngleDeg: 15.0,
      coplanarAngleDeg: 1.5
    });
  }

  if (!needGate4) ctx.rawMesh = null;
  else if (rawGroundTruthMesh && rawGroundTruthMesh !== ctx.rawMesh) ctx.rawMesh = rawGroundTruthMesh;
  await yieldToEventLoop(monitor, '2_QEM_DECIMATE');

  // Stage 3: Topology Sanitization & Cavity Shell Decomposition
  monitor.checkAbort('3_TOPOLOGY_SANITIZE');
  emit(3, '3_TOPOLOGY_SANITIZE', 40);
  ctx.sanitizeReport = sanitizeTopology(ctx.decimatedMesh!);
  if (stopAfterStage === 3) return { trianglesIn, rawGroundTruthMesh, rawMassProps };

  ctx.decimatedMesh = null;
  await yieldToEventLoop(monitor, '3_TOPOLOGY_SANITIZE');

  // Stage 4 & Stage 5: Surface Segmentation & Engineering Feature Profiling
  monitor.checkAbort('4_SURFACE_SEGMENT');
  try {
    emit(4, '4_SURFACE_SEGMENT', 60);
    ctx.surfaces = segmentSurfaces(ctx.sanitizeReport.cleanedMesh);
    await yieldToEventLoop(monitor, '4_SURFACE_SEGMENT');

    monitor.checkAbort('5_PROFILE_FEATURES');
    emit(5, '5_PROFILE_FEATURES', 75);
    ctx.profiling = profileFeatures(ctx.sanitizeReport.cleanedMesh, ctx.surfaces, ctx.sanitizeReport.shells, {
      inferTapDrillThreads: payload.options.inferTapDrillThreads
    });
    await yieldToEventLoop(monitor, '5_PROFILE_FEATURES');
  } catch (err: any) {
    if (err instanceof WorkerAbortedError || err?.name === 'WorkerAbortedError') throw err;
    ctx.isFacetedFallback = true;
    ctx.surfaces = [];
    ctx.profiling = { holes: [], threads: [], cavities: [], kinematicClearances: [] };
    emit(4, '4_SURFACE_SEGMENT', 100);
    emit(5, '5_PROFILE_FEATURES', 100);
  }

  if (stopAfterStage === 5) return { trianglesIn, rawGroundTruthMesh, rawMassProps };

  // Stages 6 & 7: STEP AP242 B-Rep Solid Synthesis, JSON Export & RSVS Gate 1-4
  const { stepFilePath, jsonSummaryPath, jsonTopologyPath, summaryData } =
    await executeBRepAndVerificationStages(
      ctx, payload, monitor, emit, rawGroundTruthMesh, rawMassProps, execOptions.overrideBaseName
    );

  return {
    trianglesIn, rawGroundTruthMesh, rawMassProps,
    stepFilePath, jsonSummaryPath, jsonTopologyPath, summaryData
  };
}

export async function processPipelineTask(
  payload: PipelineTaskPayload,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const ctx = new PipelineContext(payload);
  const monitor = new WorkerAbortMonitor(payload.taskId, payload.sharedAbortBuffer);

  try {
    const execRes = await executePipelineStages(ctx, payload, monitor, {
      stopAfterStage: 7,
      onProgress
    });

    return {
      taskId: payload.taskId,
      filePath: payload.filePath,
      success: true,
      stepFilePath: execRes.stepFilePath,
      jsonSummaryPath: execRes.jsonSummaryPath,
      jsonTopologyPath: execRes.jsonTopologyPath,
      summaryData: execRes.summaryData,
      verificationReport: ctx.rsvsResult,
      elapsedMs: ctx.elapsedMs,
      trianglesIn: execRes.trianglesIn,
      trianglesProcessed: ctx.sanitizeReport!.cleanedMesh.triangleCount,
      surfacesExtracted: ctx.surfaces.length
    };
  } catch (err: any) {
    return {
      taskId: payload.taskId,
      filePath: payload.filePath,
      success: false,
      error: err?.stack || err?.message || String(err),
      elapsedMs: ctx.elapsedMs,
      trianglesIn: 0,
      trianglesProcessed: 0,
      surfacesExtracted: 0
    };
  } finally {
    if (payload.progressPort && typeof payload.progressPort.close === 'function') {
      try { payload.progressPort.close(); } catch {}
    }
    ctx.dispose();
  }
}
