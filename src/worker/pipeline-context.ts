// ==============================================================================
// src/worker/pipeline-context.ts — Deterministic Memory Management & Stage Context
// ==============================================================================

import { PipelineTaskPayload, PipelineOptions } from '../types/worker.js';
import { RawMesh, SurfacePrimitive } from '../types/geometry.js';
import { SanitizeReport } from '../stages/stage3-sanitize.js';
import * as path from 'path';

export class PipelineContext {
  public readonly taskId: string;
  public readonly filePath: string;
  public readonly baseName: string;
  public readonly options: PipelineOptions;
  public readonly startTime: number;

  public rawMesh: RawMesh | null = null;
  public decimatedMesh: RawMesh | null = null;
  public sanitizeReport: SanitizeReport | null = null;
  public surfaces: SurfacePrimitive[] = [];
  public profiling: any = null;
  public stepResult: any = null;
  public jsonResult: any = null;
  public rsvsResult: any = null;
  public isFacetedFallback: boolean = false;

  constructor(payload: PipelineTaskPayload) {
    this.taskId = payload.taskId;
    this.filePath = payload.filePath;
    this.options = payload.options;
    this.baseName = path.basename(payload.filePath, path.extname(payload.filePath));
    this.startTime = Date.now();
  }

  public get elapsedMs(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Cleans up all large buffers, freeing memory incrementally without triggering Stop-The-World full GC.
   */
  public dispose(): void {
    this.rawMesh = null;
    this.decimatedMesh = null;
    if (this.sanitizeReport) {
      (this.sanitizeReport as any).cleanedMesh = null;
      (this.sanitizeReport as any).shells = null;
      this.sanitizeReport = null;
    }
    this.surfaces = [];
    this.profiling = null;
  }
}
