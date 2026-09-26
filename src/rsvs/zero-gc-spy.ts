// ==============================================================================
// src/rsvs/zero-gc-spy.ts — V8 Heap Space & Allocation Auditor for Hot Loops
// ==============================================================================

import * as v8 from 'v8';

export interface ZeroGCSpySnapshot {
  timestamp: number;
  newSpaceUsedBytes: number;
  oldSpaceUsedBytes: number;
  heapUsedBytes: number;
  arrayBuffersBytes: number;
}

/**
 * Tracks V8 new_space and old_space allocations to verify that geometry calculations
 * operate with zero or near-zero GC garbage generation in hot loops.
 */
export class ZeroGCSpyCLI {
  private initialSnapshot: ZeroGCSpySnapshot;

  constructor() {
    this.initialSnapshot = this.capture();
  }

  public capture(): ZeroGCSpySnapshot {
    const mem = process.memoryUsage();
    let newSpaceUsed = 0;
    let oldSpaceUsed = 0;

    try {
      const heapSpaces = v8.getHeapSpaceStatistics();
      const newSpace = heapSpaces.find(s => s.space_name === 'new_space');
      const oldSpace = heapSpaces.find(s => s.space_name === 'old_space');
      if (newSpace) newSpaceUsed = newSpace.space_used_size;
      if (oldSpace) oldSpaceUsed = oldSpace.space_used_size;
    } catch {
      // Fallback if heap space statistics not available
    }

    return {
      timestamp: Date.now(),
      newSpaceUsedBytes: newSpaceUsed,
      oldSpaceUsedBytes: oldSpaceUsed,
      heapUsedBytes: mem.heapUsed,
      arrayBuffersBytes: mem.arrayBuffers || 0
    };
  }

  public delta(): {
    elapsedMs: number;
    newSpaceDeltaMb: number;
    oldSpaceDeltaMb: number;
    heapUsedDeltaMb: number;
  } {
    const current = this.capture();
    return {
      elapsedMs: current.timestamp - this.initialSnapshot.timestamp,
      newSpaceDeltaMb: (current.newSpaceUsedBytes - this.initialSnapshot.newSpaceUsedBytes) / (1024 * 1024),
      oldSpaceDeltaMb: (current.oldSpaceUsedBytes - this.initialSnapshot.oldSpaceUsedBytes) / (1024 * 1024),
      heapUsedDeltaMb: (current.heapUsedBytes - this.initialSnapshot.heapUsedBytes) / (1024 * 1024)
    };
  }

  public reset(): void {
    this.initialSnapshot = this.capture();
  }
}
