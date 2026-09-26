// ==============================================================================
// src/stages/export/dfm-rules-engine.ts — Pure Domain DFM Rule Engine
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { ProfilingResult } from '../stage5-profiling.js';

export interface DfmRecommendation {
  recommendedNozzleMm: number;
  suggestedLayerHeightMm: number;
  orientationSuggestions: string;
  criticalTolerances: string[];
}

export interface IDfmRule {
  name: string;
  evaluate(mesh: RawMesh, profiling: ProfilingResult, current: DfmRecommendation): void;
}

export class MinFeatureSizeRule implements IDfmRule {
  name = 'MinFeatureSizeRule';
  evaluate(mesh: RawMesh, profiling: ProfilingResult, current: DfmRecommendation): void {
    let minHoleDia = Infinity;
    for (const h of profiling.holes) {
      if (h.diameter < minHoleDia) minHoleDia = h.diameter;
    }

    if (minHoleDia <= 2.5) {
      current.recommendedNozzleMm = 0.25;
      current.suggestedLayerHeightMm = 0.12;
      current.criticalTolerances.push(`Fine fastener detail (hole diameter ${minHoleDia.toFixed(1)}mm) requires 0.25mm nozzle`);
    } else if (minHoleDia <= 4.0) {
      current.recommendedNozzleMm = 0.40;
      current.suggestedLayerHeightMm = 0.16;
    }
  }
}

export class ThreadToleranceRule implements IDfmRule {
  name = 'ThreadToleranceRule';
  evaluate(mesh: RawMesh, profiling: ProfilingResult, current: DfmRecommendation): void {
    if (profiling.threads && profiling.threads.length > 0) {
      current.criticalTolerances.push(
        `Threads present (${profiling.threads.length} features): recommended 0.12mm layer height with 0.15mm horizontal expansion compensation`
      );
    }
  }
}

export class KinematicClearanceRule implements IDfmRule {
  name = 'KinematicClearanceRule';
  evaluate(mesh: RawMesh, profiling: ProfilingResult, current: DfmRecommendation): void {
    if (profiling.kinematicJoints && profiling.kinematicJoints.length > 0) {
      for (const j of profiling.kinematicJoints) {
        current.criticalTolerances.push(
          `Print-in-Place mechanism: joint clearance ${j.measuredClearanceMm.toFixed(2)}mm requires accurate flow rate calibration`
        );
      }
    }
  }
}

/**
 * Evaluates DFM rules against geometry and extracted features.
 */
export function evaluateDfmRules(mesh: RawMesh, profiling: ProfilingResult): DfmRecommendation {
  const result: DfmRecommendation = {
    recommendedNozzleMm: 0.40,
    suggestedLayerHeightMm: 0.20,
    orientationSuggestions: 'Orient largest planar base against build plate for maximum bed adhesion',
    criticalTolerances: []
  };

  const rules: IDfmRule[] = [
    new MinFeatureSizeRule(),
    new ThreadToleranceRule(),
    new KinematicClearanceRule()
  ];

  for (const rule of rules) {
    rule.evaluate(mesh, profiling, result);
  }

  return result;
}
