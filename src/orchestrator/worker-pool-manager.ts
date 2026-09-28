// ==============================================================================
// src/orchestrator/worker-pool-manager.ts — Thread Pool & Worker Loop Manager
// ==============================================================================

import { Piscina } from 'piscina';
import { MessageChannel } from 'worker_threads';
import * as fs from 'fs';
import * as path from 'path';
import { resolvePipelineWorkerPath } from '../mcp/worker/mcp-pool.js';
import { PipelineOptions, PipelineResult, PipelineTaskPayload, ProgressUpdate } from '../types/worker.js';
import { processPipelineTask } from '../worker/pipeline-worker.js';
import { TerminalRenderer } from '../tui/terminal-renderer.js';
import { DWRRMeshScheduler } from './dwrr-queue.js';
import { MemoryCircuitBreaker, calculateWatchdogTimeout, executeWithWatchdog } from './watchdog-guard.js';
import { ManifestSink } from './manifest-sink.js';
import { WorkerStreamAggregator } from './worker-stream-aggregator.js';

export interface WorkerPoolContext {
  baseConcurrency: number;
  totalFilesCount: number;
  heapPerWorkerMb: number;
  scheduler: DWRRMeshScheduler;
  options: PipelineOptions;
  renderer?: TerminalRenderer;
  manifestSink: ManifestSink;
  memoryBreaker: MemoryCircuitBreaker;
  aggregator?: WorkerStreamAggregator;
}

/**
 * Creates and initializes Piscina thread pool.
 */
export function initializeWorkerPool(baseConcurrency: number, heapPerWorkerMb: number): Piscina | null {
  try {
    const workerScriptPath = resolvePipelineWorkerPath();
    if (fs.existsSync(workerScriptPath)) {
      return new Piscina({
        filename: workerScriptPath,
        maxThreads: baseConcurrency,
        minThreads: Math.min(2, baseConcurrency),
        resourceLimits: {
          maxOldGenerationSizeMb: heapPerWorkerMb
        }
      });
    }
  } catch {
    // Graceful fallback to in-process worker
  }
  return null;
}

/**
 * Executes a single task with watchdog protection and channel communication.
 */
async function executeSingleTask(
  slotId: number,
  task: { filePath: string; fileSizeBytes: number },
  options: PipelineOptions,
  pool: Piscina | null,
  renderer: TerminalRenderer | undefined,
  memoryBreaker: MemoryCircuitBreaker
): Promise<PipelineResult> {
  const timeoutMs = calculateWatchdogTimeout(task.fileSizeBytes);
  const channel = new MessageChannel();

  if (renderer) {
    channel.port1.on('message', (update: ProgressUpdate) => {
      renderer.updateWorker(
        slotId,
        update.filePath,
        update.stageNumber,
        update.stage,
        update.percent
      );
    });
  }

  const payload: PipelineTaskPayload = {
    taskId: `w_${slotId}_${Date.now()}`,
    filePath: task.filePath,
    fileSizeBytes: task.fileSizeBytes,
    options,
    progressPort: channel.port2
  };

  try {
    const result = await executeWithWatchdog(async (abortSignal) => {
      if (pool) {
        return await pool.run(payload, {
          transferList: [channel.port2],
          signal: abortSignal
        });
      } else {
        return await processPipelineTask(payload, update => {
          if (renderer) {
            renderer.updateWorker(
              slotId,
              update.filePath,
              update.stageNumber,
              update.stage,
              update.percent
            );
          }
        });
      }
    }, timeoutMs, path.basename(task.filePath));

    memoryBreaker.reportSuccess();
    return result;
  } catch (err: any) {
    return {
      taskId: payload.taskId,
      filePath: task.filePath,
      success: false,
      error: err?.message || String(err),
      elapsedMs: 0,
      trianglesIn: 0,
      trianglesProcessed: 0,
      surfacesExtracted: 0
    };
  } finally {
    try { channel.port1.close(); } catch {}
    if (!pool) {
      try { channel.port2.close(); } catch {}
    }
  }
}

/**
 * Runs the concurrent worker pool executing tasks from the DWRR scheduler.
 */
export async function executeWorkerPool(
  ctx: WorkerPoolContext,
  pool: Piscina | null
): Promise<PipelineResult[]> {
  const {
    baseConcurrency,
    totalFilesCount,
    scheduler,
    options,
    renderer,
    manifestSink,
    memoryBreaker
  } = ctx;

  const aggregator = ctx.aggregator ?? new WorkerStreamAggregator(manifestSink);
  const results: PipelineResult[] = [];
  const workerSlots: Promise<void>[] = [];

  const runWorkerLoop = async (slotId: number) => {
    while (true) {
      if (scheduler.totalPending() === 0) break;

      const allowedConcurrency = memoryBreaker.getRecommendedConcurrencyThrottle(baseConcurrency);
      if (slotId >= allowedConcurrency) {
        await new Promise(res => setTimeout(res, 500));
        continue;
      }

      const health = memoryBreaker.checkSystemHealth();
      if (!health.canExecute) {
        await new Promise(res => setTimeout(res, health.backoffMs ?? 2000));
        continue;
      }

      const task = scheduler.selectNextTask();
      if (!task) {
        if (scheduler.totalPending() === 0) break;
        await new Promise(res => setTimeout(res, 50));
        continue;
      }

      try {
        const result = await executeSingleTask(slotId, task, options, pool, renderer, memoryBreaker);
        await aggregator.record(result);
        results.push(result);
        if (renderer) {
          renderer.fileCompleted(task.filePath, result.success, result.elapsedMs, result.stepFilePath);
        }
      } finally {
        scheduler.releaseTask(task);
      }
    }
  };

  const activeWorkerCount = Math.min(baseConcurrency, totalFilesCount);
  for (let s = 0; s < activeWorkerCount; s++) {
    workerSlots.push(runWorkerLoop(s));
  }

  await Promise.all(workerSlots);
  return results;
}
