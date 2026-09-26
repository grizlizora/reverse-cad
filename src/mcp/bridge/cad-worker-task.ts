// ==============================================================================
// src/mcp/bridge/cad-worker-task.ts — Isolated CAD Tool Execution Façade
// ==============================================================================

import { validateToolParams } from '../manifest/cad-tools-manifest.js';
import { CadWorkerDispatcher, CadLogFunction } from './cad-worker-dispatcher.js';

export const CAD_DECIMATION_THRESHOLD = 800000;

export { CadWorkerDispatcher };

/**
 * Executes a CAD tool invocation with 800k decimation threshold and safe memory handling.
 * Yields event loop microtasks and triggers garbage collection to prevent Event Loop stalls.
 */
export async function executeCadTask(
  name: string,
  args: any,
  log: CadLogFunction = (...msg) => process.stderr.write(`[CAD-MCP] ${msg.join(' ')}\n`)
): Promise<any> {
  const { filePath, outDir, baseName } = await validateToolParams(name, args);

  try {
    switch (name) {
      case 'cad_analyze_stl':
        return await CadWorkerDispatcher.analyzeMesh(filePath, CAD_DECIMATION_THRESHOLD, log);

      case 'cad_detect_threads':
        return await CadWorkerDispatcher.detectThreads(filePath, CAD_DECIMATION_THRESHOLD, log);

      case 'cad_verify_rsvs':
        return await CadWorkerDispatcher.verifyRsvs(filePath, outDir, baseName, CAD_DECIMATION_THRESHOLD, log);

      case 'cad_convert_to_step':
        return await CadWorkerDispatcher.convertToStep(filePath, outDir, baseName, CAD_DECIMATION_THRESHOLD, log);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } finally {
    if (typeof (global as any).gc === 'function') {
      try {
        (global as any).gc();
      } catch {
        // ignore gc failure
      }
    }
  }
}
