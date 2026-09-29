// ==============================================================================
// src/kernel/step/validation/topology/half-edge-graph.ts — B-Rep Half-Edge Graph Builder
// ==============================================================================

import {
  StepParsedModel,
  GeometricEdgeInfo,
  FacePolygonData,
  WeirdFaceInfo
} from '../types.js';
import { StepEntityExtractor } from '../parser/step-entity-extractor.js';
import { SpatialVertexIndexer } from './spatial-vertex-indexer.js';
import { BoundingBox3D } from '../geometry/bounding-box.js';
import { FaceGeometryEvaluator } from '../geometry/face-geometry-evaluator.js';
import { extractFaceLoopsAndRegisterHalfEdges } from './half-edge-loop-processor.js';

export * from './half-edge-loop-processor.js';

export interface HalfEdgeGraphResult {
  edgeMap: Map<string, GeometricEdgeInfo>;
  faceAdjacency: Map<number, Set<number>>;
  facePolygons: FacePolygonData[];
  weirdFaces: WeirdFaceInfo[];
  openEdgesCount: number;
  nonManifoldEdgesCount: number;
  invertedOrientationsCount: number;
  circularSeamEdgesCount: number;
}

export class HalfEdgeGraphBuilder {
  public static build(
    model: StepParsedModel,
    bbox: BoundingBox3D,
    tol: number = 1e-4,
    extractor: StepEntityExtractor = new StepEntityExtractor()
  ): HalfEdgeGraphResult {
    const edgeMap = new Map<string, GeometricEdgeInfo>();
    const faceAdjacency = new Map<number, Set<number>>();
    for (let f = 0; f < model.faces.length; f++) {
      faceAdjacency.set(f, new Set<number>());
    }

    const facePolygons: FacePolygonData[] = new Array(model.faces.length);
    const weirdFaces: WeirdFaceInfo[] = [];
    const vertexIndexer = new SpatialVertexIndexer(tol);

    for (let fIdx = 0; fIdx < model.faces.length; fIdx++) {
      const face = model.faces[fIdx];
      const { facePts, holeLoopsPts } = extractFaceLoopsAndRegisterHalfEdges(
        model,
        face,
        fIdx,
        extractor,
        vertexIndexer,
        edgeMap
      );

      // Evaluate face polygon (with net area subtracting holes and signed divergence volume) & weird faces
      const evalRes = FaceGeometryEvaluator.evaluatePolygon(
        face.id,
        facePts,
        bbox,
        holeLoopsPts,
        face.sameSense
      );
      facePolygons[fIdx] = evalRes.polygon ?? {
        faceId: face.id,
        vertices: facePts,
        holeLoops: holeLoopsPts,
        sameSense: face.sameSense,
        signedVolumeContribution: 0,
        centroid: { x: 0, y: 0, z: 0 },
        area: 0
      };
      if (evalRes.weirdFace) {
        weirdFaces.push(evalRes.weirdFace);
      }
    }

    // Evaluate Edge Sharing and Manifoldness
    let openEdgesCount = 0;
    let nonManifoldEdgesCount = 0;
    let invertedOrientationsCount = 0;
    let circularSeamEdgesCount = 0;

    for (const edgeInfo of edgeMap.values()) {
      if (edgeInfo.isCircularSeam) {
        circularSeamEdgesCount++;
        continue;
      }

      const numOcc = edgeInfo.occurrences.length;
      if (numOcc === 1) {
        openEdgesCount++;
      } else if (numOcc > 2) {
        nonManifoldEdgesCount++;
      } else if (numOcc === 2) {
        const occ0 = edgeInfo.occurrences[0];
        const occ1 = edgeInfo.occurrences[1];
        if (occ0.forward === occ1.forward) {
          invertedOrientationsCount++;
        }
        faceAdjacency.get(occ0.faceIndex)?.add(occ1.faceIndex);
        faceAdjacency.get(occ1.faceIndex)?.add(occ0.faceIndex);
      }
    }

    return {
      edgeMap,
      faceAdjacency,
      facePolygons,
      weirdFaces,
      openEdgesCount,
      nonManifoldEdgesCount,
      invertedOrientationsCount,
      circularSeamEdgesCount
    };
  }
}
