// ==============================================================================
// src/kernel/step/validation/topology/shell-decomposer.ts — O(E) BFS Shell Decomposer Façade
// ==============================================================================

import {
  StepFace,
  ShellInfo,
  GeometricEdgeInfo,
  FacePolygonData
} from '../types.js';
import { clusterConnectedFaces } from './shell-face-clusterer.js';
import { aggregateShellTopology } from './shell-topology-aggregator.js';
import { evaluateShellMetrics } from './shell-metrics-evaluator.js';

export class ShellDecomposer {
  /**
   * Decomposes B-Rep faces into connected shells via BFS in deterministic O(F + E) time.
   * Completely eliminates O(N^2) inner loops and Array.shift() memory stalls.
   */
  public static decompose(
    faces: StepFace[],
    faceAdjacency: Map<number, Set<number>>,
    edgeMap: Map<string, GeometricEdgeInfo>,
    facePolygons: FacePolygonData[],
    tol: number = 1e-4
  ): ShellInfo[] {
    const faceCount = faces.length;
    if (faceCount === 0) return [];

    // 1. Cluster connected faces using flat Int32Array BFS queue
    const { shellFacesLists, faceShellId } = clusterConnectedFaces(faceCount, faceAdjacency);
    const shellCount = shellFacesLists.length;

    // 2. Aggregate edges, vertices and boundary cracks across all shells in single O(E) pass
    const { shellEdgeSets, shellVertexSets, shellOpenEdgeCounts } = aggregateShellTopology(
      edgeMap,
      faceShellId,
      shellCount
    );

    // 3. Compute topological and volumetric metrics for each shell
    const shells: ShellInfo[] = [];
    for (let s = 0; s < shellCount; s++) {
      const shell = evaluateShellMetrics(
        s,
        shellFacesLists[s],
        faces,
        facePolygons,
        shellVertexSets[s],
        shellEdgeSets[s],
        shellOpenEdgeCounts[s],
        tol
      );
      shells.push(shell);
    }

    return shells;
  }
}
