// ==============================================================================
// src/mcp/worker/mcp-pool.ts — Robust Piscina Worker Pool Resolver for MCP
// ==============================================================================

import { Piscina } from 'piscina';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves the pipeline-worker script across environments (development TypeScript,
 * bundled distribution, or production runtime).
 */
export function resolvePipelineWorkerPath(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));

  // Candidate locations relative to mcp/worker
  const candidates = [
    // Production dist path relative to mcp/worker: ../../worker/pipeline-worker.js
    path.resolve(currentDir, '../../worker/pipeline-worker.js'),
    // Sibling in dist/worker:
    path.resolve(currentDir, '../worker/pipeline-worker.js'),
    // TypeScript source path if running via tsx/ts-node:
    path.resolve(currentDir, '../../worker/pipeline-worker.ts'),
    // Root project relative paths:
    path.resolve(process.cwd(), 'dist/worker/pipeline-worker.js'),
    path.resolve(process.cwd(), 'src/worker/pipeline-worker.ts')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Fallback default
  return path.resolve(currentDir, '../../worker/pipeline-worker.js');
}

export interface McpPoolConfig {
  maxThreads?: number;
  minThreads?: number;
  heapPerWorkerMb?: number;
}

/**
 * Singleton Piscina thread pool manager dedicated to MCP tool execution.
 */
export class McpWorkerPool {
  private static instance: McpWorkerPool | null = null;
  private pool: Piscina | null = null;
  private readonly config: McpPoolConfig;

  private constructor(config: McpPoolConfig = {}) {
    this.config = {
      maxThreads: 2,
      minThreads: 1,
      heapPerWorkerMb: 4096,
      ...config
    };
    this.initialize();
  }

  public static getInstance(config?: McpPoolConfig): McpWorkerPool {
    if (!McpWorkerPool.instance) {
      McpWorkerPool.instance = new McpWorkerPool(config);
    }
    return McpWorkerPool.instance;
  }

  private initialize(): void {
    try {
      const scriptPath = resolvePipelineWorkerPath();
      if (fs.existsSync(scriptPath)) {
        this.pool = new Piscina({
          filename: scriptPath,
          maxThreads: this.config.maxThreads ?? 2,
          minThreads: this.config.minThreads ?? 1,
          resourceLimits: {
            maxOldGenerationSizeMb: this.config.heapPerWorkerMb ?? 4096
          }
        });
      }
    } catch {
      this.pool = null;
    }
  }

  public getPool(): Piscina | null {
    return this.pool;
  }

  public async runTask(payload: any, abortSignal?: AbortSignal): Promise<any> {
    if (this.pool) {
      return await this.pool.run(payload, { signal: abortSignal });
    }

    // In-process fallback with event-loop yield
    await new Promise(resolve => setImmediate(resolve));
    const { runCadMcpTask } = await import('../../worker/pipeline-worker.js');
    return await runCadMcpTask(payload);
  }

  public async destroy(): Promise<void> {
    if (this.pool) {
      await this.pool.destroy();
      this.pool = null;
    }
    McpWorkerPool.instance = null;
  }
}
