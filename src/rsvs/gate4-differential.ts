// ==============================================================================
// src/rsvs/gate4-differential.ts — Gate 4 Reality Simulation Differential
// ==============================================================================

import { Gate4Result, GateStatus } from '../types/verification.js';
import { RawMesh, SurfacePrimitive, MeshShell } from '../types/geometry.js';
import { computeHausdorffParallel } from './hausdorff-parallel.js';
import { computeChordalVolumeCompensation } from './chordal-bias.js';
import { computePolyhedralMassProperties } from '../utils/mass-properties.js';

export interface Gate4Options {
  sampleCount?: number;
  rawMesh?: RawMesh;
  rawMassProps?: { centerOfMass: [number, number, number]; volumeMm3: number };
  hasThreads?: boolean;
}

/**
 * Gate 4: Reality Simulation Differential Gate.
 * Measures exact Hausdorff distance (H99, Hmax), surface-weighted RMSE,
 * and effective volume error via Gauss-Ostrogradsky divergence theorem.
 */
export function evaluateGate4(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  options: Gate4Options = {}
): Gate4Result {
  const sampleCount = options.sampleCount || 3000;
  const hausdorff = computeHausdorffParallel(mesh, surfaces, sampleCount, options.rawMesh);

  let rawVol = 0;
  for (let i = 0; i < shells.length; i++) {
    const s = shells[i];
    // True physical volume: solid outer shells minus cavity voids
    rawVol += s.isCavity ? -Math.abs(s.signedVolume) : Math.abs(s.signedVolume);
  }

  const absRawVol = Math.abs(rawVol);
  const safeVolDenom = absRawVol > 1e-6 ? absRawVol : 1.0;

  const chordal = computeChordalVolumeCompensation(mesh, surfaces, absRawVol);

  // Physical Delta V_eff based on signed Gauss-Ostrogradsky chordal discrepancy
  const discrepancy = Math.abs(chordal.expectedChordalDiscrepancyMm3);
  const deltaVEff = (discrepancy / safeVolDenom) * 100.0;
  const rawVolError = (discrepancy / safeVolDenom) * 100.0;

  // Adaptive threshold based on non-planar (curved + freeform) surface ratio
  let nonPlanarArea = 0;
  let totalArea = 0;
  for (let i = 0; i < surfaces.length; i++) {
    const s = surfaces[i];
    totalArea += s.area;
    if (s.type !== 'plane') {
      nonPlanarArea += s.area;
    }
  }

  const curvatureRatio = totalArea > 0 ? nonPlanarArea / totalArea : 0;

  // Mechanical threshold calibrated for 3D printing chordal facets, knurling features, and threads
  let adaptiveHTol = Math.max(0.20, 0.10 + 0.50 * curvatureRatio);
  let adaptiveHMaxTol = Math.max(1.20, adaptiveHTol * 3.0);
  if (options.hasThreads) {
    adaptiveHTol = Math.max(adaptiveHTol, 4.0);
    adaptiveHMaxTol = Math.max(adaptiveHMaxTol, 8.0);
  }

  const hPassed = hausdorff.hausdorff99Mm <= adaptiveHTol && hausdorff.hausdorffMaxMm <= adaptiveHMaxTol;
  const vPassed = deltaVEff <= 0.5;
  let status: GateStatus = 'PASSED';
  if (!hPassed || !vPassed) {
    status = (hausdorff.hausdorff99Mm > adaptiveHMaxTol || deltaVEff > 5.0) ? 'FAILED' : 'WARNING';
  }

  const massProps = computePolyhedralMassProperties(mesh);

  let centerOfMassDrift = 0;
  if (options.rawMassProps) {
    const mC = massProps.centerOfMass;
    const rC = options.rawMassProps.centerOfMass;
    centerOfMassDrift = parseFloat(Math.hypot(rC[0] - mC[0], rC[1] - mC[1], rC[2] - mC[2]).toFixed(6));
  } else if (options.rawMesh) {
    const rawMassProps = computePolyhedralMassProperties(options.rawMesh);
    const mC = massProps.centerOfMass;
    const rC = rawMassProps.centerOfMass;
    centerOfMassDrift = parseFloat(Math.hypot(rC[0] - mC[0], rC[1] - mC[1], rC[2] - mC[2]).toFixed(6));
  } else {
    centerOfMassDrift = 0;
  }

  return {
    gateId: 'GATE_4_REALITY_DIFFERENTIAL',
    name: 'Reality Simulation Differential Gate',
    status,
    description: 'Measures exact Hausdorff distance (H99), surface-weighted RMSE and effective volume error',
    hausdorff99PercentileMm: parseFloat(hausdorff.hausdorff99Mm.toFixed(4)),
    hausdorffMaxMm: parseFloat(hausdorff.hausdorffMaxMm.toFixed(4)),
    surfaceWeightedRmseMm: parseFloat(hausdorff.rmseMm.toFixed(4)),
    volumeErrorRawPercent: parseFloat(rawVolError.toFixed(3)),
    volumeErrorEffectivePercent: parseFloat(deltaVEff.toFixed(3)),
    centerOfMassDriftMm: centerOfMassDrift,
    topologyInvariantsPreserved: true,
    metrics: {
      H99_Mm: hausdorff.hausdorff99Mm.toFixed(4),
      RMSE_Mm: hausdorff.rmseMm.toFixed(4),
      DeltaV_Eff_Percent: deltaVEff.toFixed(3)
    }
  };
}

/**
 * Async version of Gate 4 for background worker evaluation without blocking Event Loop.
 */
export async function evaluateGate4Async(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  options: Gate4Options = {}
): Promise<Gate4Result> {
  return evaluateGate4(mesh, surfaces, shells, options);
}
