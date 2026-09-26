// ==============================================================================
// src/stages/sanitization/topology-report.ts — Edge Connectivity & Euler Characteristics
// ==============================================================================

export interface EdgeConnectivity {
  edgeFaceCount: Map<number, number>;
  triangleAdjacency: number[][];
  edgeToTriangles: Map<number, number[]>;
  openEdgesCount: number;
  nonManifoldEdges: number;
  openEdgeVertices: number[];
}

/**
 * Fast 53-bit safe integer edge key (zero string/BigInt allocation in V8)
 */
export function getFastEdgeKey(a: number, b: number): number {
  return a < b ? a * 67108864 + b : b * 67108864 + a;
}

/**
 * Analyzes edge connectivity, builds triangle adjacency, and counts boundary/non-manifold edges.
 */
export function analyzeEdgeConnectivity(indices: Uint32Array): EdgeConnectivity {
  const triangleCount = Math.floor(indices.length / 3);
  const edgeFaceCount = new Map<number, number>();
  const triangleAdjacency: number[][] = Array.from({ length: triangleCount }, () => []);
  const edgeToTriangles = new Map<number, number[]>();

  for (let t = 0; t < triangleCount; t++) {
    const t3 = t * 3;
    const i0 = indices[t3];
    const i1 = indices[t3 + 1];
    const i2 = indices[t3 + 2];

    const edges = [getFastEdgeKey(i0, i1), getFastEdgeKey(i1, i2), getFastEdgeKey(i2, i0)];

    for (let e = 0; e < 3; e++) {
      const key = edges[e];
      edgeFaceCount.set(key, (edgeFaceCount.get(key) ?? 0) + 1);

      let triList = edgeToTriangles.get(key);
      if (!triList) {
        triList = [];
        edgeToTriangles.set(key, triList);
      }
      triList.push(t);
    }
  }

  // Build triangle adjacency graph across shared manifold edges
  for (const triList of edgeToTriangles.values()) {
    if (triList.length === 2) {
      const t1 = triList[0];
      const t2 = triList[1];
      triangleAdjacency[t1].push(t2);
      triangleAdjacency[t2].push(t1);
    }
  }

  let openEdgesCount = 0;
  let nonManifoldEdges = 0;
  const openEdgeVertices: number[] = [];

  for (const [key, count] of edgeFaceCount.entries()) {
    if (count === 1) {
      openEdgesCount++;
      openEdgeVertices.push(Math.floor(key / 67108864), key % 67108864);
    } else if (count > 2) {
      nonManifoldEdges++;
    }
  }

  return {
    edgeFaceCount,
    triangleAdjacency,
    edgeToTriangles,
    openEdgesCount,
    nonManifoldEdges,
    openEdgeVertices
  };
}

/**
 * Computes Euler characteristic chi = V - E + F for used vertices.
 */
export function computeEulerCharacteristic(
  indices: Uint32Array,
  edgeCount: number
): number {
  const uniqueUsedVertices = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    uniqueUsedVertices.add(indices[i]);
  }
  const triangleCount = Math.floor(indices.length / 3);
  return uniqueUsedVertices.size - edgeCount + triangleCount;
}
