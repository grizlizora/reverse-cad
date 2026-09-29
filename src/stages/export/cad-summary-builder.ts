// ==============================================================================
// src/stages/export/cad-summary-builder.ts — Pure In-Memory CAD Summary DTO Builder Façade
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import { computePolyhedralMassProperties, PolyhedralMassProperties } from '../../utils/mass-properties.js';
import { StepBRepSynthesisReport } from '../../kernel/step/step-types.js';
import { evaluateDfmRules } from './dfm-rules-engine.js';
import { round2, round3 } from '../../utils/numeric-format.js';
import { buildMaterialsSummaryAndBodies } from './cad-material-summary-builder.js';
import { buildEngineeringFeaturesDTO } from './cad-engineering-features-builder.js';

/**
 * Builds high-density CADFeaturesSummary DTO in-memory without any disk I/O.
 */
export function buildCADFeaturesSummary(
  mesh: RawMesh,
  shells: MeshShell[],
  profiling: ProfilingResult,
  baseFileName: string,
  bRepSynthesis?: StepBRepSynthesisReport,
  precomputedMassProps?: PolyhedralMassProperties,
  materialSpecStr?: string
): CADFeaturesSummary {
  const massProps = precomputedMassProps ?? computePolyhedralMassProperties(mesh);

  let totalVolume = 0;
  let totalSurfaceArea = 0;
  for (let i = 0; i < shells.length; i++) {
    const sh = shells[i];
    if (!sh.isCavity) {
      totalVolume += sh.signedVolume;
    }
    totalSurfaceArea += sh.surfaceArea;
  }

  const dim = mesh.boundingBox.dimensions;
  const { materialsSummary, solidBodies } = buildMaterialsSummaryAndBodies(
    shells,
    profiling,
    bRepSynthesis,
    materialSpecStr
  );

  const dfm = evaluateDfmRules(mesh, profiling);
  const engineeringFeatures = buildEngineeringFeaturesDTO(profiling);

  return {
    modelName: baseFileName,
    generator: 'Antigravity CAD Reverse-Engineering Engine v1.0',
    timestamp: new Date().toISOString(),
    boundingDimensionsMm: [
      round2(dim[0]),
      round2(dim[1]),
      round2(dim[2])
    ],
    totalVolumeMm3: round2(totalVolume),
    totalSurfaceAreaMm2: round2(totalSurfaceArea),
    isWatertight: (mesh as any).isWatertight ?? true,
    solidBodiesCount: solidBodies.length,
    cavitiesCount: profiling.cavities.length,
    massProperties: {
      volumeMm3: round2(massProps.volumeMm3),
      surfaceAreaMm2: round2(massProps.surfaceAreaMm2),
      centerOfMass: [
        round3(massProps.centerOfMass[0]),
        round3(massProps.centerOfMass[1]),
        round3(massProps.centerOfMass[2])
      ],
      momentsOfInertia: {
        Ixx: round2(massProps.inertiaTensor.Ixx),
        Iyy: round2(massProps.inertiaTensor.Iyy),
        Izz: round2(massProps.inertiaTensor.Izz)
      },
      estimatedMinWallThicknessMm: massProps.estimatedMinWallThicknessMm
    },
    materialsSummary,
    solidBodies,
    engineeringFeatures,
    manufacturingRecommendations: dfm
  };
}
