// ==============================================================================
// src/rsvs/leak-tracker.ts — ArrayBuffer & Handle Lifetime Auditor
// ==============================================================================

export interface MemoryAuditRecord {
  checkpoint: string;
  timestamp: number;
  heapUsedMb: number;
  arrayBuffersMb: number;
  rssMb: number;
  activeHandles: number;
}

/**
 * Audits memory persistence across pipeline batch conversions to catch unreleased
 * ArrayBuffers or lingering file descriptors.
 */
export class PipelineLeakTrackerCLI {
  private history: MemoryAuditRecord[] = [];

  public checkpoint(label: string): MemoryAuditRecord {
    const mem = process.memoryUsage();
    const handles = typeof (process as any)._getActiveHandles === 'function'
      ? (process as any)._getActiveHandles().length
      : 0;

    const record: MemoryAuditRecord = {
      checkpoint: label,
      timestamp: Date.now(),
      heapUsedMb: Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100,
      arrayBuffersMb: Math.round(((mem.arrayBuffers || 0) / (1024 * 1024)) * 100) / 100,
      rssMb: Math.round((mem.rss / (1024 * 1024)) * 100) / 100,
      activeHandles: handles
    };

    this.history.push(record);
    return record;
  }

  public getHistory(): MemoryAuditRecord[] {
    return [...this.history];
  }

  public detectLeak(): { hasLeak: boolean; warning?: string } {
    if (this.history.length < 3) return { hasLeak: false };

    const first = this.history[0];
    const last = this.history[this.history.length - 1];

    // If ArrayBuffers grew by > 500MB without reclamation
    const bufferGrowth = last.arrayBuffersMb - first.arrayBuffersMb;
    if (bufferGrowth > 500) {
      return {
        hasLeak: true,
        warning: `ArrayBuffer footprint expanded by +${bufferGrowth.toFixed(1)}MB across session.`
      };
    }

    return { hasLeak: false };
  }
}
