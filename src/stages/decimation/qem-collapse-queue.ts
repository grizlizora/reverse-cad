// ==============================================================================
// src/stages/decimation/qem-collapse-queue.ts — Quadric Error Metric Binary Min-Heap
// ==============================================================================

export interface QEMEdgeCandidate {
  vA: number;
  vB: number;
  cost: number;
  key?: number;
}

/**
 * High-performance Flat TypedArray Binary Min-Heap priority queue for Quadric Error Metric (QEM) edge collapses.
 * Uses Float64Array for full 64-bit IEEE-754 quadric precision and eliminates V8 heap object allocations.
 */
export class QEMCollapseQueue {
  private vAArray: Int32Array;
  private vBArray: Int32Array;
  private costArray: Float64Array;
  private count: number = 0;
  private capacity: number;

  constructor(initialCapacity: number = 65536) {
    this.capacity = Math.max(1024, initialCapacity);
    this.vAArray = new Int32Array(this.capacity);
    this.vBArray = new Int32Array(this.capacity);
    this.costArray = new Float64Array(this.capacity);
  }

  public get size(): number {
    return this.count;
  }

  private grow(): void {
    const newCap = this.capacity * 2;
    const newVA = new Int32Array(newCap);
    const newVB = new Int32Array(newCap);
    const newCost = new Float64Array(newCap);

    newVA.set(this.vAArray);
    newVB.set(this.vBArray);
    newCost.set(this.costArray);

    this.vAArray = newVA;
    this.vBArray = newVB;
    this.costArray = newCost;
    this.capacity = newCap;
  }

  public push(edge: QEMEdgeCandidate): void {
    if (!Number.isFinite(edge.cost)) return;
    if (this.count >= this.capacity) {
      this.grow();
    }
    const idx = this.count++;
    this.vAArray[idx] = edge.vA;
    this.vBArray[idx] = edge.vB;
    this.costArray[idx] = edge.cost;
    this.bubbleUp(idx);
  }

  public pushValues(vA: number, vB: number, cost: number, _key?: number): void {
    if (!Number.isFinite(cost)) return;
    if (this.count >= this.capacity) {
      this.grow();
    }
    const idx = this.count++;
    this.vAArray[idx] = vA;
    this.vBArray[idx] = vB;
    this.costArray[idx] = cost;
    this.bubbleUp(idx);
  }

  /**
   * Zero-allocation pop: writes minimum candidate into pre-allocated `out` object.
   */
  public popInto(out: QEMEdgeCandidate): boolean {
    if (this.count === 0) return false;
    out.vA = this.vAArray[0];
    out.vB = this.vBArray[0];
    out.cost = this.costArray[0];

    const lastIdx = --this.count;
    if (this.count > 0) {
      this.vAArray[0] = this.vAArray[lastIdx];
      this.vBArray[0] = this.vBArray[lastIdx];
      this.costArray[0] = this.costArray[lastIdx];
      this.sinkDown(0);
    }
    return true;
  }

  public pop(): QEMEdgeCandidate | undefined {
    if (this.count === 0) return undefined;
    const res: QEMEdgeCandidate = {
      vA: this.vAArray[0],
      vB: this.vBArray[0],
      cost: this.costArray[0],
      key: 0
    };
    const lastIdx = --this.count;
    if (this.count > 0) {
      this.vAArray[0] = this.vAArray[lastIdx];
      this.vBArray[0] = this.vBArray[lastIdx];
      this.costArray[0] = this.costArray[lastIdx];
      this.sinkDown(0);
    }
    return res;
  }

  public peek(): QEMEdgeCandidate | undefined {
    if (this.count === 0) return undefined;
    return {
      vA: this.vAArray[0],
      vB: this.vBArray[0],
      cost: this.costArray[0],
      key: 0
    };
  }

  public clear(): void {
    this.count = 0;
  }

  private bubbleUp(index: number): void {
    const vA = this.vAArray[index];
    const vB = this.vBArray[index];
    const cost = this.costArray[index];

    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      if (cost >= this.costArray[parentIdx]) break;

      this.vAArray[index] = this.vAArray[parentIdx];
      this.vBArray[index] = this.vBArray[parentIdx];
      this.costArray[index] = this.costArray[parentIdx];

      index = parentIdx;
    }

    this.vAArray[index] = vA;
    this.vBArray[index] = vB;
    this.costArray[index] = cost;
  }

  private sinkDown(index: number): void {
    const length = this.count;
    const vA = this.vAArray[index];
    const vB = this.vBArray[index];
    const cost = this.costArray[index];
    const halfLength = length >> 1;

    while (index < halfLength) {
      const leftIdx = (index << 1) + 1;
      const rightIdx = leftIdx + 1;
      let bestIdx = leftIdx;
      let bestCost = this.costArray[leftIdx];

      if (rightIdx < length && this.costArray[rightIdx] < bestCost) {
        bestIdx = rightIdx;
        bestCost = this.costArray[rightIdx];
      }

      if (cost <= bestCost) break;

      this.vAArray[index] = this.vAArray[bestIdx];
      this.vBArray[index] = this.vBArray[bestIdx];
      this.costArray[index] = this.costArray[bestIdx];

      index = bestIdx;
    }

    this.vAArray[index] = vA;
    this.vBArray[index] = vB;
    this.costArray[index] = cost;
  }
}
