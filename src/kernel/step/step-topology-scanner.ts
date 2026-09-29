// ==============================================================================
// src/kernel/step/step-topology-scanner.ts — Streaming Scanner for StepTopologyLinter
// ==============================================================================
// Zero-split streaming scanner using StepStreamingLexer and StepArgParser.
// Supports pure B-Rep (EDGE_LOOP), tessellated (POLY_LOOP), and hybrid seams,
// as well as inner face bounds (R) for the generalized Euler-Poincaré formula.
// ==============================================================================

import { StepStreamingLexer } from './validation/parser/step-streaming-lexer.js';
import { StepArgParser } from './validation/parser/step-arg-parser.js';
import type { StepTopologyLinter } from './step-topology-linter.js';

interface RawEdgeCurveEntry {
  id: string;
  v1: string;
  v2: string;
}

interface RawOrientedEdgeEntry {
  id: string;
  edgeCurveId: string;
  orientation: boolean;
}

export function scanStepTopologyIntoLinter(
  stepContent: string,
  linter: StepTopologyLinter
): void {
  const vertexPointMap = new Map<string, string>();
  const rawEdgeCurves: RawEdgeCurveEntry[] = [];
  const rawOrientedEdges = new Map<string, RawOrientedEdgeEntry>();
  const edgeLoopMap = new Map<string, string[]>();
  const polyLoopMap = new Map<string, string[]>();
  const faceBounds = new Map<string, { loopId: string; isOuter: boolean; orientation: boolean }>();
  const faceBoundLists: string[][] = [];

  StepStreamingLexer.scanStatements(stepContent, (entId, rhs) => {
    if (rhs.startsWith('VERTEX_POINT')) {
      const afterFirst = StepArgParser.skipFirstArg(rhs);
      const ptTok = afterFirst !== -1 ? StepArgParser.nextIdToken(rhs, afterFirst) : null;
      if (ptTok) {
        vertexPointMap.set(entId, ptTok.id);
        linter.registerVertex(ptTok.id);
      }
    } else if (rhs.startsWith('EDGE_CURVE')) {
      const ec = StepArgParser.parseEdgeCurveArgs(rhs);
      if (ec) {
        rawEdgeCurves.push({ id: entId, v1: ec.v1, v2: ec.v2 });
      }
    } else if (rhs.startsWith('ORIENTED_EDGE')) {
      const oe = StepArgParser.parseOrientedEdgeArgs(rhs);
      if (oe) {
        rawOrientedEdges.set(entId, { id: entId, edgeCurveId: oe.edgeCurveId, orientation: oe.orientation });
      }
    } else if (rhs.startsWith('EDGE_LOOP')) {
      linter.incrementEdgeLoops();
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) edgeLoopMap.set(entId, ids);
    } else if (rhs.startsWith('POLY_LOOP')) {
      linter.incrementPolyLoops();
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) polyLoopMap.set(entId, ids);
    } else if (rhs.startsWith('FACE_OUTER_BOUND') || rhs.startsWith('FACE_BOUND')) {
      const isOuter = rhs.startsWith('FACE_OUTER_BOUND');
      const afterFirst = StepArgParser.skipFirstArg(rhs);
      const loopTok = afterFirst !== -1 ? StepArgParser.nextIdToken(rhs, afterFirst) : null;
      if (loopTok) {
        const orientation = StepArgParser.nextBooleanToken(rhs, loopTok.nextIndex) ?? true;
        faceBounds.set(entId, { loopId: loopTok.id, isOuter, orientation });
      }
    } else if (rhs.startsWith('ADVANCED_FACE')) {
      linter.registerFace(entId, true);
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) faceBoundLists.push(ids);
    } else if (rhs.startsWith('FACE_SURFACE')) {
      linter.registerFace(entId, false);
      const ids = StepArgParser.parseInnerIdList(rhs);
      if (ids) faceBoundLists.push(ids);
    } else if (rhs.startsWith('CLOSED_SHELL')) {
      linter.incrementClosedShells();
    } else if (rhs.startsWith('OPEN_SHELL')) {
      linter.incrementOpenShells();
    }
  });

  // 1. Register resolved EDGE_CURVE entities and build canonical vertex-pair lookup for hybrid seams
  const pairToEdgeCurve = new Map<string, { edgeId: string; forward: boolean }>();
  for (let i = 0; i < rawEdgeCurves.length; i++) {
    const ec = rawEdgeCurves[i];
    const vStart = vertexPointMap.get(ec.v1) ?? ec.v1;
    const vEnd = vertexPointMap.get(ec.v2) ?? ec.v2;
    linter.registerEdgeCurve(ec.id, vStart, vEnd);
    const pairKey = vStart < vEnd ? `${vStart}_${vEnd}` : `${vEnd}_${vStart}`;
    if (!pairToEdgeCurve.has(pairKey)) {
      pairToEdgeCurve.set(pairKey, { edgeId: ec.id, forward: vStart < vEnd });
    }
  }

  // 2. Determine inner ring count (R) and per-loop bound orientation
  const loopOrientation = new Map<string, boolean>();
  for (let f = 0; f < faceBoundLists.length; f++) {
    const bounds = faceBoundLists[f];
    if (bounds.length > 1) {
      linter.addInnerRings(bounds.length - 1);
    }
    for (let b = 0; b < bounds.length; b++) {
      const fb = faceBounds.get(bounds[b]);
      if (fb) {
        loopOrientation.set(fb.loopId, fb.orientation);
      }
    }
  }

  // 3. Register ORIENTED_EDGE traversals (respecting enclosing FACE_BOUND orientation when present)
  const consumedOrientedEdges = new Set<string>();
  for (const [loopId, oeIds] of edgeLoopMap.entries()) {
    const boundSense = loopOrientation.get(loopId) ?? true;
    for (let i = 0; i < oeIds.length; i++) {
      const oe = rawOrientedEdges.get(oeIds[i]);
      if (oe) {
        consumedOrientedEdges.add(oe.id);
        const effOrientation = boundSense ? oe.orientation : !oe.orientation;
        linter.registerOrientedEdge(oe.edgeCurveId, effOrientation);
      }
    }
  }
  for (const [oeId, oe] of rawOrientedEdges.entries()) {
    if (!consumedOrientedEdges.has(oeId)) {
      linter.registerOrientedEdge(oe.edgeCurveId, oe.orientation);
    }
  }

  // 4. Register POLY_LOOP traversals (matching against EDGE_CURVE on hybrid seams if present)
  for (const [loopId, ptIds] of polyLoopMap.entries()) {
    const boundSense = loopOrientation.get(loopId) ?? true;
    const n = ptIds.length;
    for (let p = 0; p < n; p++) {
      const rawA = ptIds[p];
      const rawB = ptIds[(p + 1) % n];
      const pA = vertexPointMap.get(rawA) ?? rawA;
      const pB = vertexPointMap.get(rawB) ?? rawB;
      linter.registerVertex(pA);
      const pairKey = pA < pB ? `${pA}_${pB}` : `${pB}_${pA}`;
      const stepForward = boundSense ? (pA < pB) : !(pA < pB);
      const matchedEc = pairToEdgeCurve.get(pairKey);
      if (matchedEc) {
        const ecOrientation = matchedEc.forward ? stepForward : !stepForward;
        linter.registerOrientedEdge(matchedEc.edgeId, ecOrientation);
      } else {
        linter.registerOrientedEdge(pairKey, stepForward);
      }
    }
  }
}
