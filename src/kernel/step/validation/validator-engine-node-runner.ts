// ==============================================================================
// src/kernel/step/validation/validator-engine-node-runner.ts — Node.js File Runner
// ==============================================================================

import * as fs from 'fs';
import {
  StepParsedModel,
  StepValidationReport
} from './types.js';
import { StepBrepValidatorCore, CoreValidationOptions } from './validator-engine-core.js';
import { FreecadOccBridge } from './external/freecad-occ-bridge.js';

export interface NodeValidationOptions extends CoreValidationOptions {
  runFreecadValidation?: boolean;
}

/**
 * File-system and external tool bridge runner for B-Rep validation.
 * Safely guards I/O with try/catch and delegates topology analysis to the core.
 */
export class StepBrepValidatorNodeRunner {
  private readonly core = new StepBrepValidatorCore();

  public runFileValidation(
    filePath: string,
    parsedModel: StepParsedModel,
    parseDurationMs: number,
    t0: number,
    options: NodeValidationOptions = {}
  ): StepValidationReport {
    let fileSizeBytes = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const stats = fs.statSync(filePath);
      fileSizeBytes = stats.size;
    } catch (err: unknown) {
      errors.push(`Failed to stat file: ${String(err)}`);
    }

    const analysis = this.core.analyzeModel(parsedModel, options);
    errors.push(...analysis.errors);
    warnings.push(...analysis.warnings);

    let freecadConfirmation: StepValidationReport['freecadConfirmation'];
    if (options.runFreecadValidation) {
      try {
        freecadConfirmation = FreecadOccBridge.validate(filePath);
      } catch (err: unknown) {
        warnings.push(`FreeCAD validation failed: ${String(err)}`);
      }
    }

    return {
      filePath,
      fileSizeBytes,
      parseDurationMs,
      analysisDurationMs: analysis.analysisDurationMs,
      totalDurationMs: performance.now() - t0,
      cartesianPointsCount: parsedModel.points.size,
      vertexPointsCount: parsedModel.vertexPoints.size,
      edgeCurvesCount: parsedModel.edgeCurves.size,
      orientedEdgesCount: parsedModel.orientedEdges.size,
      polyLoopsCount: Array.from(parsedModel.loops.values()).filter(l => l.type === 'POLY_LOOP').length,
      edgeLoopsCount: Array.from(parsedModel.loops.values()).filter(l => l.type === 'EDGE_LOOP').length,
      facesCount: parsedModel.faces.length,
      closedShellsEntityCount: parsedModel.closedShellEntities.length,
      openShellsEntityCount: parsedModel.openShellEntities.length,
      manifoldSolidsEntityCount: parsedModel.manifoldSolidEntities.length,
      totalGeometricEdges: analysis.graph.edgeMap.size,
      openEdgesCount: analysis.graph.openEdgesCount,
      nonManifoldEdgesCount: analysis.graph.nonManifoldEdgesCount,
      invertedOrientationsCount: analysis.graph.invertedOrientationsCount,
      circularSeamEdgesCount: analysis.graph.circularSeamEdgesCount,
      isWatertight: analysis.isWatertight,
      is2Manifold: analysis.is2Manifold,
      isValidSolid: analysis.isValidSolid,
      detectedShellsCount: analysis.shells.length,
      shells: analysis.shells,
      boundingBox: analysis.boundingBox,
      weirdFaces: analysis.graph.weirdFaces,
      boreSpanners: analysis.boreSpanners,
      totalBoreSpanners: analysis.totalBoreSpanners,
      frontPlanarFaces: analysis.frontPlanarFaces,
      freecadConfirmation,
      errors,
      warnings
    };
  }
}
