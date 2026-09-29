// ==============================================================================
// src/kernel/step/validation/topology/shell-metrics-evaluator.ts — Shell Metrics Evaluator
// Computes exact polyhedral volume, area, genus, and Euler-Poincaré invariants per shell.
// ==============================================================================

import { StepFace, ShellInfo, FacePolygonData } from '../types.js';
import { SpatialVertexIndexer } from './spatial-vertex-indexer.js';

export function evaluateShellMetrics(
  s: number,
  shellFaceIndices: number[],
  faces: StepFace[],
  facePolygons: FacePolygonData[],
  shellVertexSet: Set<string>,
  shellEdgeSet: Set<string>,
  shellOpenEdges: number,
  tol: number
): ShellInfo {
  const shellFaceIds = shellFaceIndices.map(idx => faces[idx].id);
  let shellArea = 0;
  let shellVol = 0;

  const needsVertexFallback = shellVertexSet.size === 0;
  const vertexIndexer = needsVertexFallback ? new SpatialVertexIndexer(tol) : null;

  let cx = 0, cy = 0, cz = 0;
  for (const fIdx of shellFaceIndices) {
    const poly = facePolygons[fIdx];
    if (poly && poly.vertices.length > 0) {
      cx = poly.vertices[0].x;
      cy = poly.vertices[0].y;
      cz = poly.vertices[0].z;
      break;
    }
  }

  for (const fIdx of shellFaceIndices) {
    const poly = facePolygons[fIdx];
    if (poly) {
      shellArea += poly.area;
      const pts = poly.vertices;
      if (vertexIndexer) {
        for (let p = 0; p < pts.length; p++) {
          shellVertexSet.add(vertexIndexer.resolveVertexKey(pts[p]));
        }
        if (poly.holeLoops) {
          for (let h = 0; h < poly.holeLoops.length; h++) {
            const hPts = poly.holeLoops[h];
            for (let p = 0; p < hPts.length; p++) {
              shellVertexSet.add(vertexIndexer.resolveVertexKey(hPts[p]));
            }
          }
        }
      }

      if (poly.signedVolumeContribution !== undefined) {
        shellVol += poly.signedVolumeContribution;
      } else if (pts.length >= 3) {
        const x0 = pts[0].x - cx, y0 = pts[0].y - cy, z0 = pts[0].z - cz;
        for (let i = 1; i < pts.length - 1; i++) {
          const x1 = pts[i].x - cx, y1 = pts[i].y - cy, z1 = pts[i].z - cz;
          const x2 = pts[i + 1].x - cx, y2 = pts[i + 1].y - cy, z2 = pts[i + 1].z - cz;
          const det = x0 * (y1 * z2 - z1 * y2) -
                      y0 * (x1 * z2 - z1 * x2) +
                      z0 * (x1 * y2 - y1 * x2);
          shellVol += det / 6.0;
        }
      }
    }
  }

  const V = shellVertexSet.size;
  const E = shellEdgeSet.size;
  const F = shellFaceIndices.length;
  const chi = V - E + F;
  const genus = Math.round((2 - chi) / 2);

  const isClosed = shellOpenEdges === 0 && F > 0;
  const isRogue = F <= 10;

  return {
    shellIndex: s,
    faceCount: F,
    faceIds: shellFaceIds,
    uniqueEdgesCount: E,
    uniqueVerticesCount: V,
    openEdgesCount: shellOpenEdges,
    isClosed,
    eulerCharacteristic: chi,
    genus,
    approxArea: shellArea,
    approxVolume: Math.abs(shellVol),
    isRogue
  };
}
