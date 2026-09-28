// ==============================================================================
// src/worker/worker-abort-monitor.ts — Fast Cooperative Abort Watchdog for Workers
// ==============================================================================

export class WorkerAbortedError extends Error {
  constructor(taskId: string, stage?: string) {
    super(`Task ${taskId} was aborted by watchdog during stage: ${stage || 'unknown'}`);
    this.name = 'WorkerAbortedError';
  }
}

export class WorkerAbortMonitor {
  private readonly sharedFlag: Int32Array | null = null;
  private readonly taskId: string;

  constructor(taskId: string, sharedBuffer?: SharedArrayBuffer) {
    this.taskId = taskId;
    if (sharedBuffer && typeof SharedArrayBuffer !== 'undefined' && sharedBuffer instanceof SharedArrayBuffer) {
      this.sharedFlag = new Int32Array(sharedBuffer);
    }
  }

  public checkAbort(stageName?: string): void {
    if (this.sharedFlag) {
      const val = Atomics.load(this.sharedFlag, 0);
      if (val === 1) {
        throw new WorkerAbortedError(this.taskId, stageName);
      }
    }
  }

  public isAborted(): boolean {
    if (!this.sharedFlag) return false;
    return Atomics.load(this.sharedFlag, 0) === 1;
  }
}
