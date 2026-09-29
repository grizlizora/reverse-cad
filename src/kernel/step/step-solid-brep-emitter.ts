// ==============================================================================
// src/kernel/step/step-solid-brep-emitter.ts — B-Rep Shell & Solid Emitter
// ==============================================================================

import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';

export interface SolidEmissionResult {
  brepId: string;
  styledItemId?: string;
}

/**
 * Manages emission of topological CLOSED_SHELLs, MANIFOLD_SOLID_BREPs,
 * and BREP_WITH_VOIDS for STEP AP242 models.
 */
export class StepSolidBrepEmitter {
  private readonly writer: StepStreamWriter;
  private readonly allocator: StepIdAllocator;
  private chunkBuffer: string = '';
  private readonly chunkCharLimit: number;

  constructor(
    writer: StepStreamWriter,
    allocator: StepIdAllocator,
    chunkCharLimit: number = 256 * 1024
  ) {
    this.writer = writer;
    this.allocator = allocator;
    this.chunkCharLimit = chunkCharLimit;
  }

  public async flush(): Promise<void> {
    if (this.chunkBuffer.length > 0) {
      await this.writer.writeBlock(this.chunkBuffer);
      this.chunkBuffer = '';
    }
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
      this.chunkBuffer += fIdx === total - 1 ? '));\n' : ((fIdx % 10 === 9) ? ',\n  ' : ', ');
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
  ): Promise<SolidEmissionResult> {
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

  /**
   * Emits BREP_WITH_VOIDS for solids containing internal enclosed voids/cavities (ISO 10303-42).
   */
  public async emitBrepWithVoids(
    solidName: string,
    outerClosedShellId: string,
    voidShellIds: string[],
    styleId?: string
  ): Promise<SolidEmissionResult> {
    await this.flush();

    const orientedVoidIds: string[] = [];
    for (const vId of voidShellIds) {
      const oId = this.allocator.nextId();
      await this.writer.writeLine(
        `${oId} = ORIENTED_CLOSED_SHELL('', *, ${vId}, .F.);`
      );
      orientedVoidIds.push(oId);
    }

    const brepId = this.allocator.nextId();
    const voidsList = orientedVoidIds.join(', ');
    await this.writer.writeLine(
      `${brepId} = BREP_WITH_VOIDS('${solidName}', ${outerClosedShellId}, (${voidsList}));`
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
