// ==============================================================================
// src/stages/decimation/mesh-incidence-flat.ts — Zero-Allocation Flat Linked-CSR Incidence
// ==============================================================================

import { MeshCSR } from './mesh-csr.js';

/**
 * Zero-allocation dynamic vertex-to-triangle incidence list backed by flat Int32Arrays.
 * Replaces `number[][]` (which allocated millions of JS arrays on the V8 heap)
 * and achieves O(1) constant-time list concatenation during edge collapses.
 */
export class FlatVertexIncidence {
  public readonly head: Int32Array;
  public readonly tail: Int32Array;
  public readonly next: Int32Array;
  public readonly vTris: Uint32Array;

  constructor(numVertices: number, csr: MeshCSR) {
    const { vOffsets, vTris } = csr;
    this.vTris = vTris;
    this.head = new Int32Array(numVertices);
    this.tail = new Int32Array(numVertices);
    this.next = new Int32Array(vTris.length);

    for (let v = 0; v < numVertices; v++) {
      const start = vOffsets[v];
      const end = vOffsets[v + 1];
      if (start >= end) {
        this.head[v] = -1;
        this.tail[v] = -1;
      } else {
        this.head[v] = start;
        this.tail[v] = end - 1;
        for (let i = start; i < end - 1; i++) {
          this.next[i] = i + 1;
        }
        this.next[end - 1] = -1;
      }
    }
  }

  /**
   * Concatenates the incident triangle list of `removeV` onto `targetV` in O(1) time
   * with zero memory allocations.
   */
  public merge(targetV: number, removeV: number): void {
    if (targetV === removeV) return;
    const rHead = this.head[removeV];
    if (rHead === -1) return;

    const tTail = this.tail[targetV];
    if (tTail === -1) {
      this.head[targetV] = rHead;
      this.tail[targetV] = this.tail[removeV];
    } else {
      this.next[tTail] = rHead;
      this.tail[targetV] = this.tail[removeV];
    }

    this.head[removeV] = -1;
    this.tail[removeV] = -1;
  }
}
