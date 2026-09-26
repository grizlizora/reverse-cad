// ==============================================================================
// src/stages/sanitization/index.ts — Unified Mesh Topology Sanitizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { filterDegenerateTriangles } from './degenerate-filter.js';
import { microSewOpenBoundaries } from './spatial-sewer.js';
import { analyzeEdgeConnectivity, computeEulerCharacteristic } from './topology-report.js';
import { decomposeTopologicalShells } from './shell-decomposer.js';

export * from './degenerate-filter.js';
export * from './spatial-sewer.js';
export * from './topology-report.js';
export * from './shell-decomposer.js';

export interface SanitizeReport {
  isWatertight: boolean;
  degenerateTrianglesRemoved: number;
  openEdgesCount: number;
  eulerCharacteristic: number;
  shells: MeshShell[];
  cleanedMesh: RawMesh;
}

/**
 * Sanitizes mesh topology, removes degenerate zero-area faces,
 * checks watertightness, micro-sews open boundaries via O(K) spatial hashing,
 * and decomposes the mesh into topological shells with signed volumes.
 */
export function sanitizeTopology(mesh: RawMesh): SanitizeReport {
  // 1. Filter degenerate triangles
  const { cleanIndices: initialIndices, degenerateCount } = filterDegenerateTriangles(mesh);

  // 2. Build initial edge connectivity
  let connectivity = analyzeEdgeConnectivity(initialIndices);
  let cleanIndices = initialIndices;

  // 3. O(K) Micro-sewing pass for open boundary vertices within CAD tolerance (0.005mm)
  if (connectivity.openEdgesCount > 0) {
    const { weldedIndices, weldedCount } = microSewOpenBoundaries(
      mesh.positions,
      cleanIndices,
      connectivity.openEdgeVertices,
      0.005
    );

    if (weldedCount > 0) {
      cleanIndices = weldedIndices;
      connectivity = analyzeEdgeConnectivity(cleanIndices);
    }
  }

  const isWatertight = connectivity.openEdgesCount === 0 && connectivity.nonManifoldEdges === 0;

  // 4. Decompose into connected topological shells via BFS
  const { shells } = decomposeTopologicalShells(
    mesh.positions,
    cleanIndices,
    connectivity.triangleAdjacency
  );

  // 5. Euler characteristic chi = V - E + F
  const eulerCharacteristic = computeEulerCharacteristic(
    cleanIndices,
    connectivity.edgeFaceCount.size
  );

  const cleanTrianglesCount = Math.floor(cleanIndices.length / 3);
  const cleanedMesh: RawMesh = {
    positions: mesh.positions,
    indices: cleanIndices,
    vertexCount: Math.floor(mesh.positions.length / 3),
    triangleCount: cleanTrianglesCount,
    boundingBox: mesh.boundingBox
  };

  return {
    isWatertight,
    degenerateTrianglesRemoved: degenerateCount,
    openEdgesCount: connectivity.openEdgesCount,
    eulerCharacteristic,
    shells,
    cleanedMesh
  };
}
