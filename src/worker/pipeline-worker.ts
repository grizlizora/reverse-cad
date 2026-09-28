import { PipelineTaskPayload, PipelineResult, ProgressUpdate } from '../types/worker.js';
import { readSTL } from '../stages/stage1-read.js';
import { decimateMesh } from '../stages/stage2-decimate.js';
import { sanitizeTopology } from '../stages/stage3-sanitize.js';
import { segmentSurfaces } from '../stages/stage4-segmentation.js';
import { profileFeatures } from '../stages/stage5-profiling.js';
import { exportBRepStep } from '../stages/stage6-brep-step.js';
import { exportCADJson } from '../stages/stage7-export-json.js';
import { runRSVS } from '../rsvs/rsvs-suite.js';
import { alignMeshForCadViewer } from '../utils/math3d.js';
import { PipelineContext } from './pipeline-context.js';
import { WorkerAbortMonitor } from './worker-abort-monitor.js';
import { StageProgressEmitter, yieldToEventLoop, ProgressCallback } from './stage-runner.js';
import * as path from 'path';
import * as fs from 'fs';

export { ProgressCallback };

/**
 * Executes the complete 7-stage reverse-engineering pipeline on a single model.
 */
export async function processPipelineTask(
  payload: PipelineTaskPayload,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const ctx = new PipelineContext(payload);
  const monitor = new WorkerAbortMonitor(payload.taskId, (payload as any).sharedAbortBuffer);
  const progressEmitter = new StageProgressEmitter(payload, ctx.startTime, onProgress);
  const emit = progressEmitter.emit.bind(progressEmitter);
  const outDir = payload.options.outDir;
  const baseName = ctx.baseName;

  try {
    // -------------------------------------------------------------------------
    // Stage 1: Read & Index STL Mesh
    // -------------------------------------------------------------------------
    monitor.checkAbort('1_READ_INTAKE');
    emit(1, '1_READ_INTAKE', 10);
    ctx.rawMesh = await readSTL(payload.rawBuffer || payload.filePath);
    const trianglesIn = ctx.rawMesh.triangleCount;

    // Automatic CAD Viewer coordinate frame alignment (Z-up STL -> Y-up CAD):
    if (payload.options.alignCadViewer === true) {
      alignMeshForCadViewer(ctx.rawMesh);
    }
    await yieldToEventLoop(monitor, '1_READ_INTAKE');

    // -------------------------------------------------------------------------
    // Stage 2: QEM Decimation (if oversized > 800,000 triangles)
    // -------------------------------------------------------------------------
    monitor.checkAbort('2_QEM_DECIMATE');
    emit(2, '2_QEM_DECIMATE', 25);
    ctx.decimatedMesh = ctx.rawMesh;
    if (payload.options.decimate !== false && ctx.rawMesh!.triangleCount > (payload.options.maxTrianglesThreshold ?? 35000)) {
      ctx.decimatedMesh = decimateMesh(ctx.rawMesh!, {
        maxTrianglesThreshold: payload.options.maxTrianglesThreshold ?? 35000,
        featureAngleDeg: 15,
        curvatureAngleDeg: 15,
        fineFeatureAngleDeg: 15.0,
        coplanarAngleDeg: 2.0
      });
    }
    await yieldToEventLoop(monitor, '2_QEM_DECIMATE');

    // -------------------------------------------------------------------------
    // Stage 3: Topology Sanitization & Cavity Shell Decomposition
    // -------------------------------------------------------------------------
    monitor.checkAbort('3_TOPOLOGY_SANITIZE');
    emit(3, '3_TOPOLOGY_SANITIZE', 40);
    ctx.sanitizeReport = sanitizeTopology(ctx.decimatedMesh!);

    // Explicitly unlink intermediate large buffers for V8 GC reclamation
    ctx.rawMesh = null;
    ctx.decimatedMesh = null;
    await yieldToEventLoop(monitor, '3_TOPOLOGY_SANITIZE');

    // -------------------------------------------------------------------------
    // Stage 4: Curvature Tensor & Localized Octree RANSAC
    // Stage 5: Engineering Feature Profiling (Holes, Threads, Cavities, Clearances)
    // -------------------------------------------------------------------------
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
    } catch (segmentErr: any) {
      // Graceful Degradation: If RANSAC or profiling fails on non-manifold/pathological geometry,
      // fallback to guaranteed faceted solid B-Rep export without dropping the task.
      ctx.isFacetedFallback = true;
      ctx.surfaces = [];
      ctx.profiling = { holes: [], threads: [], cavities: [], kinematicClearances: [] };
      emit(4, '4_SURFACE_SEGMENT', 100);
      emit(5, '5_PROFILE_FEATURES', 100);
    }

    // -------------------------------------------------------------------------
    // Stage 6: STEP AP242 B-Rep Solid Synthesis
    // -------------------------------------------------------------------------
    monitor.checkAbort('6_BREP_STEP_SYNTH');
    emit(6, '6_BREP_STEP_SYNTH', 88);
    let stepFilePath: string | undefined;
    if (!payload.options.jsonOnly) {
      ctx.stepResult = await exportBRepStep(
        ctx.sanitizeReport.cleanedMesh,
        ctx.surfaces,
        ctx.profiling.threads,
        outDir,
        baseName,
        ctx.sanitizeReport.shells,
        undefined,
        ctx.profiling.kinematicJoints
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

    if (!payload.options.stepOnly) {
      ctx.jsonResult = await exportCADJson(
        ctx.sanitizeReport.cleanedMesh,
        ctx.surfaces,
        ctx.sanitizeReport.shells,
        ctx.profiling,
        outDir,
        baseName,
        ctx.stepResult?.bRepSynthesis
      );
      jsonSummaryPath = ctx.jsonResult.summaryPath;
      jsonTopologyPath = ctx.jsonResult.topologyPath;
      summaryData = ctx.jsonResult.summaryData;
      if (ctx.isFacetedFallback && summaryData) {
        summaryData.conversion_mode = 'FACETED_SOLID_FALLBACK';
      }
    }

    if (payload.options.verify && !ctx.isFacetedFallback) {
      ctx.rsvsResult = await runRSVS(
        ctx.sanitizeReport.cleanedMesh,
        ctx.surfaces,
        ctx.sanitizeReport.shells,
        ctx.profiling,
        {
          outputDir: outDir,
          baseFileName: baseName,
          isClosedSolid: ctx.sanitizeReport.isWatertight,
          openEdgesCount: ctx.sanitizeReport.openEdgesCount,
          degenerateCount: ctx.sanitizeReport.degenerateTrianglesRemoved,
          eulerCharacteristic: ctx.sanitizeReport.eulerCharacteristic,
          heatmapMode: payload.options.heatmapMode
        }
      );
    }

    emit(7, '7_EXPORT_JSON_VERIFY', 100);

    return {
      taskId: payload.taskId,
      filePath: payload.filePath,
      success: true,
      stepFilePath,
      jsonSummaryPath,
      jsonTopologyPath,
      summaryData,
      verificationReport: ctx.rsvsResult,
      elapsedMs: ctx.elapsedMs,
      trianglesIn,
      trianglesProcessed: ctx.sanitizeReport.cleanedMesh.triangleCount,
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

export type CadTaskType = 'ANALYZE' | 'DETECT_THREADS' | 'VERIFY_RSVS' | 'CONVERT_STEP';

export interface CadWorkerTaskPayload {
  taskType: CadTaskType;
  filePath: string;
  outDir?: string;
  baseName?: string;
  threshold?: number;
  options?: {
    alignCadViewer?: boolean;
    [key: string]: any;
  };
}

/**
 * Executes granular CAD tasks inside worker thread with zero heap retention.
 */
export async function runCadMcpTask(payload: CadWorkerTaskPayload): Promise<any> {
  const threshold = payload.threshold || 800000;
  const outDir = payload.outDir || './output';
  const baseName = payload.baseName || path.basename(payload.filePath, path.extname(payload.filePath));

  try {
    switch (payload.taskType) {
      case 'ANALYZE': {
        const raw = await readSTL(payload.filePath);
        const decimated = decimateMesh(raw, { maxTrianglesThreshold: threshold });
        const sanitized = sanitizeTopology(decimated);

        const totalVol = sanitized.shells.reduce((sum, s) => s.isCavity ? sum : sum + s.signedVolume, 0);
        const totalArea = sanitized.shells.reduce((sum, s) => sum + s.surfaceArea, 0);

        return {
          filePath: payload.filePath,
          triangleCount: raw.triangleCount,
          decimatedCount: decimated.triangleCount,
          isWatertight: sanitized.isWatertight,
          openEdgesCount: sanitized.openEdgesCount,
          eulerCharacteristic: sanitized.eulerCharacteristic,
          boundingBoxMm: sanitized.cleanedMesh.boundingBox.dimensions,
          shellsCount: sanitized.shells.length,
          totalVolumeMm3: totalVol,
          totalSurfaceAreaMm2: totalArea
        };
      }

      case 'DETECT_THREADS': {
        const raw = await readSTL(payload.filePath);
        const decimated = decimateMesh(raw, { maxTrianglesThreshold: threshold });
        const sanitized = sanitizeTopology(decimated);
        const surfaces = segmentSurfaces(sanitized.cleanedMesh);
        const profiling = profileFeatures(sanitized.cleanedMesh, surfaces, sanitized.shells);

        return {
          filePath: payload.filePath,
          threadsDetected: profiling.threads.length,
          threads: profiling.threads.map(t => ({
            designation: t.designation,
            isInternal: t.isInternal,
            pitchMm: t.pitch,
            nominalDiameterMm: t.nominalDiameter,
            tapDrillDiameterMm: t.tapDrillDiameter
          }))
        };
      }

      case 'VERIFY_RSVS': {
        const raw = await readSTL(payload.filePath);
        const decimated = decimateMesh(raw, { maxTrianglesThreshold: threshold });
        const sanitized = sanitizeTopology(decimated);
        const surfaces = segmentSurfaces(sanitized.cleanedMesh);
        const profiling = profileFeatures(sanitized.cleanedMesh, surfaces, sanitized.shells);

        const rsvs = await runRSVS(
          sanitized.cleanedMesh,
          surfaces,
          sanitized.shells,
          profiling,
          {
            outputDir: outDir,
            baseFileName: baseName,
            isClosedSolid: sanitized.isWatertight,
            openEdgesCount: sanitized.openEdgesCount,
            degenerateCount: sanitized.degenerateTrianglesRemoved,
            eulerCharacteristic: sanitized.eulerCharacteristic,
            heatmapMode: 'none'
          }
        );

        return {
          filePath: payload.filePath,
          overallStatus: rsvs.overallStatus,
          summary: rsvs.summary,
          gates: rsvs.gates
        };
      }

      case 'CONVERT_STEP': {
        await fs.promises.mkdir(outDir, { recursive: true });
        const raw = await readSTL(payload.filePath);
        if (payload.options?.alignCadViewer === true) {
          alignMeshForCadViewer(raw);
        }
        const decimated = decimateMesh(raw, { maxTrianglesThreshold: threshold });
        const sanitized = sanitizeTopology(decimated);
        const surfaces = segmentSurfaces(sanitized.cleanedMesh);
        const profiling = profileFeatures(sanitized.cleanedMesh, surfaces, sanitized.shells);

        const stepRes = await exportBRepStep(
          sanitized.cleanedMesh,
          surfaces,
          profiling.threads,
          outDir,
          baseName,
          sanitized.shells,
          undefined,
          profiling.kinematicJoints
        );
        const jsonRes = await exportCADJson(
          sanitized.cleanedMesh,
          surfaces,
          sanitized.shells,
          profiling,
          outDir,
          baseName,
          stepRes.bRepSynthesis
        );

        return {
          success: true,
          stepFilePath: stepRes.stepFilePath,
          stepFileSizeBytes: stepRes.fileSizeBytes,
          summaryJsonPath: jsonRes.summaryPath,
          topologyJsonPath: jsonRes.topologyPath,
          holesFound: profiling.holes.length,
          threadsFound: profiling.threads.length,
          summaryData: jsonRes.summaryData
        };
      }

      default:
        throw new Error(`Unknown MCP worker task type: ${(payload as any).taskType}`);
    }
  } finally {
    if (typeof (global as any).gc === 'function') {
      try { (global as any).gc(); } catch {}
    }
  }
}

// Handler for Piscina worker thread (handles both full pipeline tasks and MCP tool tasks)
export default async function workerEntry(payload: PipelineTaskPayload | CadWorkerTaskPayload): Promise<any> {
  if ('taskType' in payload && payload.taskType) {
    return runCadMcpTask(payload as CadWorkerTaskPayload);
  }
  return processPipelineTask(payload as PipelineTaskPayload);
}
