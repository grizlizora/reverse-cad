// ==============================================================================
// src/kernel/step/step-face-emitter.ts — Atomic Buffered STEP AP242 Face Emitter
// ==============================================================================

import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';

export interface JordanFaceDefinition {
  outerLoop: number[];
  holeLoops?: number[][];
  surfaceId: string;
  sameSense: boolean;
}

/**
 * Manages atomic STEP AP242 entity serialization, block buffering (256KB),
 * and streaming of closed shells and solid B-Reps.
 */
export class StepFaceEmitter {
  private readonly writer: StepStreamWriter;
  private readonly allocator: StepIdAllocator;
  private readonly pointIds: string[];
  private chunkBuffer: string = '';
  private readonly chunkCharLimit: number;

  constructor(
    writer: StepStreamWriter,
    allocator: StepIdAllocator,
    pointIds: string[],
    chunkCharLimit: number = 256 * 1024
  ) {
    this.writer = writer;
    this.allocator = allocator;
    this.pointIds = pointIds;
    this.chunkCharLimit = chunkCharLimit;
  }

  private async checkFlush(): Promise<void> {
    if (this.chunkBuffer.length >= this.chunkCharLimit) {
      await this.flush();
    }
  }

  public async flush(): Promise<void> {
    if (this.chunkBuffer.length > 0) {
      await this.writer.writeBlock(this.chunkBuffer);
      this.chunkBuffer = '';
    }
  }

  /**
   * Emits a single triangular face on the specified surface.
   */
  public async emitTriangleFace(
    v0: number,
    v1: number,
    v2: number,
    surfaceId: string,
    sameSense: boolean
  ): Promise<string> {
    const senseStr = sameSense ? '.T.' : '.F.';
    const polyLoopId = this.allocator.nextId();
    this.chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${this.pointIds[v0]}, ${this.pointIds[v1]}, ${this.pointIds[v2]}));\n`;
    const faceBoundId = this.allocator.nextId();
    this.chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
    const faceId = this.allocator.nextId();
    this.chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfaceId}, ${senseStr});\n`;

    await this.checkFlush();
    return faceId;
  }

  /**
   * Emits a single planar quad face on the specified surface.
   */
  public async emitQuadFace(
    q0: number,
    q1: number,
    q2: number,
    q3: number,
    surfaceId: string,
    sameSense: boolean
  ): Promise<string> {
    const senseStr = sameSense ? '.T.' : '.F.';
    const polyLoopId = this.allocator.nextId();
    this.chunkBuffer += `${polyLoopId} = POLY_LOOP('', (${this.pointIds[q0]}, ${this.pointIds[q1]}, ${this.pointIds[q2]}, ${this.pointIds[q3]}));\n`;
    const faceBoundId = this.allocator.nextId();
    this.chunkBuffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;
    const faceId = this.allocator.nextId();
    this.chunkBuffer += `${faceId} = FACE_SURFACE('', (${faceBoundId}), ${surfaceId}, ${senseStr});\n`;

    await this.checkFlush();
    return faceId;
  }

  /**
   * Emits a validated Jordan face with an outer polygonal boundary and optional inner hole loops.
   */
  public async emitJordanFace(faceDef: JordanFaceDefinition): Promise<string> {
    const { outerLoop, holeLoops, surfaceId, sameSense } = faceDef;
    const senseStr = sameSense ? '.T.' : '.F.';
    const boundIds: string[] = [];

    // Outer loop
    const outerPolyId = this.allocator.nextId();
    const outerPts = outerLoop.map(v => this.pointIds[v]).join(', ');
    this.chunkBuffer += `${outerPolyId} = POLY_LOOP('', (${outerPts}));\n`;
    const outerBoundId = this.allocator.nextId();
    this.chunkBuffer += `${outerBoundId} = FACE_OUTER_BOUND('', ${outerPolyId}, .T.);\n`;
    boundIds.push(outerBoundId);

    // Inner hole loops (if any)
    if (holeLoops && holeLoops.length > 0) {
      for (let hIdx = 0; hIdx < holeLoops.length; hIdx++) {
        const hLoop = holeLoops[hIdx];
        if (hLoop.length < 3) continue;
        const holePolyId = this.allocator.nextId();
        const holePts = hLoop.map(v => this.pointIds[v]).join(', ');
        this.chunkBuffer += `${holePolyId} = POLY_LOOP('', (${holePts}));\n`;
        const holeBoundId = this.allocator.nextId();
        this.chunkBuffer += `${holeBoundId} = FACE_BOUND('', ${holePolyId}, .T.);\n`;
        boundIds.push(holeBoundId);
      }
    }

    const faceId = this.allocator.nextId();
    const boundsStr = boundIds.join(', ');
    this.chunkBuffer += `${faceId} = FACE_SURFACE('', (${boundsStr}), ${surfaceId}, ${senseStr});\n`;

    await this.checkFlush();
    return faceId;
  }

  /**
   * Streams a CLOSED_SHELL in 1000-face blocks without giant single-string memory spikes.
   */
  public async emitClosedShell(shellFaceIds: string[]): Promise<string> {
    const closedShellId = this.allocator.nextId();
    this.chunkBuffer += `${closedShellId} = CLOSED_SHELL('', (\n`;
    const total = shellFaceIds.length;

    for (let fIdx = 0; fIdx < total; fIdx++) {
      this.chunkBuffer += shellFaceIds[fIdx];
      this.chunkBuffer += fIdx === total - 1 ? '));\n' : ', ';
      if (this.chunkBuffer.length >= this.chunkCharLimit) {
        await this.flush();
      }
    }

    await this.flush();
    return closedShellId;
  }

  /**
   * Emits MANIFOLD_SOLID_BREP and optional STYLED_ITEM.
   */
  public async emitSolidBrep(
    solidName: string,
    closedShellId: string,
    styleId?: string
  ): Promise<{ brepId: string; styledItemId?: string }> {
    await this.flush();

    const brepId = this.allocator.nextId();
    await this.writer.writeLine(
      `${brepId} = MANIFOLD_SOLID_BREP('${solidName}', ${closedShellId});`
    );

    let styledItemId: string | undefined;
    if (styleId) {
      styledItemId = this.allocator.nextId();
      await this.writer.writeLine(
        `${styledItemId} = STYLED_ITEM('', (${styleId}), ${brepId});`
      );
    }

    return { brepId, styledItemId };
  }
}
