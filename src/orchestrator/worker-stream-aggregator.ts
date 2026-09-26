// ==============================================================================
// src/orchestrator/worker-stream-aggregator.ts — O(1) Memory Streaming Aggregator
// ==============================================================================

import { EventEmitter } from 'events';
import { PipelineResult } from '../types/worker.js';
import { ManifestSink } from './manifest-sink.js';

export interface BatchSummary {
  totalProcessed: number;
  totalSuccess: number;
  totalErrors: number;
  totalTrianglesIn: number;
  totalTrianglesProcessed: number;
  totalSurfacesExtracted: number;
  elapsedMs: number;
}

/**
 * Aggregates pipeline worker results with O(1) memory footprint.
 * Immediately streams records to disk via ManifestSink without retaining large report blobs.
 */
export class WorkerStreamAggregator extends EventEmitter {
  private manifestSink: ManifestSink;
  private startTime: number;
  private totalProcessed = 0;
  private totalSuccess = 0;
  private totalErrors = 0;
  private totalTrianglesIn = 0;
  private totalTrianglesProcessed = 0;
  private totalSurfacesExtracted = 0;

  constructor(manifestSink: ManifestSink) {
    super();
    this.manifestSink = manifestSink;
    this.startTime = Date.now();
  }

  public async record(result: PipelineResult): Promise<void> {
    this.totalProcessed++;
    if (result.success) {
      this.totalSuccess++;
    } else {
      this.totalErrors++;
    }

    this.totalTrianglesIn += result.trianglesIn || 0;
    this.totalTrianglesProcessed += result.trianglesProcessed || 0;
    this.totalSurfacesExtracted += result.surfacesExtracted || 0;

    // Immediately persist to NDJSON manifest with backpressure handling
    await this.manifestSink.recordResult(result);

    this.emit('taskCompleted', result);
  }

  public getSummary(): BatchSummary {
    return {
      totalProcessed: this.totalProcessed,
      totalSuccess: this.totalSuccess,
      totalErrors: this.totalErrors,
      totalTrianglesIn: this.totalTrianglesIn,
      totalTrianglesProcessed: this.totalTrianglesProcessed,
      totalSurfacesExtracted: this.totalSurfacesExtracted,
      elapsedMs: Date.now() - this.startTime
    };
  }
}
