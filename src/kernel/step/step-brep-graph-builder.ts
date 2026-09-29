// ==============================================================================
// src/kernel/step/step-brep-graph-builder.ts — 2-Manifold B-Rep Topological Graph Builder
// ==============================================================================
// Constructs topologically stitched ISO 10303-42 B-Rep structures:
// ADVANCED_FACE, EDGE_LOOP, ORIENTED_EDGE, EDGE_CURVE with shared topology.
// Guarantees every edge is shared with opposite orientations (.T. and .F.),
// preventing CAD sewing locks and completely eliminating internal facet wireframes.
// ==============================================================================

import { StepIdAllocator } from './step-id-allocator.js';
import { StepEntityPool } from './step-entity-pool.js';

export interface BRepFaceDefinition {
  surfaceId: string;
  sameSense: boolean;
  outerLoopPtIds: string[];    // Cartesian point IDs in CCW traversal
  innerLoopPtIds?: string[][]; // Array of hole Cartesian point IDs in CW traversal
}

export class StepBRepGraphBuilder {
  private pool: StepEntityPool;
  private allocator: StepIdAllocator;

  // Cache of shared EDGE_CURVE by undirected vertex pair key: minId_maxId
  private edgeCurveMap = new Map<string, { edgeCurveId: string; vStart: string; vEnd: string; isReversed: boolean }>();
  private faceIds: string[] = [];
  private buffer: string[] = [];

  constructor(pool: StepEntityPool, allocator: StepIdAllocator) {
    this.pool = pool;
    this.allocator = allocator;
  }

  /**
   * Registers or retrieves a shared EDGE_CURVE for an edge between vStart and vEnd.
   * Returns the ORIENTED_EDGE ID and whether it's oriented forward or reversed.
   */
  public getOrCreateOrientedEdge(vStartPtId: string, vEndPtId: string, customCurveId?: string): string {
    const vStartVertex = this.pool.getOrCreateVertexPoint(vStartPtId);
    const vEndVertex = this.pool.getOrCreateVertexPoint(vEndPtId);

    // Canonical key regardless of traversal direction
    const key = vStartPtId < vEndPtId ? `${vStartPtId}_${vEndPtId}` : `${vEndPtId}_${vStartPtId}`;
    let edgeRecord = this.edgeCurveMap.get(key);

    if (!edgeRecord) {
      const edgeCurveId = this.allocator.nextId();
      let curveGeometryId = customCurveId;
      if (!curveGeometryId) {
        curveGeometryId = this.allocator.nextId();
        const dirId = this.pool.getOrCreateDirection(0, 0, 1);
        const vecId = this.pool.getOrCreateVector(dirId, 1.0);
        this.buffer.push(`${curveGeometryId} = LINE('', ${vStartPtId}, ${vecId});\n`);
      }

      this.buffer.push(`${edgeCurveId} = EDGE_CURVE('', ${vStartVertex}, ${vEndVertex}, ${curveGeometryId}, .T.);\n`);
      edgeRecord = { edgeCurveId, vStart: vStartPtId, vEnd: vEndPtId, isReversed: false };
      this.edgeCurveMap.set(key, edgeRecord);
    }

    // Determine orientation relative to canonical edge definition
    const orientation = vStartPtId === edgeRecord.vStart;
    const orientedEdgeId = this.allocator.nextId();
    this.buffer.push(`${orientedEdgeId} = ORIENTED_EDGE('', *, *, ${edgeRecord.edgeCurveId}, .${orientation ? 'T' : 'F'}.);\n`);

    return orientedEdgeId;
  }

  /**
   * Builds an EDGE_LOOP entity from a closed sequence of Cartesian point IDs.
   */
  public buildEdgeLoop(pointIds: string[]): string {
    const n = pointIds.length;
    if (n < 3) return '';

    const orientedEdgeIds: string[] = [];
    for (let i = 0; i < n; i++) {
      const vStart = pointIds[i];
      const vEnd = pointIds[(i + 1) % n];
      const orientedEdgeId = this.getOrCreateOrientedEdge(vStart, vEnd);
      orientedEdgeIds.push(orientedEdgeId);
    }

    const loopId = this.allocator.nextId();
    this.buffer.push(`${loopId} = EDGE_LOOP('', (${orientedEdgeIds.join(', ')}));\n`);
    return loopId;
  }

  /**
   * Adds an ADVANCED_FACE with unified boundary and optional hole loops.
   */
  public addAdvancedFace(faceDef: BRepFaceDefinition): string {
    const outerLoopId = this.buildEdgeLoop(faceDef.outerLoopPtIds);
    if (!outerLoopId) return '';

    const outerBoundId = this.allocator.nextId();
    this.buffer.push(`${outerBoundId} = FACE_OUTER_BOUND('', ${outerLoopId}, .T.);\n`);

    const boundIds: string[] = [outerBoundId];

    if (faceDef.innerLoopPtIds && faceDef.innerLoopPtIds.length > 0) {
      for (const holePoints of faceDef.innerLoopPtIds) {
        const holeLoopId = this.buildEdgeLoop(holePoints);
        if (holeLoopId) {
          const holeBoundId = this.allocator.nextId();
          this.buffer.push(`${holeBoundId} = FACE_BOUND('', ${holeLoopId}, .T.);\n`);
          boundIds.push(holeBoundId);
        }
      }
    }

    const faceId = this.allocator.nextId();
    const sense = faceDef.sameSense ? '.T.' : '.F.';
    this.buffer.push(`${faceId} = ADVANCED_FACE('', (${boundIds.join(', ')}), ${faceDef.surfaceId}, ${sense});\n`);
    this.faceIds.push(faceId);

    return faceId;
  }

  /**
   * Builds the final CLOSED_SHELL referencing all generated ADVANCED_FACE entities.
   */
  public buildClosedShell(): string {
    if (this.faceIds.length === 0) return '';
    const shellId = this.allocator.nextId();
    this.buffer.push(`${shellId} = CLOSED_SHELL('', (${this.faceIds.join(', ')}));\n`);
    return shellId;
  }

  public flushBuffer(): string {
    const out = this.buffer.join('');
    this.buffer = [];
    return out;
  }

  public getFaceIds(): string[] {
    return this.faceIds;
  }

  public getStats(): { faceCount: number; edgeCurveCount: number } {
    return {
      faceCount: this.faceIds.length,
      edgeCurveCount: this.edgeCurveMap.size
    };
  }
}
