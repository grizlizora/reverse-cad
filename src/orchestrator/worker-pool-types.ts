// ==============================================================================
// src/orchestrator/worker-pool-types.ts — Thread Pool Types & Context Interface
// ==============================================================================

import { PipelineOptions } from '../types/worker.js';
import { TerminalRenderer } from '../tui/terminal-renderer.js';
import { DWRRMeshScheduler } from './dwrr-queue.js';
import { MemoryCircuitBreaker } from './watchdog-guard.js';
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
