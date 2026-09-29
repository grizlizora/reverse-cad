// ==============================================================================
// src/orchestrator/worker-pool-manager.ts — Thread Pool & Worker Loop Manager Façade
// ==============================================================================

import { Piscina } from 'piscina';
import * as fs from 'fs';
import { resolvePipelineWorkerPath } from '../mcp/worker/mcp-pool.js';
import { PipelineResult } from '../types/worker.js';
import { WorkerPoolContext } from './worker-pool-types.js';
import { runWorkerPoolLoops } from './worker-pool-loop.js';

export type { WorkerPoolContext };

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
 * Runs the concurrent worker pool executing tasks from the DWRR scheduler.
 */
export async function executeWorkerPool(
  ctx: WorkerPoolContext,
  pool: Piscina | null
): Promise<PipelineResult[]> {
  return runWorkerPoolLoops(ctx, pool);
}
