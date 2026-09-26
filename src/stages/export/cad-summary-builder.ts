// ==============================================================================
// src/stages/export/cad-summary-builder.ts — Pure In-Memory CAD Summary DTO Builder
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import { computePolyhedralMassProperties, PolyhedralMassProperties } from '../../utils/mass-properties.js';
import { classifySolidBodies } from '../../utils/body-classifier.js';
import { StepBRepSynthesisReport } from '../../kernel/step/step-types.js';
import { evaluateDfmRules } from './dfm-rules-engine.js';
import { round2, round3, round4 } from '../../utils/numeric-format.js';

/**
 * Builds high-density CADFeaturesSummary DTO in-memory without any disk I/O.
 */
export function buildCADFeaturesSummary(
  mesh: RawMesh,
  shells: MeshShell[],
  profiling: ProfilingResult,
  baseFileName: string,
  bRepSynthesis?: StepBRepSynthesisReport,
  precomputedMassProps?: PolyhedralMassProperties
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
  const classified = classifySolidBodies(shells, profiling.kinematicJoints);

  const solidBodies = bRepSynthesis
    ? bRepSynthesis.solidBodies
    : classified.map(c => ({
        name: c.name,
        volumeMm3: round4(Math.abs(c.shell.signedVolume)),
        boundingBox: {
          min: [
            round4(c.shell.boundingBox.min[0]),
            round4(c.shell.boundingBox.min[1]),
            round4(c.shell.boundingBox.min[2])
          ] as [number, number, number],
          max: [
            round4(c.shell.boundingBox.max[0]),
            round4(c.shell.boundingBox.max[1]),
            round4(c.shell.boundingBox.max[2])
          ] as [number, number, number],
          dimensions: [
            round4(c.shell.boundingBox.dimensions[0]),
            round4(c.shell.boundingBox.dimensions[1]),
            round4(c.shell.boundingBox.dimensions[2])
          ] as [number, number, number],
          center: [
            round4(c.shell.boundingBox.center[0]),
            round4(c.shell.boundingBox.center[1]),
            round4(c.shell.boundingBox.center[2])
          ] as [number, number, number],
          diagonal: round4(c.shell.boundingBox.diagonal)
        }
      }));

  const dfm = evaluateDfmRules(mesh, profiling);

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
    solidBodies,
    engineeringFeatures: {
      holes: profiling.holes.map(h => ({
        id: h.id,
        type: h.type,
        diameterMm: h.diameter,
        depthMm: h.depth,
        isThreaded: h.isThreaded,
        thread: h.threadSpec,
        position: [
          round2(h.axisOrigin[0]),
          round2(h.axisOrigin[1]),
          round2(h.axisOrigin[2])
        ],
        direction: [
          round3(h.axisDirection[0]),
          round3(h.axisDirection[1]),
          round3(h.axisDirection[2])
        ]
      })),
      threads: profiling.threads.map(t => ({
        id: t.id,
        type: t.isInternal ? 'internal_hole' : 'external_stud',
        spec: t.designation,
        pitchMm: t.pitch,
        hand: t.hand,
        nominalDiameterMm: t.nominalDiameter,
        tapDrillDiameterMm: t.tapDrillDiameter
      })),
      cavities: profiling.cavities.map(c => ({
        id: c.id,
        volumeMm3: round2(c.volumeMm3),
        center: [
          round2(c.centerOfMass[0]),
          round2(c.centerOfMass[1]),
          round2(c.centerOfMass[2])
        ]
      })),
      patterns: profiling.holes.length >= 4
        ? [{ type: 'rectangular_array', feature: 'holes', count: profiling.holes.length }]
        : [],
      kinematics: profiling.kinematicJoints.map(k => ({
        type: k.type,
        clearanceMm: round3(k.measuredClearanceMm),
        axisOrigin: k.axisOrigin,
        axisDirection: k.axisDirection
      })),
      fillets: profiling.fillets ? profiling.fillets.map(f => ({
        id: f.id,
        radiusMm: f.radiusMm,
        lengthMm: f.lengthMm,
        areaMm2: f.areaMm2
      })) : [],
      chamfers: profiling.chamfers ? profiling.chamfers.map(c => ({
        id: c.id,
        widthMm: c.widthMm,
        angleDeg: c.angleDeg,
        areaMm2: c.areaMm2
      })) : [],
      slots: profiling.slots || []
    },
    manufacturingRecommendations: dfm
  };
}
