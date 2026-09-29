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

  // 4. Decompose into connected topological shells via BFS
  let { shells } = decomposeTopologicalShells(
    mesh.positions,
    cleanIndices,
    connectivity.flatTriangleAdjacency
  );

  // 4b. Prune disconnected non-manifold micro-debris (slivers < 30 triangles with volume < 1.0 mm³ or < 8 triangles)
  if (shells.length > 1) {
    const validShells: MeshShell[] = [];
    const keep = new Uint8Array(cleanIndices.length / 3);
    let debrisTriangles = 0;

    for (const sh of shells) {
      const isDebris = (sh.triangleIndices.length < 30 && Math.abs(sh.signedVolume) < 1.0) || (sh.triangleIndices.length < 8);
      if (!isDebris) {
        validShells.push(sh);
        for (let i = 0; i < sh.triangleIndices.length; i++) {
          keep[sh.triangleIndices[i]] = 1;
        }
      } else {
        debrisTriangles += sh.triangleIndices.length;
      }
    }

    if (validShells.length > 0 && debrisTriangles > 0) {
      const filteredCount = cleanIndices.length / 3 - debrisTriangles;
      const filteredIndices = new Uint32Array(filteredCount * 3);
      let ptr = 0;
      for (let t = 0; t < cleanIndices.length / 3; t++) {
        if (keep[t]) {
          filteredIndices[ptr++] = cleanIndices[t * 3];
          filteredIndices[ptr++] = cleanIndices[t * 3 + 1];
          filteredIndices[ptr++] = cleanIndices[t * 3 + 2];
        }
      }
      cleanIndices = filteredIndices;
      connectivity = analyzeEdgeConnectivity(cleanIndices);
      shells = decomposeTopologicalShells(
        mesh.positions,
        cleanIndices,
        connectivity.flatTriangleAdjacency
      ).shells;
    }
    // Final guard: never emit open micro-debris shells alongside a primary solid body
    if (shells.length > 1) {
      const primaryShells = shells.filter(sh => sh.triangleIndices.length >= 8 && (sh.triangleIndices.length >= 30 || Math.abs(sh.signedVolume) >= 0.1));
      if (primaryShells.length > 0) shells = primaryShells;
    }
  }

  const isWatertight = connectivity.openEdgesCount === 0 && connectivity.nonManifoldEdges === 0;

  // 5. Euler characteristic chi = V - E + F
  const eulerCharacteristic = computeEulerCharacteristic(
    cleanIndices,
    connectivity.uniqueEdgesCount
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
