// ==============================================================================
// src/mcp/bridge/cad-worker-dispatcher.ts — Non-blocking CAD Execution Engine
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { McpWorkerBridge } from '../worker-bridge.js';
import { CadWorkerTaskPayload } from '../../worker/pipeline-worker.js';
import { MemoryCircuitBreaker, calculateWatchdogTimeout, executeWithWatchdog } from '../../orchestrator/watchdog-guard.js';

export type CadLogFunction = (...msg: any[]) => void;

const memoryBreaker = new MemoryCircuitBreaker(4096);
const bridge = McpWorkerBridge.getInstance();

async function dispatchWithProtection(
  payload: CadWorkerTaskPayload,
  log: CadLogFunction
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
      return await bridge.dispatchTask(payload, abortSignal);
    }, timeoutMs, taskName);

    memoryBreaker.reportSuccess();
    return result;
  } catch (err: any) {
    log(`[ERROR] Task ${taskName} failed: ${err?.message || String(err)}`);
    throw err;
  }
}

/**
 * Dispatches heavy CAD operations into background worker threads while keeping
 * the MCP server Event Loop 100% responsive for Stdio Ping (< 0.02 ms).
 */
export class CadWorkerDispatcher {
  /**
   * Analyzes STL mesh geometry, topology, and physical volume/area in background worker.
   */
  public static async analyzeMesh(
    filePath: string,
    threshold: number,
    log: CadLogFunction
  ): Promise<any> {
    log(`Analyzing mesh ${filePath}...`);
    return await dispatchWithProtection({
      taskType: 'ANALYZE',
      filePath,
      threshold
    }, log);
  }

  /**
   * Scans mesh for ISO/DIN standardized threads in background worker.
   */
  public static async detectThreads(
    filePath: string,
    threshold: number,
    log: CadLogFunction
  ): Promise<any> {
    log(`Scanning threads for ${filePath}...`);
    return await dispatchWithProtection({
      taskType: 'DETECT_THREADS',
      filePath,
      threshold
    }, log);
  }

  /**
   * Executes procedural RSVS verification gates in background worker.
   */
  public static async verifyRsvs(
    filePath: string,
    outDir: string,
    baseName: string,
    threshold: number,
    log: CadLogFunction
  ): Promise<any> {
    log(`Running RSVS validation on ${filePath}...`);
    return await dispatchWithProtection({
      taskType: 'VERIFY_RSVS',
      filePath,
      outDir,
      baseName,
      threshold
    }, log);
  }

  /**
   * Converts mesh to STEP AP242 B-Rep and structured JSON in background worker.
   */
  public static async convertToStep(
    filePath: string,
    outDir: string,
    baseName: string,
    threshold: number,
    log: CadLogFunction
  ): Promise<any> {
    log(`Converting ${filePath} to STEP AP242 and JSON...`);
    return await dispatchWithProtection({
      taskType: 'CONVERT_STEP',
      filePath,
      outDir,
      baseName,
      threshold
    }, log);
  }
}
