// ==============================================================================
// src/kernel/step/step-id-allocator.ts — Atomic STEP Entity ID Allocator
// ==============================================================================

export class StepIdAllocator {
  private currentId: number;

  constructor(startId: number = 10) {
    this.currentId = startId;
  }

  public nextId(): string {
    return `#${this.currentId++}`;
  }

  public nextNumericId(): number {
    return this.currentId++;
  }

  public allocateRange(count: number): { start: number; end: number } {
    const start = this.currentId;
    this.currentId += count;
    return { start, end: this.currentId - 1 };
  }

  public peekCurrentId(): number {
    return this.currentId;
  }
}
