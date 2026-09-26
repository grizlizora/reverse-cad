// ==============================================================================
// src/orchestrator/dwrr-queue.ts — 3-Tier DWRR Queue for 3D Mesh Workloads
// ==============================================================================

export type WorkloadPriority = 'P0_FAST' | 'P1_MEDIUM' | 'P2_HEAVY';

export interface QueuedSTLTask {
  filePath: string;
  fileSizeBytes: number;
  priority: WorkloadPriority;
  enqueuedAt: number;
  retries: number;
}

/**
 * High-performance circular ring buffer with bitmask indexing and zero-leak GC unlinking.
 */
export class CircularRingBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private mask: number;
  private head = 0;
  private tail = 0;
  private count = 0;

  constructor(initialPowerOfTwo = 256) {
    this.capacity = 1 << Math.ceil(Math.log2(Math.max(16, initialPowerOfTwo)));
    this.mask = this.capacity - 1;
    this.buffer = new Array<T | undefined>(this.capacity);
  }

  public push(item: T): void {
    if (this.count === this.capacity) {
      this.grow();
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) & this.mask;
    this.count++;
  }

  public pop(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // Crucial for V8 GC reclamation
    this.head = (this.head + 1) & this.mask;
    this.count--;
    return item;
  }

  public size(): number {
    return this.count;
  }

  public isEmpty(): boolean {
    return this.count === 0;
  }

  private grow(): void {
    const oldCap = this.capacity;
    const oldBuf = this.buffer;
    this.capacity = oldCap << 1;
    this.mask = this.capacity - 1;
    this.buffer = new Array<T | undefined>(this.capacity);
    for (let i = 0; i < this.count; i++) {
      this.buffer[i] = oldBuf[(this.head + i) & (oldCap - 1)];
    }
    this.head = 0;
    this.tail = this.count;
  }
}

/**
 * Deficit Weighted Round-Robin Scheduler for heterogeneous 3D meshes.
 * Eliminates Head-of-Line blocking so smaller parts do not wait for giant files.
 */
export class DWRRMeshScheduler {
  public readonly p0FastQueue = new CircularRingBuffer<QueuedSTLTask>(1024);
  public readonly p1MediumQueue = new CircularRingBuffer<QueuedSTLTask>(512);
  public readonly p2HeavyQueue = new CircularRingBuffer<QueuedSTLTask>(256);

  private p0Deficit = 0;
  private p1Deficit = 0;
  private p2Deficit = 0;
  private currentQueueIdx = 0;
  private activeHeavyInFlight = 0;
  private readonly maxConcurrentHeavy = 1;

  // Quantum ratio: for 1 heavy STL processed, process up to 8 fast and 4 medium files
  private readonly quantumP0 = 8;
  private readonly quantumP1 = 4;
  private readonly quantumP2 = 1;

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
    const queues = [
      { id: 'P0', q: this.p0FastQueue, quantum: this.quantumP0, getDef: () => this.p0Deficit, setDef: (v: number) => (this.p0Deficit = v) },
      { id: 'P1', q: this.p1MediumQueue, quantum: this.quantumP1, getDef: () => this.p1Deficit, setDef: (v: number) => (this.p1Deficit = v) },
      { id: 'P2', q: this.p2HeavyQueue, quantum: this.quantumP2, getDef: () => this.p2Deficit, setDef: (v: number) => (this.p2Deficit = v) }
    ];

    let attempts = 0;
    while (attempts < queues.length * 2) {
      const entry = queues[this.currentQueueIdx];
      if (!entry.q.isEmpty()) {
        // Enforce throttle for P2 heavy tasks to prevent Unified Memory thrashing
        if (entry.id === 'P2' && this.activeHeavyInFlight >= this.maxConcurrentHeavy) {
          this.currentQueueIdx = (this.currentQueueIdx + 1) % queues.length;
          attempts++;
          continue;
        }

        if (entry.getDef() <= 0) {
          entry.setDef(entry.quantum);
        }
        if (entry.getDef() > 0) {
          const task = entry.q.pop();
          if (task) {
            entry.setDef(entry.getDef() - 1);
            if (task.priority === 'P2_HEAVY') {
              this.activeHeavyInFlight++;
            }
            if (entry.getDef() <= 0) {
              this.currentQueueIdx = (this.currentQueueIdx + 1) % queues.length;
            }
            return task;
          }
        }
      }
      entry.setDef(0);
      this.currentQueueIdx = (this.currentQueueIdx + 1) % queues.length;
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
}
