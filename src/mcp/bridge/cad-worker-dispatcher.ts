// ==============================================================================
// src/mcp/bridge/cad-worker-dispatcher.ts — Backward Compatible Facade -> McpCadExecutor
// ==============================================================================

import { McpCadExecutor, CadLogFunction } from './mcp-executor.js';

export { CadLogFunction };

/**
 * Backward-compatible wrapper delegating directly to the modular McpCadExecutor.
 */
export class CadWorkerDispatcher {
  public static async analyzeMesh(filePath: string, threshold: number, log: CadLogFunction): Promise<any> {
    return McpCadExecutor.analyzeMesh(filePath, threshold, log);
  }

  public static async detectThreads(filePath: string, threshold: number, log: CadLogFunction): Promise<any> {
    return McpCadExecutor.detectThreads(filePath, threshold, log);
  }

  public static async verifyRsvs(filePath: string, outDir: string, baseName: string, threshold: number, log: CadLogFunction): Promise<any> {
    return McpCadExecutor.verifyRsvs(filePath, outDir, baseName, threshold, log);
  }

  public static async convertToStep(filePath: string, outDir: string, baseName: string, threshold: number, log: CadLogFunction): Promise<any> {
    return McpCadExecutor.convertToStep(filePath, outDir, baseName, threshold, log);
  }
}
