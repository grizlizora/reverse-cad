// ==============================================================================
// src/kernel/step/validation/inspector/step-interactive-debugger.ts — Interactive Debugger
// ==============================================================================

import {
  StepParsedModel,
  StepCartesianPoint,
  StepLoop,
  StepFace
} from '../types.js';
import { StepEntityExtractor } from '../parser/step-entity-extractor.js';

export class StepInteractiveDebugger {
  constructor(
    private readonly model: StepParsedModel,
    private readonly extractor: StepEntityExtractor = new StepEntityExtractor()
  ) {}

  /**
   * Finds all CARTESIAN_POINT, POLY_LOOP/EDGE_LOOP, and ADVANCED_FACE entities near (targetX, targetY, targetZ).
   */
  public inspectPointRegion(
    targetX: number,
    targetY: number,
    targetZ: number,
    tol: number = 0.5
  ): {
    points: StepCartesianPoint[];
    matchingLoops: StepLoop[];
    matchingFaces: StepFace[];
  } {
    const matchingPoints: StepCartesianPoint[] = [];
    const matchingPointIds = new Set<string>();

    for (const pt of this.model.points.values()) {
      if (
        Math.abs(pt.x - targetX) < tol &&
        Math.abs(pt.y - targetY) < tol &&
        Math.abs(pt.z - targetZ) < tol
      ) {
        matchingPoints.push(pt);
        matchingPointIds.add(pt.id);
      }
    }

    const matchingLoops: StepLoop[] = [];
    const matchingLoopIds = new Set<string>();

    for (const loop of this.model.loops.values()) {
      let matches = false;
      if (loop.type === 'POLY_LOOP') {
        matches = loop.pointIds.some(pid => matchingPointIds.has(pid));
      } else if (loop.type === 'EDGE_LOOP') {
        for (const oeId of loop.orientedEdgeIds) {
          const oe = this.model.orientedEdges.get(oeId);
          if (!oe) continue;
          const ec = this.model.edgeCurves.get(oe.edgeCurveId);
          if (!ec) continue;
          const p1Id = this.model.vertexPoints.get(ec.v1) || ec.v1;
          const p2Id = this.model.vertexPoints.get(ec.v2) || ec.v2;
          if (matchingPointIds.has(p1Id) || matchingPointIds.has(p2Id)) {
            matches = true;
            break;
          }
        }
      }

      if (matches) {
        matchingLoops.push(loop);
        matchingLoopIds.add(loop.id);
      }
    }

    const matchingFaces: StepFace[] = [];
    for (const face of this.model.faces) {
      if (
        (face.outerLoopId && matchingLoopIds.has(face.outerLoopId)) ||
        face.holeLoopIds.some(hid => matchingLoopIds.has(hid))
      ) {
        matchingFaces.push(face);
      }
    }

    return {
      points: matchingPoints,
      matchingLoops,
      matchingFaces
    };
  }

  /**
   * Checks edge loop pair sharing between pairs of points or vertices.
   */
  public checkLoopPairs(
    pairs: Array<[string, string]>
  ): Map<string, Array<{ loopId: string; edge: [string, string] }>> {
    const result = new Map<string, Array<{ loopId: string; edge: [string, string] }>>();

    for (const [p0, p1] of pairs) {
      const key = `${p0}_${p1}`;
      result.set(key, []);

      for (const loop of this.model.loops.values()) {
        if (loop.type === 'POLY_LOOP') {
          const pts = loop.pointIds;
          const n = pts.length;
          for (let i = 0; i < n; i++) {
            const e0 = pts[i];
            const e1 = pts[(i + 1) % n];
            if ((e0 === p0 && e1 === p1) || (e0 === p1 && e1 === p0)) {
              result.get(key)!.push({ loopId: loop.id, edge: [e0, e1] });
            }
          }
        } else if (loop.type === 'EDGE_LOOP') {
          for (const oeId of loop.orientedEdgeIds) {
            const oe = this.model.orientedEdges.get(oeId);
            if (!oe) continue;
            const ec = this.model.edgeCurves.get(oe.edgeCurveId);
            if (!ec) continue;

            const vStart = oe.orientation ? ec.v1 : ec.v2;
            const vEnd = oe.orientation ? ec.v2 : ec.v1;
            const pStart = this.model.vertexPoints.get(vStart) || vStart;
            const pEnd = this.model.vertexPoints.get(vEnd) || vEnd;

            if (
              (vStart === p0 && vEnd === p1) ||
              (vStart === p1 && vEnd === p0) ||
              (pStart === p0 && pEnd === p1) ||
              (pStart === p1 && pEnd === p0)
            ) {
              result.get(key)!.push({ loopId: loop.id, edge: [vStart, vEnd] });
            }
          }
        }
      }
    }

    return result;
  }
}
