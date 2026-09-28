// ==============================================================================
// src/worker/stage-runner.ts — Stage Orchestration with Non-Blocking Event-Loop Yield
// ==============================================================================

import { PipelineTaskPayload, ProgressUpdate, PipelineStage } from '../types/worker.js';
import { WorkerAbortMonitor } from './worker-abort-monitor.js';

export type ProgressCallback = (update: ProgressUpdate) => void;

/**
 * Yields time slice to Node.js Event Loop allowing MessagePort flushes & I/O.
 */
export function yieldToEventLoop(monitor?: WorkerAbortMonitor, stageName?: string): Promise<void> {
  if (monitor) {
    monitor.checkAbort(stageName);
  }
  return new Promise(resolve => setImmediate(resolve));
}

export class StageProgressEmitter {
  constructor(
    private readonly payload: PipelineTaskPayload,
    private readonly startTime: number,
    private readonly onProgress?: ProgressCallback
  ) {}

  public emit(stageNumber: number, stage: PipelineStage, percent: number): void {
    const update: ProgressUpdate = {
      type: 'PROGRESS',
      taskId: this.payload.taskId,
      filePath: this.payload.filePath,
      stage,
      stageNumber,
      totalStages: 7,
      percent,
      elapsedMs: Date.now() - this.startTime
    };

    if (this.payload.progressPort && typeof this.payload.progressPort.postMessage === 'function') {
      try {
        this.payload.progressPort.postMessage(update);
      } catch {}
    }

    if (this.onProgress) {
      this.onProgress(update);
    }
  }
}
