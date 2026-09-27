// ==============================================================================
// src/worker/pipeline-worker.ts — Worker Processor Executing Stages 1 to 7 + RSVS
// ==============================================================================

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
import * as path from 'path';
import * as fs from 'fs';

export type ProgressCallback = (update: ProgressUpdate) => void;

/**
 * Executes the complete 7-stage reverse-engineering pipeline on a single model.
 */
export async function processPipelineTask(
  payload: PipelineTaskPayload,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  const startTime = Date.now();
  const baseName = path.basename(payload.filePath, path.extname(payload.filePath));
  const outDir = payload.options.outDir;

  const emit = (stageNumber: number, stage: ProgressUpdate['stage'], percent: number) => {
    const update: ProgressUpdate = {
      type: 'PROGRESS',
      taskId: payload.taskId,
      filePath: payload.filePath,
      stage,
      stageNumber,
      totalStages: 7,
      percent,
      elapsedMs: Date.now() - startTime
    };

    if (payload.progressPort && typeof payload.progressPort.postMessage === 'function') {
      try {
        payload.progressPort.postMessage(update);
      } catch {
        // Port may be closed
      }
    }

    if (onProgress) {
      onProgress(update);
    }
  };

  try {
    // -------------------------------------------------------------------------
    // Stage 1: Read & Index STL Mesh
    // -------------------------------------------------------------------------
    emit(1, '1_READ_INTAKE', 10);
    let rawMesh: any = await readSTL(payload.rawBuffer || payload.filePath);
    const trianglesIn = rawMesh.triangleCount;

    // Automatic CAD Viewer coordinate frame alignment (Z-up STL -> Y-up CAD):
    // Maps STL Top (+Z) -> CAD Top (+Y), STL Front (-Y) -> CAD Front (+Z)
    // Ensures all 6 orthogonal views (Top/Bottom/Front/Back/Left/Right) match 1:1
    // with original STL in Autodesk Viewer & CAD systems without manual reorientation.
    if (payload.options.alignCadViewer === true) {
      alignMeshForCadViewer(rawMesh);
    }

    // -------------------------------------------------------------------------
    // Stage 2: QEM Decimation (if oversized > 800,000 triangles)
    // -------------------------------------------------------------------------
    emit(2, '2_QEM_DECIMATE', 25);
    let decimatedMesh: any = rawMesh;
    if (payload.options.decimate !== false && rawMesh.triangleCount > (payload.options.maxTrianglesThreshold ?? 800000)) {
      decimatedMesh = decimateMesh(rawMesh, {
        maxTrianglesThreshold: payload.options.maxTrianglesThreshold ?? 800000,
        featureAngleDeg: 8,
        curvatureAngleDeg: 10,
        coplanarAngleDeg: 0.5
      });
    }

    // -------------------------------------------------------------------------
    // Stage 3: Topology Sanitization & Cavity Shell Decomposition
    // -------------------------------------------------------------------------
    emit(3, '3_TOPOLOGY_SANITIZE', 40);
    const sanitizeReport = sanitizeTopology(decimatedMesh);

    // Explicitly unlink intermediate large buffers for V8 GC reclamation
    rawMesh = null;
    decimatedMesh = null;

    // -------------------------------------------------------------------------
    // Stage 4: Curvature Tensor & Localized Octree RANSAC
    // Stage 5: Engineering Feature Profiling (Holes, Threads, Cavities, Clearances)
    // -------------------------------------------------------------------------
    let surfaces: any[] = [];
    let profiling: any = { holes: [], threads: [], cavities: [], kinematicClearances: [] };
    let isFacetedFallback = false;

    try {
      emit(4, '4_SURFACE_SEGMENT', 60);
      surfaces = segmentSurfaces(sanitizeReport.cleanedMesh);

      emit(5, '5_PROFILE_FEATURES', 75);
      profiling = profileFeatures(sanitizeReport.cleanedMesh, surfaces, sanitizeReport.shells, {
        inferTapDrillThreads: payload.options.inferTapDrillThreads
      });
    } catch (segmentErr: any) {
      // Graceful Degradation: If RANSAC or profiling fails on non-manifold/pathological geometry,
      // fallback to guaranteed faceted solid B-Rep export without dropping the task.
      isFacetedFallback = true;
      surfaces = [];
      profiling = { holes: [], threads: [], cavities: [], kinematicClearances: [] };
      emit(4, '4_SURFACE_SEGMENT', 100);
      emit(5, '5_PROFILE_FEATURES', 100);
    }

    // -------------------------------------------------------------------------
    // Stage 6: STEP AP242 B-Rep Solid Synthesis
    // -------------------------------------------------------------------------
    emit(6, '6_BREP_STEP_SYNTH', 88);
    let stepRes: any;
    let stepFilePath: string | undefined;
    if (!payload.options.jsonOnly) {
      stepRes = await exportBRepStep(
        sanitizeReport.cleanedMesh,
        surfaces,
        profiling.threads,
        outDir,
        baseName,
        sanitizeReport.shells,
        undefined,
        profiling.kinematicJoints
      );
      stepFilePath = stepRes.stepFilePath;
    }

    // -------------------------------------------------------------------------
    // Stage 7: Two-Tier JSON Export & RSVS Quality Verification
    // -------------------------------------------------------------------------
    emit(7, '7_EXPORT_JSON_VERIFY', 95);
    let jsonSummaryPath: string | undefined;
    let jsonTopologyPath: string | undefined;
    let summaryData: any;

    if (!payload.options.stepOnly) {
      const jsonRes = await exportCADJson(
        sanitizeReport.cleanedMesh,
        surfaces,
        sanitizeReport.shells,
        profiling,
        outDir,
        baseName,
        stepRes?.bRepSynthesis
      );
      jsonSummaryPath = jsonRes.summaryPath;
      jsonTopologyPath = jsonRes.topologyPath;
      summaryData = jsonRes.summaryData;
      if (isFacetedFallback && summaryData) {
        summaryData.conversion_mode = 'FACETED_SOLID_FALLBACK';
      }
    }

    let verificationReport: any;
    if (payload.options.verify && !isFacetedFallback) {
      verificationReport = await runRSVS(
        sanitizeReport.cleanedMesh,
        surfaces,
        sanitizeReport.shells,
        profiling,
        {
          outputDir: outDir,
          baseFileName: baseName,
          isClosedSolid: sanitizeReport.isWatertight,
          openEdgesCount: sanitizeReport.openEdgesCount,
          degenerateCount: sanitizeReport.degenerateTrianglesRemoved,
          eulerCharacteristic: sanitizeReport.eulerCharacteristic,
          heatmapMode: payload.options.heatmapMode
        }
      );
    }

    emit(7, '7_EXPORT_JSON_VERIFY', 100);

    // Close transferred MessagePort inside worker thread to avoid handle leakage
    if (payload.progressPort && typeof payload.progressPort.close === 'function') {
      try { payload.progressPort.close(); } catch {}
    }

    // Adaptive V8 GC invocation: run only if heapUsed exceeds 300MB
    if (typeof (global as any).gc === 'function') {
      try {
        const mem = process.memoryUsage();
        if (mem.heapUsed > 300 * 1024 * 1024) {
          (global as any).gc();
        }
      } catch {}
    }

    return {
      taskId: payload.taskId,
      filePath: payload.filePath,
      success: true,
      stepFilePath,
      jsonSummaryPath,
      jsonTopologyPath,
      summaryData,
      verificationReport,
      elapsedMs: Date.now() - startTime,
      trianglesIn,
      trianglesProcessed: sanitizeReport.cleanedMesh.triangleCount,
      surfacesExtracted: surfaces.length
    };
  } catch (err: any) {
    if (payload.progressPort && typeof payload.progressPort.close === 'function') {
      try { payload.progressPort.close(); } catch {}
    }
    if (typeof (global as any).gc === 'function') {
      try {
        (global as any).gc();
      } catch {}
    }
    return {
      taskId: payload.taskId,
      filePath: payload.filePath,
      success: false,
      error: err?.stack || err?.message || String(err),
      elapsedMs: Date.now() - startTime,
      trianglesIn: 0,
      trianglesProcessed: 0,
      surfacesExtracted: 0
    };
  }
}

export type CadTaskType = 'ANALYZE' | 'DETECT_THREADS' | 'VERIFY_RSVS' | 'CONVERT_STEP';

export interface CadWorkerTaskPayload {
  taskType: CadTaskType;
  filePath: string;
  outDir?: string;
  baseName?: string;
  threshold?: number;
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
        alignMeshForCadViewer(raw);
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
