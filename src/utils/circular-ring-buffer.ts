// ==============================================================================
// src/utils/circular-ring-buffer.ts — Generic High-Performance Circular Ring Buffer
// ==============================================================================

/**
 * High-performance circular ring buffer with power-of-two bitmask indexing
 * and zero-leak V8 GC slot reclamation.
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
