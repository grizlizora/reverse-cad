// ==============================================================================
// src/orchestrator/worker-pool-loop.ts — Concurrent Worker Loop Orchestrator
// Coordinates worker slots, DWRR task distribution, and memory-aware throttling.
// ==============================================================================

import { Piscina } from 'piscina';
import { PipelineResult } from '../types/worker.js';
import { WorkerStreamAggregator } from './worker-stream-aggregator.js';
import { executeSingleTask } from './worker-task-executor.js';
import { WorkerPoolContext } from './worker-pool-types.js';

/**
 * Runs the concurrent worker pool executing tasks from the DWRR scheduler.
 */
export async function runWorkerPoolLoops(
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
