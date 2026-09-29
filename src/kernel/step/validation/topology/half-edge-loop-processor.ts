// ==============================================================================
// src/kernel/step/validation/topology/half-edge-loop-processor.ts — Loop & Half-Edge Processor
// ==============================================================================
// Unified processor for POLY_LOOP and EDGE_LOOP boundaries on STEP faces.
// Eliminates duplicated half-edge occurrence registration and array allocations.
// ==============================================================================

import { StepParsedModel, StepFace, StepLoop, Point3D, GeometricEdgeInfo } from '../types.js';
import { StepEntityExtractor } from '../parser/step-entity-extractor.js';
import { SpatialVertexIndexer } from './spatial-vertex-indexer.js';

export function recordHalfEdgeOccurrence(
  edgeMap: Map<string, GeometricEdgeInfo>,
  vertexIndexer: SpatialVertexIndexer,
  fIdx: number,
  faceId: string,
  loopId: string,
  idA: string,
  idB: string,
  pA: Point3D,
  pB: Point3D
): void {
  const edgeProps = vertexIndexer.resolveEdge(pA, pB, idA, idB);
  let edgeInfo = edgeMap.get(edgeProps.edgeKey);
  if (!edgeInfo) {
    edgeInfo = {
      key: edgeProps.edgeKey,
      pA: edgeProps.forward ? pA : pB,
      pB: edgeProps.forward ? pB : pA,
      length: edgeProps.dist,
      occurrences: [],
      isCircularSeam: edgeProps.isCircular
    };
    edgeMap.set(edgeProps.edgeKey, edgeInfo);
  }

  edgeInfo.occurrences.push({
    faceIndex: fIdx, faceId, loopId,
    vStartId: idA, vEndId: idB,
    p0: pA, p1: pB,
    forward: edgeProps.forward,
    kA: edgeProps.kA, kB: edgeProps.kB
  });
}

function stripDuplicateClosingVertex(
  loopPts: Point3D[],
  loopPtIds: string[],
  vertexIndexer: SpatialVertexIndexer
): void {
  if (loopPts.length > 2) {
    const firstK = vertexIndexer.resolveVertexKey(loopPts[0], loopPtIds[0]);
    const lastIdx = loopPts.length - 1;
    const lastK = vertexIndexer.resolveVertexKey(loopPts[lastIdx], loopPtIds[lastIdx]);
    if (firstK === lastK) {
      loopPts.pop();
      loopPtIds.pop();
    }
  }
}

function processPolyLoop(
  model: StepParsedModel,
  extractor: StepEntityExtractor,
  vertexIndexer: SpatialVertexIndexer,
  edgeMap: Map<string, GeometricEdgeInfo>,
  fIdx: number,
  faceId: string,
  loop: StepLoop,
  boundOrientation: boolean
): Point3D[] | null {
  const loopPts: Point3D[] = [];
  const loopPtIds: string[] = [];
  for (let i = 0; i < loop.pointIds.length; i++) {
    const pid = loop.pointIds[i];
    const p = extractor.resolvePoint(model, pid);
    if (p) {
      loopPts.push(p);
      loopPtIds.push(pid);
    }
  }

  stripDuplicateClosingVertex(loopPts, loopPtIds, vertexIndexer);
  if (!boundOrientation && loopPts.length > 1) {
    loopPts.reverse();
    loopPtIds.reverse();
  }

  const nPts = loopPts.length;
  if (nPts < 3) return null;

  for (let i = 0; i < nPts; i++) {
    const nextIdx = (i + 1) % nPts;
    recordHalfEdgeOccurrence(
      edgeMap, vertexIndexer, fIdx, faceId, loop.id,
      loopPtIds[i], loopPtIds[nextIdx], loopPts[i], loopPts[nextIdx]
    );
  }
  return loopPts;
}

function processEdgeLoop(
  model: StepParsedModel,
  extractor: StepEntityExtractor,
  vertexIndexer: SpatialVertexIndexer,
  edgeMap: Map<string, GeometricEdgeInfo>,
  fIdx: number,
  faceId: string,
  loop: StepLoop,
  boundOrientation: boolean
): Point3D[] | null {
  const loopPts: Point3D[] = [];
  const loopPtIds: string[] = [];
  const oeIds = loop.orientedEdgeIds;
  const nEdges = oeIds.length;

  for (let step = 0; step < nEdges; step++) {
    const idx = boundOrientation ? step : (nEdges - 1 - step);
    const oe = model.orientedEdges.get(oeIds[idx]);
    if (!oe) continue;
    const ec = model.edgeCurves.get(oe.edgeCurveId);
    if (!ec) continue;

    const oeSense = ec.sameSense !== false ? oe.orientation : !oe.orientation;
    const effectiveOrientation = boundOrientation ? oeSense : !oeSense;
    const startId = effectiveOrientation ? ec.v1 : ec.v2;
    const endId = effectiveOrientation ? ec.v2 : ec.v1;
    const pStart = extractor.resolvePoint(model, startId);
    const pEnd = extractor.resolvePoint(model, endId);

    if (pStart && pEnd) {
      recordHalfEdgeOccurrence(
        edgeMap, vertexIndexer, fIdx, faceId, loop.id,
        startId, endId, pStart, pEnd
      );
      if (loopPts.length === 0) {
        loopPts.push(pStart);
        loopPtIds.push(startId);
      }
      loopPts.push(pEnd);
      loopPtIds.push(endId);
    }
  }

  stripDuplicateClosingVertex(loopPts, loopPtIds, vertexIndexer);
  return loopPts.length >= 3 ? loopPts : null;
}

export function extractFaceLoopsAndRegisterHalfEdges(
  model: StepParsedModel,
  face: StepFace,
  fIdx: number,
  extractor: StepEntityExtractor,
  vertexIndexer: SpatialVertexIndexer,
  edgeMap: Map<string, GeometricEdgeInfo>
): { facePts: Point3D[]; holeLoopsPts: Point3D[][] } {
  let facePts: Point3D[] = [];
  const holeLoopsPts: Point3D[][] = [];

  const processSingleBound = (loopId: string, orientation: boolean, isOuter: boolean) => {
    const loop = model.loops.get(loopId);
    if (!loop) return;
    const pts = loop.type === 'POLY_LOOP'
      ? processPolyLoop(model, extractor, vertexIndexer, edgeMap, fIdx, face.id, loop, orientation)
      : processEdgeLoop(model, extractor, vertexIndexer, edgeMap, fIdx, face.id, loop, orientation);
    if (pts) {
      if (isOuter && facePts.length === 0) facePts = pts;
      else holeLoopsPts.push(pts);
    }
  };

  if (face.outerLoopId) processSingleBound(face.outerLoopId, face.outerLoopOrientation ?? true, true);
  for (let h = 0; h < face.holeLoopIds.length; h++) {
    processSingleBound(face.holeLoopIds[h], face.holeLoopOrientations?.[h] ?? true, false);
  }
  return { facePts, holeLoopsPts };
}
