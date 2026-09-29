// ==============================================================================
// src/kernel/step/validation/validator-engine.ts — Pure TypeScript B-Rep Validation Engine
// ==============================================================================

import {
  StepParsedModel,
  StepValidationReport
} from './types.js';
import { StepEntityExtractor } from './parser/step-entity-extractor.js';
import { StepInteractiveDebugger } from './inspector/step-interactive-debugger.js';
import { StepBrepValidatorNodeRunner, NodeValidationOptions } from './validator-engine-node-runner.js';
import { StepBrepValidatorCore, CoreValidationOptions, CoreAnalysisResult } from './validator-engine-core.js';

export { StepBrepValidatorCore, StepBrepValidatorNodeRunner };
export type { CoreValidationOptions, CoreAnalysisResult, NodeValidationOptions };

export class StepBrepValidatorEngine {
  private parsedModel: StepParsedModel = this.createEmptyModel();
  private readonly extractor = new StepEntityExtractor();
  private readonly nodeRunner = new StepBrepValidatorNodeRunner();
  private debuggerInstance?: StepInteractiveDebugger;

  private createEmptyModel(): StepParsedModel {
    return {
      points: new Map(), vertexPoints: new Map(), edgeCurves: new Map(), orientedEdges: new Map(),
      loops: new Map(), faces: [], faceById: new Map(), faceBoundToLoop: new Map(),
      closedShellEntities: [], openShellEntities: [], manifoldSolidEntities: [], brepWithVoidsEntities: []
    };
  }

  public clear(): void {
    this.parsedModel = this.createEmptyModel();
    this.debuggerInstance = undefined;
  }

  public getPoints() { return this.parsedModel.points; }
  public getLoops() { return this.parsedModel.loops; }
  public getFaces() { return this.parsedModel.faces; }
  public getEdgeCurves() { return this.parsedModel.edgeCurves; }
  public getOrientedEdges() { return this.parsedModel.orientedEdges; }

  public parse(stepContent: string): void {
    this.parsedModel = this.extractor.parse(stepContent);
    this.debuggerInstance = new StepInteractiveDebugger(this.parsedModel, this.extractor);
  }

  public parseFile(filePath: string): void {
    this.parsedModel = this.extractor.parseFile(filePath);
    this.debuggerInstance = new StepInteractiveDebugger(this.parsedModel, this.extractor);
  }

  public resolvePoint(id: string) {
    return this.extractor.resolvePoint(this.parsedModel, id);
  }

  public validate(
    filePath: string,
    options: NodeValidationOptions = {}
  ): StepValidationReport {
    const t0 = performance.now();
    const tParseStart = performance.now();
    this.parseFile(filePath);
    const parseDurationMs = performance.now() - tParseStart;

    return this.nodeRunner.runFileValidation(
      filePath,
      this.parsedModel,
      parseDurationMs,
      t0,
      options
    );
  }

  public inspectPointRegion(targetX: number, targetY: number, targetZ: number, tol: number = 0.5) {
    if (!this.debuggerInstance) {
      this.debuggerInstance = new StepInteractiveDebugger(this.parsedModel, this.extractor);
    }
    return this.debuggerInstance.inspectPointRegion(targetX, targetY, targetZ, tol);
  }

  public checkLoopPairs(pairs: Array<[string, string]>) {
    if (!this.debuggerInstance) {
      this.debuggerInstance = new StepInteractiveDebugger(this.parsedModel, this.extractor);
    }
    return this.debuggerInstance.checkLoopPairs(pairs);
  }
}
