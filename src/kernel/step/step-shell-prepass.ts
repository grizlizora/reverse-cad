// ==============================================================================
// src/kernel/step/step-shell-prepass.ts — Shell Topology & Semantic Prepass
// ==============================================================================

import { RawMesh, SurfacePrimitive, PlaneSurface, MeshShell } from '../../types/geometry.js';
import { TopologyEdgeIndexer } from './topology-edge-indexer.js';
import {
  CoplanarCluster,
  MatchedThroughHole,
  clusterCoplanarTriangles,
  identifyAndAbsorbThroughHoles
} from './planar/index.js';

export interface PrecomputedShellTopology {
  edgeIndexer: TopologyEdgeIndexer;
  clusters: CoplanarCluster[];
  absorbedTris?: Uint8Array;
  matchedHoles?: MatchedThroughHole[];
}

export interface ShellSemanticPrepassResult {
  absorbedTris: Uint8Array;
  precomputedShells: Map<number, PrecomputedShellTopology>;
}

/**
 * Computes scalar cross product with plane normal to determine face orientation sense.
 */
function isTriangleNormalAlignedWithPlane(
  positions: Float32Array | Float64Array,
  indices: Uint32Array | Int32Array,
  t: number,
  pNorm: [number, number, number]
): boolean {
  const i0 = indices[t * 3] * 3;
  const i1 = indices[t * 3 + 1] * 3;
  const i2 = indices[t * 3 + 2] * 3;

  const e1x = positions[i1] - positions[i0];
  const e1y = positions[i1 + 1] - positions[i0 + 1];
  const e1z = positions[i1 + 2] - positions[i0 + 2];

  const e2x = positions[i2] - positions[i0];
  const e2y = positions[i2 + 1] - positions[i0 + 1];
  const e2z = positions[i2 + 2] - positions[i0 + 2];

  const dot = (e1y * e2z - e1z * e2y) * pNorm[0] +
              (e1z * e2x - e1x * e2z) * pNorm[1] +
              (e1x * e2y - e1y * e2x) * pNorm[2];
  return dot >= 0;
}

/**
 * Executes semantic prepass across candidate solid shells:
 * maps triangles to analytical surfaces, detects face sense, clusters coplanar facets,
 * and identifies through-hole cylinders for absorption.
 */
export function executeShellSemanticPrepass(
  surfaces: SurfacePrimitive[],
  targetShells: MeshShell[],
  mesh: RawMesh,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array
): ShellSemanticPrepassResult {
  const absorbedTris = new Uint8Array(mesh.triangleCount);
  const precomputedShells = new Map<number, PrecomputedShellTopology>();
  const triToSurf = new Map<number, string>();
  const triSense = new Uint8Array(mesh.triangleCount).fill(1);
  const { positions, indices } = mesh;

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    if (!s.inlierIndices) continue;
    const pNorm = s.type === 'plane' ? (s as PlaneSurface).normal : null;

    for (let k = 0; k < s.inlierIndices.length; k++) {
      const t = s.inlierIndices[k];
      triToSurf.set(t, s.id);
      if (pNorm && !isTriangleNormalAlignedWithPlane(positions, indices, t, pNorm)) {
        triSense[t] = 0;
      }
    }
  }

  for (let sIdx = 0; sIdx < targetShells.length; sIdx++) {
    const shTris = targetShells[sIdx].triangleIndices;
    if (shTris.length > 500) {
      const shEdgeIndexer = new TopologyEdgeIndexer(indices, shTris);
      const shClusters = clusterCoplanarTriangles(
        shTris, indices, stepVerticesX, stepVerticesY, stepVerticesZ, triToSurf, triSense, shEdgeIndexer
      );
      const shellAbsorbed = new Uint8Array(mesh.triangleCount);
      const matchedHoles = identifyAndAbsorbThroughHoles(
        shClusters, mesh, stepVerticesX, stepVerticesY, stepVerticesZ, shEdgeIndexer, shellAbsorbed
      );
      for (let t = 0; t < shellAbsorbed.length; t++) {
        if (shellAbsorbed[t]) absorbedTris[t] = 1;
      }
      precomputedShells.set(sIdx, {
        edgeIndexer: shEdgeIndexer,
        clusters: shClusters,
        absorbedTris: shellAbsorbed,
        matchedHoles
      });
    }
  }

  return { absorbedTris, precomputedShells };
}
