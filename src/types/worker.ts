// ==============================================================================
// src/types/worker.ts — Multi-threaded Worker IPC & Transferable Types
// ==============================================================================

import { VerificationReport } from './verification.js';
import { CADFeaturesSummary } from './features.js';

export type HeatmapMode = 'failed-only' | 'always' | 'none';
export type QualityPreset = 'high' | 'fast';

export interface EmitTargets {
  step: boolean;
  summary: boolean;
  topology: boolean;
  report: boolean;
  heatmap: boolean;
}

export interface PipelineOptions {
  threads: number;
  quality: QualityPreset;
  outDir: string;
  verify: boolean;
  jsonOnly: boolean;
  stepOnly: boolean;
  heatmapMode: HeatmapMode;
  verbose: boolean;
  inferTapDrillThreads?: boolean;
  alignCadViewer?: boolean;
  decimate?: boolean;
  maxTrianglesThreshold?: number;
  representationMode?: 'brep' | 'tessellated' | 'auto';
  threadMode?: 'physical' | 'semantic' | 'auto';
  material?: string;
  emitTargets?: EmitTargets;
}

export interface PipelineTaskPayload {
  taskId: string;
  filePath: string;
  rawBuffer?: ArrayBuffer; // Transferred without copy
  fileSizeBytes: number;
  options: PipelineOptions;
  progressPort?: any; // MessagePort for real-time progress events across worker threads
  sharedAbortBuffer?: SharedArrayBuffer; // Cooperative atomic cancellation flag
}

export type CadTaskType = 'ANALYZE' | 'DETECT_THREADS' | 'VERIFY_RSVS' | 'CONVERT_STEP';

export interface CadWorkerTaskPayload {
  taskType: CadTaskType;
  filePath: string;
  taskId?: string;
  sharedAbortBuffer?: SharedArrayBuffer;
  outDir?: string;
  baseName?: string;
  threshold?: number;
  progressPort?: any;
  options?: {
    alignCadViewer?: boolean;
    [key: string]: any;
  };
}

export type PipelineStage =
  | '1_READ_INTAKE'
  | '2_QEM_DECIMATE'
  | '3_TOPOLOGY_SANITIZE'
  | '4_SURFACE_SEGMENT'
  | '5_PROFILE_FEATURES'
  | '6_BREP_STEP_SYNTH'
  | '7_EXPORT_JSON_VERIFY';

export interface ProgressUpdate {
  type: 'PROGRESS';
  taskId: string;
  filePath: string;
  stage: PipelineStage;
  stageNumber: number; // 1 to 7
  totalStages: number; // 7
  percent: number;     // 0 to 100
  itemsProcessed?: number;
  totalItems?: number;
  speedPolyPerSec?: number;
  elapsedMs: number;
}

export interface WorkerLog {
  type: 'LOG';
  taskId: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface PipelineResult {
  taskId: string;
  filePath: string;
  success: boolean;
  stepFilePath?: string;
  jsonSummaryPath?: string;
  jsonTopologyPath?: string;
  summaryData?: CADFeaturesSummary;
  verificationReport?: VerificationReport;
  error?: string;
  elapsedMs: number;
  trianglesIn: number;
  trianglesProcessed: number;
  surfacesExtracted: number;
}
