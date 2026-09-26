// ==============================================================================
// src/orchestrator/manifest-sink.ts — Streaming NDJSON Manifest Sink
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { PipelineResult } from '../types/worker.js';

export class ManifestSink {
  private stream: fs.WriteStream;
  public readonly manifestPath: string;

  constructor(outDir: string) {
    this.manifestPath = path.join(outDir, 'conversion_manifest.ndjson');
    this.stream = fs.createWriteStream(this.manifestPath, { flags: 'a', encoding: 'utf8' });
  }

  public async recordResult(result: PipelineResult): Promise<void> {
    const logLine = JSON.stringify({
      filePath: result.filePath,
      success: result.success,
      elapsedMs: result.elapsedMs,
      triangles: result.trianglesProcessed,
      stepPath: result.stepFilePath,
      error: result.error,
      timestamp: new Date().toISOString()
    }) + '\n';

    if (!this.stream.write(logLine)) {
      await new Promise<void>(res => this.stream.once('drain', () => res()));
    }
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.stream.end(resolve);
      this.stream.once('error', reject);
    });
  }
}
