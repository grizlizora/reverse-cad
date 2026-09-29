// ==============================================================================
// src/orchestrator/worker-task-executor.ts — Single Task Executor with Port Leak Protection
// Executes pipeline tasks under watchdog supervision with leak-proof MessageChannel cleanup.
// ==============================================================================

import { Piscina } from 'piscina';
import { MessageChannel } from 'worker_threads';
import * as path from 'path';
import { PipelineOptions, PipelineResult, PipelineTaskPayload, ProgressUpdate } from '../types/worker.js';
import { processPipelineTask } from '../worker/pipeline-worker.js';
import { TerminalRenderer } from '../tui/terminal-renderer.js';
import { MemoryCircuitBreaker, calculateWatchdogTimeout, executeWithWatchdog } from './watchdog-guard.js';

export async function executeSingleTask(
  slotId: number,
  task: { filePath: string; fileSizeBytes: number },
  options: PipelineOptions,
  pool: Piscina | null,
  renderer: TerminalRenderer | undefined,
  memoryBreaker: MemoryCircuitBreaker
): Promise<PipelineResult> {
  const timeoutMs = calculateWatchdogTimeout(task.fileSizeBytes);
  const channel = new MessageChannel();
  let port2Transferred = false;

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

  const sharedAbortBuffer = typeof SharedArrayBuffer !== 'undefined' ? new SharedArrayBuffer(4) : undefined;
  const payload: PipelineTaskPayload & { sharedAbortBuffer?: SharedArrayBuffer } = {
    taskId: `w_${slotId}_${Date.now()}`,
    filePath: task.filePath,
    fileSizeBytes: task.fileSizeBytes,
    options,
    progressPort: channel.port2,
    sharedAbortBuffer
  };

  try {
    const result = await executeWithWatchdog(async (abortSignal) => {
      if (sharedAbortBuffer) {
        const flag = new Int32Array(sharedAbortBuffer);
        abortSignal.addEventListener('abort', () => {
          Atomics.store(flag, 0, 1);
        }, { once: true });
      }
      if (pool) {
        const transferList: any[] = [channel.port2];
        if (payload.rawBuffer) {
          transferList.push(payload.rawBuffer);
        }
        port2Transferred = true;
        return await pool.run(payload, {
          transferList,
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
    try { channel.port1.removeAllListeners?.(); } catch {}
    try { channel.port1.close(); } catch {}
    // If port2 was not transferred to another thread, close it to prevent descriptor leak
    if (!port2Transferred) {
      try { channel.port2.close(); } catch {}
    }
  }
}
