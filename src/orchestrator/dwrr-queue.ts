// ==============================================================================
// src/orchestrator/dwrr-queue.ts — 3-Tier DWRR Queue for 3D Mesh Workloads
// ==============================================================================

import * as os from 'os';
import { CircularRingBuffer } from '../utils/circular-ring-buffer.js';

export { CircularRingBuffer };

export type WorkloadPriority = 'P0_FAST' | 'P1_MEDIUM' | 'P2_HEAVY';

export interface QueuedSTLTask {
  filePath: string;
  fileSizeBytes: number;
  priority: WorkloadPriority;
  enqueuedAt: number;
  retries: number;
}

export interface DWRRMeshSchedulerOptions {
  maxConcurrentHeavy?: number;
}

/**
 * Deficit Weighted Round-Robin Scheduler for heterogeneous 3D meshes.
 * Eliminates Head-of-Line blocking so smaller parts do not wait for giant files,
 * with adaptive concurrency for heavy workloads across multi-core CPUs.
 */
export class DWRRMeshScheduler {
  public readonly p0FastQueue = new CircularRingBuffer<QueuedSTLTask>(1024);
  public readonly p1MediumQueue = new CircularRingBuffer<QueuedSTLTask>(512);
  public readonly p2HeavyQueue = new CircularRingBuffer<QueuedSTLTask>(256);

  private readonly deficits = [0, 0, 0];
  private currentQueueIdx = 0;
  private activeHeavyInFlight = 0;
  private readonly maxConcurrentHeavy: number;

  // Quantum ratio: for 1 heavy STL processed, process up to 8 fast and 4 medium files
  private readonly quantums = [8, 4, 1];

  constructor(options: DWRRMeshSchedulerOptions = {}) {
    if (options.maxConcurrentHeavy !== undefined) {
      this.maxConcurrentHeavy = Math.max(1, options.maxConcurrentHeavy);
    } else {
      const numCpus = typeof os !== 'undefined' && os.cpus ? os.cpus().length : 4;
      this.maxConcurrentHeavy = Math.max(1, Math.min(4, Math.floor(numCpus / 2)));
    }
  }

  public classifyPriority(fileSizeBytes: number): WorkloadPriority {
    if (fileSizeBytes < 5 * 1024 * 1024) return 'P0_FAST';       // < 5 MB
    if (fileSizeBytes < 30 * 1024 * 1024) return 'P1_MEDIUM';   // 5 - 30 MB
    return 'P2_HEAVY';                                          // > 30 MB
  }

  public enqueue(filePath: string, fileSizeBytes: number): void {
    const priority = this.classifyPriority(fileSizeBytes);
    const task: QueuedSTLTask = {
      filePath,
      fileSizeBytes,
      priority,
      enqueuedAt: Date.now(),
      retries: 0
    };

    switch (priority) {
      case 'P0_FAST':
        this.p0FastQueue.push(task);
        break;
      case 'P1_MEDIUM':
        this.p1MediumQueue.push(task);
        break;
      case 'P2_HEAVY':
        this.p2HeavyQueue.push(task);
        break;
    }
  }

  public selectNextTask(): QueuedSTLTask | null {
    const qList = [this.p0FastQueue, this.p1MediumQueue, this.p2HeavyQueue];
    let attempts = 0;

    while (attempts < 6) {
      const idx = this.currentQueueIdx;
      const q = qList[idx];

      if (!q.isEmpty()) {
        // Enforce throttle for P2 heavy tasks to prevent Unified Memory thrashing
        if (idx === 2 && this.activeHeavyInFlight >= this.maxConcurrentHeavy) {
          this.currentQueueIdx = (this.currentQueueIdx + 1) % 3;
          attempts++;
          continue;
        }

        if (this.deficits[idx] <= 0) {
          this.deficits[idx] = this.quantums[idx];
        }

        if (this.deficits[idx] > 0) {
          const task = q.pop();
          if (task) {
            this.deficits[idx]--;
            if (task.priority === 'P2_HEAVY') {
              this.activeHeavyInFlight++;
            }
            if (this.deficits[idx] <= 0) {
              this.currentQueueIdx = (this.currentQueueIdx + 1) % 3;
            }
            return task;
          }
        }
      }

      this.deficits[idx] = 0;
      this.currentQueueIdx = (this.currentQueueIdx + 1) % 3;
      attempts++;
    }

    return null;
  }

  public releaseTask(task: QueuedSTLTask): void {
    if (task.priority === 'P2_HEAVY') {
      this.activeHeavyInFlight = Math.max(0, this.activeHeavyInFlight - 1);
    }
  }

  public totalPending(): number {
    return this.p0FastQueue.size() + this.p1MediumQueue.size() + this.p2HeavyQueue.size();
  }

  public getActiveHeavyInFlight(): number {
    return this.activeHeavyInFlight;
  }

  public getMaxConcurrentHeavy(): number {
    return this.maxConcurrentHeavy;
  }
}
