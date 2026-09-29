// ==============================================================================
// src/kernel/step/validation/parser/step-entity-extractor.ts — STEP ISO 10303-21 AST Extractor
// ==============================================================================

import { StepParsedModel, Point3D, StepFace } from '../types.js';
import { StepStreamingLexer } from './step-streaming-lexer.js';
import { StepArgParser } from './step-arg-parser.js';

interface RawPendingFace {
  id: string;
  type: 'ADVANCED_FACE' | 'FACE_SURFACE';
  surfaceId: string;
  sameSense: boolean;
  boundIds: string[];
}

export class StepEntityExtractor {
  private createEmptyModel(): StepParsedModel {
    return {
      points: new Map(),
      vertexPoints: new Map(),
      edgeCurves: new Map(),
      orientedEdges: new Map(),
      loops: new Map(),
      faces: [],
      faceById: new Map(),
      faceBoundToLoop: new Map(),
      closedShellEntities: [],
      openShellEntities: [],
      manifoldSolidEntities: [],
      brepWithVoidsEntities: []
    };
  }

  private processStatement(
    model: StepParsedModel,
    pendingFaces: RawPendingFace[],
    entId: string,
    rhs: string
  ): void {
    if (rhs.startsWith('CARTESIAN_POINT')) {
      const coords = StepArgParser.parseCartesianPointCoords(rhs);
      if (coords) model.points.set(entId, { id: entId, x: coords.x, y: coords.y, z: coords.z });
    } else if (rhs.startsWith('VERTEX_POINT')) {
      const afterFirst = StepArgParser.skipFirstArg(rhs);
      const ptTok = afterFirst !== -1 ? StepArgParser.nextIdToken(rhs, afterFirst) : null;
      if (ptTok) model.vertexPoints.set(entId, ptTok.id);
    } else if (rhs.startsWith('EDGE_CURVE')) {
      const ec = StepArgParser.parseEdgeCurveArgs(rhs);
      if (ec) model.edgeCurves.set(entId, { id: entId, ...ec });
    } else if (rhs.startsWith('ORIENTED_EDGE')) {
      const oe = StepArgParser.parseOrientedEdgeArgs(rhs);
      if (oe) model.orientedEdges.set(entId, { id: entId, ...oe });
    } else if (rhs.startsWith('EDGE_LOOP')) {
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) model.loops.set(entId, { id: entId, type: 'EDGE_LOOP', pointIds: [], orientedEdgeIds: ids });
    } else if (rhs.startsWith('POLY_LOOP')) {
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) model.loops.set(entId, { id: entId, type: 'POLY_LOOP', pointIds: ids, orientedEdgeIds: [] });
    } else if (rhs.startsWith('FACE_OUTER_BOUND') || rhs.startsWith('FACE_BOUND')) {
      const isOuter = rhs.startsWith('FACE_OUTER_BOUND');
      const afterFirst = StepArgParser.skipFirstArg(rhs);
      const loopTok = afterFirst !== -1 ? StepArgParser.nextIdToken(rhs, afterFirst) : null;
      if (loopTok) {
        const orientation = StepArgParser.nextBooleanToken(rhs, loopTok.nextIndex) ?? true;
        model.faceBoundToLoop.set(entId, { loopId: loopTok.id, isOuter, orientation });
      }
    } else if (rhs.startsWith('ADVANCED_FACE') || rhs.startsWith('FACE_SURFACE')) {
      const isAdvanced = rhs.startsWith('ADVANCED_FACE');
      const [lStart, lEnd] = StepArgParser.findInnerListBounds(rhs);
      if (lStart !== -1 && lEnd !== -1) {
        const boundIds = StepArgParser.parseIdList(rhs, lStart, lEnd);
        const surfTok = StepArgParser.nextIdToken(rhs, lEnd + 1);
        const surfaceId = surfTok ? surfTok.id : '';
        const sameSense = StepArgParser.nextBooleanToken(rhs, surfTok ? surfTok.nextIndex : lEnd + 1) ?? true;
        pendingFaces.push({
          id: entId,
          type: isAdvanced ? 'ADVANCED_FACE' : 'FACE_SURFACE',
          surfaceId,
          sameSense,
          boundIds
        });
      }
    } else if (rhs.startsWith('CLOSED_SHELL')) {
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) model.closedShellEntities.push(ids);
    } else if (rhs.startsWith('OPEN_SHELL')) {
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) model.openShellEntities.push(ids);
    } else if (rhs.startsWith('MANIFOLD_SOLID_BREP')) {
      model.manifoldSolidEntities.push(entId);
    } else if (rhs.startsWith('BREP_WITH_VOIDS')) {
      model.manifoldSolidEntities.push(entId);
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) model.brepWithVoidsEntities.push(ids);
    }
  }

  private finalizeFaces(model: StepParsedModel, pendingFaces: RawPendingFace[]): void {
    for (let i = 0; i < pendingFaces.length; i++) {
      const pf = pendingFaces[i];
      let outerLoopId: string | undefined;
      let outerLoopOrientation = true;
      const holeLoopIds: string[] = [];
      const holeLoopOrientations: boolean[] = [];

      for (let b = 0; b < pf.boundIds.length; b++) {
        const bid = pf.boundIds[b];
        const bInfo = model.faceBoundToLoop.get(bid);
        if (bInfo) {
          if (bInfo.isOuter && !outerLoopId) {
            outerLoopId = bInfo.loopId;
            outerLoopOrientation = bInfo.orientation ?? true;
          } else {
            holeLoopIds.push(bInfo.loopId);
            holeLoopOrientations.push(bInfo.orientation ?? true);
          }
        } else if (model.loops.has(bid)) {
          if (!outerLoopId) {
            outerLoopId = bid;
            outerLoopOrientation = true;
          } else {
            holeLoopIds.push(bid);
            holeLoopOrientations.push(true);
          }
        }
      }

      const faceObj: StepFace = {
        id: pf.id,
        type: pf.type,
        surfaceId: pf.surfaceId,
        sameSense: pf.sameSense,
        outerLoopId,
        outerLoopOrientation,
        holeLoopIds,
        holeLoopOrientations
      };
      model.faces.push(faceObj);
      model.faceById.set(pf.id, faceObj);
    }
  }

  public parse(stepContent: string): StepParsedModel {
    const model = this.createEmptyModel();
    const pendingFaces: RawPendingFace[] = [];
    StepStreamingLexer.scanStatements(stepContent, (entId, rhs) => {
      this.processStatement(model, pendingFaces, entId, rhs);
    });
    this.finalizeFaces(model, pendingFaces);
    return model;
  }

  public parseFile(filePath: string): StepParsedModel {
    const model = this.createEmptyModel();
    const pendingFaces: RawPendingFace[] = [];
    StepStreamingLexer.scanFileChunks(filePath, (entId, rhs) => {
      this.processStatement(model, pendingFaces, entId, rhs);
    });
    this.finalizeFaces(model, pendingFaces);
    return model;
  }

  public resolvePoint(model: StepParsedModel, id: string): Point3D | null {
    const pDirect = model.points.get(id);
    if (pDirect) return pDirect;
    const ptRef = model.vertexPoints.get(id);
    if (ptRef) {
      const p = model.points.get(ptRef);
      if (p) return p;
    }
    return null;
  }
}
