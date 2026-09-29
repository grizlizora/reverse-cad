// ==============================================================================
// src/standards/material-assignment.ts — Multi-Material Topological Assignment Engine
// ==============================================================================

import { MeshShell } from '../types/geometry.js';
import { ClassifiedBody } from '../utils/body-classifier.js';
import { SolidBodyConfig } from '../kernel/step/step-types.js';
import { MaterialSpec } from './material-catalog.js';
import { ProfilingResult } from '../stages/stage5-profiling.js';
import {
  parseMaterialSpec,
  compileMaterialSpec,
  type ParsedMaterialSpec,
  type CompiledMaterialSpec
} from './material-spec-parser.js';
import {
  inferSemanticMaterial,
  extractSortedDimensions,
  type HeuristicThresholds,
  DEFAULT_HEURISTIC_THRESHOLDS
} from './material-heuristics.js';

export type { ParsedMaterialSpec, CompiledMaterialSpec, HeuristicThresholds };
export {
  parseMaterialSpec,
  compileMaterialSpec,
  inferSemanticMaterial,
  extractSortedDimensions,
  DEFAULT_HEURISTIC_THRESHOLDS
};

export interface AssignedMaterialBody extends SolidBodyConfig {
  materialSpec: MaterialSpec;
  densityGcm3: number;
  transparency: number;
  refractiveIndex?: number;
  youngsModulusGpa?: number;
}

/**
 * Resolves solid body configurations with attached physical & optical material specifications.
 */
export function resolveBodyMaterials(
  targetShells: MeshShell[],
  classifiedBodies: ClassifiedBody[],
  materialSpecStr?: string,
  profiling?: ProfilingResult
): AssignedMaterialBody[] {
  const parsed = parseMaterialSpec(materialSpecStr);
  const compiled = compileMaterialSpec(parsed);

  return targetShells.map((shell, idx) => {
    const classInfo = classifiedBodies[idx];
    const effectiveShell = classInfo?.shell ?? shell;
    const defaultName = classInfo ? classInfo.name : `Solid_Body_${idx + 1}`;
    const lowerName = defaultName.toLowerCase();

    let matSpec: MaterialSpec | undefined;

    if (!compiled.isAuto) {
      if (compiled.globalMaterialSpec) {
        matSpec = compiled.globalMaterialSpec;
      } else if (compiled.indexedMaterialSpecs?.has(idx)) {
        matSpec = compiled.indexedMaterialSpecs.get(idx);
      } else if (classInfo) {
        if (compiled.roleMaterialSpecs?.has(classInfo.role)) {
          matSpec = compiled.roleMaterialSpecs.get(classInfo.role);
        } else if (compiled.namePatternSpecs) {
          for (let p = 0; p < compiled.namePatternSpecs.length; p++) {
            const rule = compiled.namePatternSpecs[p];
            if (lowerName.includes(rule.pattern)) {
              matSpec = rule.spec;
              break;
            }
          }
        }
      }
    }

    if (!matSpec) {
      matSpec = inferSemanticMaterial(effectiveShell, classInfo, profiling);
    }

    const colorRgb: [number, number, number] = matSpec.colorRgb;
    const colorLabel = `${matSpec.name} (${matSpec.category})`;

    return {
      name: defaultName,
      colorRgb,
      colorLabel,
      materialSpec: matSpec,
      materialName: matSpec.name,
      densityGcm3: matSpec.densityGcm3,
      transparency: matSpec.transparency,
      refractiveIndex: matSpec.refractiveIndex,
      youngsModulusGpa: matSpec.youngsModulusGpa
    };
  });
}
