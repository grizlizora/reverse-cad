// ==============================================================================
// src/worker/mcp-task-runner.ts — MCP Task Runner with Cooperative Abort & Zero STW
// ==============================================================================

import * as fs from 'fs';
import { CadWorkerTaskPayload, CadTaskType, PipelineTaskPayload } from '../types/worker.js';
import { runRSVS } from '../rsvs/rsvs-suite.js';
import { PipelineContext } from './pipeline-context.js';
import { WorkerAbortMonitor } from './worker-abort-monitor.js';
import { executePipelineStages } from './pipeline-executor.js';

export type { CadWorkerTaskPayload, CadTaskType };

/**
 * Executes granular CAD tasks inside worker thread using the shared parameterized
 * `executePipelineStages` (`stopAfterStage`) with cooperative abort and `ctx.dispose()`.
 * Zero stage-invocation duplication and zero Stop-The-World `global.gc()` pauses.
 */
export async function runCadMcpTask(payload: CadWorkerTaskPayload): Promise<any> {
  const threshold = payload.threshold || 800000;
  const outDir = payload.outDir || './output';
  const taskId = payload.taskId || 'mcp-task';

  const pipelinePayload: PipelineTaskPayload = {
    taskId,
    filePath: payload.filePath,
    fileSizeBytes: 0,
    sharedAbortBuffer: payload.sharedAbortBuffer,
    progressPort: payload.progressPort,
    options: {
      threads: 1,
      quality: 'high',
      outDir,
      verify: payload.taskType === 'VERIFY_RSVS',
      jsonOnly: false,
      stepOnly: false,
      heatmapMode: 'none',
      verbose: false,
      maxTrianglesThreshold: threshold,
      alignCadViewer: payload.options?.alignCadViewer,
      inferTapDrillThreads: payload.options?.inferTapDrillThreads,
      representationMode: payload.options?.representationMode,
      threadMode: payload.options?.threadMode,
      material: payload.options?.material
    }
  };

  const ctx = new PipelineContext(pipelinePayload);
  const baseName = payload.baseName || ctx.baseName;
  const monitor = new WorkerAbortMonitor(taskId, payload.sharedAbortBuffer);

  try {
    switch (payload.taskType) {
      case 'ANALYZE': {
        const execRes = await executePipelineStages(ctx, pipelinePayload, monitor, {
          stopAfterStage: 3
        });
        const sanitized = ctx.sanitizeReport!;
        const decimatedCount = ctx.decimatedMesh
          ? ctx.decimatedMesh.triangleCount
          : sanitized.cleanedMesh.triangleCount;

        const totalVol = sanitized.shells.reduce((sum, s) => s.isCavity ? sum : sum + s.signedVolume, 0);
        const totalArea = sanitized.shells.reduce((sum, s) => sum + s.surfaceArea, 0);

        return {
          filePath: payload.filePath,
          triangleCount: execRes.trianglesIn,
          decimatedCount,
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
        await executePipelineStages(ctx, pipelinePayload, monitor, {
          stopAfterStage: 5
        });
        const profiling = ctx.profiling!;

        return {
          filePath: payload.filePath,
          threadsDetected: profiling.threads.length,
          threads: profiling.threads.map((t: any) => ({
            designation: t.designation,
            isInternal: t.isInternal,
            pitchMm: t.pitch,
            nominalDiameterMm: t.nominalDiameter,
            tapDrillDiameterMm: t.tapDrillDiameter
          }))
        };
      }

      case 'VERIFY_RSVS': {
        await fs.promises.mkdir(outDir, { recursive: true });
        const execRes = await executePipelineStages(ctx, pipelinePayload, monitor, {
          stopAfterStage: 5
        });
        const sanitized = ctx.sanitizeReport!;
        const surfaces = ctx.surfaces;
        const profiling = ctx.profiling!;

        monitor.checkAbort('7_EXPORT_JSON_VERIFY');
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
            heatmapMode: 'none',
            rawMesh: execRes.rawGroundTruthMesh ?? ctx.rawMesh ?? undefined,
            rawMassProps: execRes.rawMassProps
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
        const execRes = await executePipelineStages(ctx, pipelinePayload, monitor, {
          stopAfterStage: 7,
          overrideBaseName: baseName
        });
        const profiling = ctx.profiling!;

        return {
          success: true,
          stepFilePath: execRes.stepFilePath,
          stepFileSizeBytes: ctx.stepResult?.fileSizeBytes ?? 0,
          summaryJsonPath: execRes.jsonSummaryPath,
          topologyJsonPath: execRes.jsonTopologyPath,
          holesFound: profiling.holes.length,
          threadsFound: profiling.threads.length,
          summaryData: execRes.summaryData
        };
      }

      default:
        throw new Error(`Unknown MCP worker task type: ${(payload as any).taskType}`);
    }
  } finally {
    ctx.dispose();
  }
}
