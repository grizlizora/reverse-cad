// ==============================================================================
// src/stages/decimation/qem-collapse-queue.ts — Quadric Error Metric Binary Min-Heap
// ==============================================================================

export interface QEMEdgeCandidate {
  vA: number;
  vB: number;
  cost: number;
  key: number;
}

/**
 * Binary Min-Heap priority queue for Quadric Error Metric (QEM) edge collapses.
 * Orders edges so that the lowest geometric distortion / curvature error edges
 * are collapsed first.
 */
export class QEMCollapseQueue {
  private heap: QEMEdgeCandidate[] = [];

  public get size(): number {
    return this.heap.length;
  }

  public push(edge: QEMEdgeCandidate): void {
    this.heap.push(edge);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): QEMEdgeCandidate | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  public peek(): QEMEdgeCandidate | undefined {
    return this.heap[0];
  }

  public clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    const item = this.heap[index];
    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (item.cost >= parent.cost) break;
      this.heap[index] = parent;
      index = parentIdx;
    }
    this.heap[index] = item;
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    const item = this.heap[index];
    const halfLength = length >> 1;

    while (index < halfLength) {
      let leftIdx = (index << 1) + 1;
      let rightIdx = leftIdx + 1;
      let bestIdx = leftIdx;
      let bestItem = this.heap[leftIdx];

      if (rightIdx < length && this.heap[rightIdx].cost < bestItem.cost) {
        bestIdx = rightIdx;
        bestItem = this.heap[rightIdx];
      }

      if (item.cost <= bestItem.cost) break;
      this.heap[index] = bestItem;
      index = bestIdx;
    }
    this.heap[index] = item;
  }
}
