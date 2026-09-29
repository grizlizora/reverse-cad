// ==============================================================================
// src/stages/export/cad-engineering-features-builder.ts — Engineering Features DTO Builder
// Maps detected holes, threads, cavities, kinematics, and blends to the CAD DTO.
// ==============================================================================

import { CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import { round2, round3 } from '../../utils/numeric-format.js';

export type CADEngineeringFeatures = CADFeaturesSummary['engineeringFeatures'];

export function buildEngineeringFeaturesDTO(profiling: ProfilingResult): CADEngineeringFeatures {
  return {
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
  };
}
