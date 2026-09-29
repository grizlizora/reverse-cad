// ==============================================================================
// src/mcp/bridge/mcp-executor.ts — Non-blocking MCP Task Executor with Watchdog Protection
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { McpWorkerPool } from '../worker/mcp-pool.js';
import { CadWorkerTaskPayload } from '../../worker/pipeline-worker.js';
import {
  MemoryCircuitBreaker,
  calculateWatchdogTimeout,
  executeWithWatchdog
} from '../../orchestrator/watchdog-guard.js';

export type CadLogFunction = (...msg: any[]) => void;

const memoryBreaker = new MemoryCircuitBreaker(4096);
const mcpPool = McpWorkerPool.getInstance();

export async function dispatchMcpTaskWithProtection(
  payload: CadWorkerTaskPayload,
  log: CadLogFunction = (...msg) => process.stderr.write(`[CAD-MCP] ${msg.join(' ')}\n`)
): Promise<any> {
  const health = memoryBreaker.checkSystemHealth();
  if (!health.canExecute) {
    throw new Error(`MCP System memory circuit breaker triggered: ${health.reason}`);
  }

  let fileSizeBytes = 1024 * 1024;
  try {
    const stat = fs.statSync(payload.filePath);
    fileSizeBytes = stat.size;
  } catch {}

  const timeoutMs = calculateWatchdogTimeout(fileSizeBytes);
  const taskName = `${payload.taskType}:${path.basename(payload.filePath)}`;

  try {
    const result = await executeWithWatchdog(async (abortSignal) => {
      const sharedAbortBuffer = payload.sharedAbortBuffer ?? new SharedArrayBuffer(4);
      const abortView = new Int32Array(sharedAbortBuffer);
      const onAbort = () => {
        Atomics.store(abortView, 0, 1);
      };
      if (abortSignal.aborted) {
        onAbort();
      } else {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
      return await mcpPool.runTask({ ...payload, sharedAbortBuffer }, abortSignal);
    }, timeoutMs, taskName);

    memoryBreaker.reportSuccess();
    return result;
  } catch (err: any) {
    log(`[ERROR] Task ${taskName} failed: ${err?.message || String(err)}`);
    throw err;
  }
}

/**
 * High-level CAD executor facade dispatching operations cleanly to background worker threads.
 */
export class McpCadExecutor {
  public static async analyzeMesh(
    filePath: string,
    threshold = 800000,
    log?: CadLogFunction
  ): Promise<any> {
    return await dispatchMcpTaskWithProtection({
      taskType: 'ANALYZE',
      filePath,
      threshold
    }, log);
  }

  public static async detectThreads(
    filePath: string,
    threshold = 800000,
    log?: CadLogFunction
  ): Promise<any> {
    return await dispatchMcpTaskWithProtection({
      taskType: 'DETECT_THREADS',
      filePath,
      threshold
    }, log);
  }

  public static async verifyRsvs(
    filePath: string,
    outDir: string,
    baseName: string,
    threshold = 800000,
    log?: CadLogFunction
  ): Promise<any> {
    return await dispatchMcpTaskWithProtection({
      taskType: 'VERIFY_RSVS',
      filePath,
      outDir,
      baseName,
      threshold
    }, log);
  }

  public static async convertToStep(
    filePath: string,
    outDir: string,
    baseName: string,
    threshold = 800000,
    log?: CadLogFunction
  ): Promise<any> {
    return await dispatchMcpTaskWithProtection({
      taskType: 'CONVERT_STEP',
      filePath,
      outDir,
      baseName,
      threshold
    }, log);
  }
}
