// ==============================================================================
// src/kernel/step/topology-edge-indexer.ts — Zero-String Integer Edge Indexer
// ==============================================================================

/**
 * Packs two 32-bit unsigned vertex indices into a single 53-bit JS safe integer.
 * Maximum supported vertex index: 2^26 - 1 = 67,108,863 (far exceeding any 3D mesh).
 */
const VERTEX_SHIFT = 67108864; // 2^26

export function packEdgeKey(u: number, v: number): number {
  return u < v ? u * VERTEX_SHIFT + v : v * VERTEX_SHIFT + u;
}

export function packDirectedHalfEdgeKey(u: number, v: number): number {
  return u * VERTEX_SHIFT + v;
}

export function unpackDirectedHalfEdgeKey(key: number): [number, number] {
  const u = Math.floor(key / VERTEX_SHIFT);
  const v = key % VERTEX_SHIFT;
  return [u, v];
}

export interface EdgeAdjacency {
  triA: number;
  triB: number; // -1 if boundary edge
}

/**
 * High-performance edge adjacency indexer operating entirely on integer keys and typed arrays.
 * Completely eliminates string interpolation (`${v0}_${v1}`) and V8 GC New Space thrashing.
 */
export class TopologyEdgeIndexer {
  // Map from packed undirected edgeKey to triangle index pair
  private readonly edgeMap: Map<number, [number, number | -1]>;
  private readonly indices: Uint32Array;

  constructor(indices: Uint32Array, triIndices: number[]) {
    this.indices = indices;
    this.edgeMap = new Map();

    const triCount = triIndices.length;
    for (let k = 0; k < triCount; k++) {
      const t = triIndices[k];
      const t3 = t * 3;
      const v0 = indices[t3];
      const v1 = indices[t3 + 1];
      const v2 = indices[t3 + 2];

      this.registerEdge(v0, v1, t);
      this.registerEdge(v1, v2, t);
      this.registerEdge(v2, v0, t);
    }
  }

  private registerEdge(u: number, v: number, t: number): void {
    const key = packEdgeKey(u, v);
    const existing = this.edgeMap.get(key);
    if (!existing) {
      this.edgeMap.set(key, [t, -1]);
    } else if (existing[1] === -1) {
      existing[1] = t;
    }
  }

  /**
   * Retrieves triangles sharing undirected edge (u, v).
   */
  public getAdjacentTriangles(u: number, v: number): EdgeAdjacency | null {
    const pair = this.edgeMap.get(packEdgeKey(u, v));
    if (!pair) return null;
    return { triA: pair[0], triB: pair[1] };
  }

  /**
   * Returns adjacent triangles as an array for backward compatibility.
   */
  public getAdjacentTriangleList(u: number, v: number): number[] | null {
    const pair = this.edgeMap.get(packEdgeKey(u, v));
    if (!pair) return null;
    return pair[1] === -1 ? [pair[0]] : [pair[0], pair[1]];
  }

  /**
   * Fast boundary half-edge extraction for a coplanar cluster of triangles.
   * Returns an array of directed half-edges [u, v] that have no opposing twin inside the component.
   */
  public extractComponentBoundaryHalfEdges(
    compTris: number[]
  ): Array<[number, number]> {
    // Collect directed half-edges inside component
    const halfEdgeCounts = new Map<number, number>();
    const len = compTris.length;

    for (let c = 0; c < len; c++) {
      const t3 = compTris[c] * 3;
      const v0 = this.indices[t3];
      const v1 = this.indices[t3 + 1];
      const v2 = this.indices[t3 + 2];

      const k0 = packDirectedHalfEdgeKey(v0, v1);
      const k1 = packDirectedHalfEdgeKey(v1, v2);
      const k2 = packDirectedHalfEdgeKey(v2, v0);

      halfEdgeCounts.set(k0, (halfEdgeCounts.get(k0) || 0) + 1);
      halfEdgeCounts.set(k1, (halfEdgeCounts.get(k1) || 0) + 1);
      halfEdgeCounts.set(k2, (halfEdgeCounts.get(k2) || 0) + 1);
    }

    const boundaryEdges: Array<[number, number]> = [];
    for (const [k] of halfEdgeCounts.entries()) {
      const [u, v] = unpackDirectedHalfEdgeKey(k);
      const twinKey = packDirectedHalfEdgeKey(v, u);
      // If opposite twin does not exist within the component, it is a boundary half-edge
      if (!halfEdgeCounts.has(twinKey)) {
        boundaryEdges.push([u, v]);
      }
    }

    return boundaryEdges;
  }
}
