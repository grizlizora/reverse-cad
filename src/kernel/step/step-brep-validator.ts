// ==============================================================================
// src/kernel/step/step-brep-validator.ts — Pure TypeScript B-Rep & STEP Topology Validator
// ==============================================================================
// Backward-compatible façade for the high-performance modular validation engine in
// src/kernel/step/validation/*.
// Guarantees 100% API compatibility with zero regressions, running O(E) shell aggregation.
// ==============================================================================

import {
  StepBrepValidatorEngine,
  StepValidationReport,
  HoleDefinition,
  StepCartesianPoint,
  StepLoop,
  StepFace,
  StepEdgeCurve,
  StepOrientedEdge,
  Point3D,
  SpatialVertexIndexer
} from './validation/index.js';

export * from './validation/types.js';
export * from './validation/index.js';

export class StepBrepValidator {
  private engine = new StepBrepValidatorEngine();

  public static quantizePoint(p: Point3D, tol: number = 1e-4): string {
    return SpatialVertexIndexer.quantizePoint(p, tol);
  }

  public static getCanonicalEdge(
    pA: Point3D,
    pB: Point3D,
    tol: number = 1e-4
  ): { edgeKey: string; forward: boolean; isCircular: boolean; dist: number } {
    return SpatialVertexIndexer.getCanonicalEdge(pA, pB, tol);
  }

  public clear(): void {
    this.engine.clear();
  }

  public getPoints(): Map<string, StepCartesianPoint> {
    return this.engine.getPoints();
  }

  public getLoops(): Map<string, StepLoop> {
    return this.engine.getLoops();
  }

  public getFaces(): StepFace[] {
    return this.engine.getFaces();
  }

  public getEdgeCurves(): Map<string, StepEdgeCurve> {
    return this.engine.getEdgeCurves();
  }

  public getOrientedEdges(): Map<string, StepOrientedEdge> {
    return this.engine.getOrientedEdges();
  }

  public resolvePoint(id: string): Point3D | null {
    return this.engine.resolvePoint(id);
  }

  public parse(stepContent: string): void {
    this.engine.parse(stepContent);
  }

  public parseFile(filePath: string): void {
    this.engine.parseFile(filePath);
  }

  public validate(
    filePath: string,
    options: {
      geometricTolerance?: number;
      targetHoles?: HoleDefinition[];
      runFreecadValidation?: boolean;
    } = {}
  ): StepValidationReport {
    return this.engine.validate(filePath, options);
  }

  public inspectPointRegion(targetX: number, targetY: number, targetZ: number, tol: number = 0.5) {
    return this.engine.inspectPointRegion(targetX, targetY, targetZ, tol);
  }

  public checkLoopPairs(pairs: Array<[string, string]>) {
    return this.engine.checkLoopPairs(pairs);
  }
}
