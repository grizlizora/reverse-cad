// ==============================================================================
// src/kernel/step/analytical/volume-budget-gate.ts — Volume Budget Verification Gate
// Rigorously validates reconstructed B-Rep solids using mathematical volume accounting.
// Derived from stl2step D4.5 volume gate and divergence theorem accounting.
// ==============================================================================

export interface VolumeBudgetCheckResult {
  meshVolume: number;
  solidVolume: number;
  predictedDeltaTotal: number;
  actualDelta: number;
  residual: number;
  allowedBudget: number;
  isAccepted: boolean;
  rejectionReason?: string;
}

export interface ArcVolumeContribution {
  radius: number;
  thetaStep: number;
  stepCount: number;
  height: number;
  isAdditive: boolean; // True for convex boss, False for concave hole/bore
}

/**
 * Validates a reconstructed CAD B-Rep solid against its source mesh volume
 * using the stl2step mathematical volume attribution budget.
 *
 * An analytical reconstruction legitimately differs from the mesh by the
 * arc-versus-chord defect: ΔV = (R² / 2) * (θ - sin(θ)) * h.
 * If the solid volume differs beyond this budget, it indicates topological rupture,
 * self-intersection, or volume blowout.
 */
export function verifyVolumeBudget(
  meshVolume: number,
  solidVolume: number,
  contributions: ArcVolumeContribution[]
): VolumeBudgetCheckResult {
  let predictedDeltaTotal = 0;

  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    const singleStep = (c.radius * c.radius * 0.5) * (c.thetaStep - Math.sin(c.thetaStep));
    const featureDelta = singleStep * c.stepCount * c.height;

    if (c.isAdditive) {
      predictedDeltaTotal += featureDelta;
    } else {
      predictedDeltaTotal -= featureDelta;
    }
  }

  const actualDelta = solidVolume - meshVolume;
  const residual = Math.abs(actualDelta - predictedDeltaTotal);

  // Dynamic budget formula from stl2step:
  // budget = max(1e-4 * |meshVol|, 3 * sum(|predictedDelta|))
  let sumAbsPredicted = 0;
  for (let i = 0; i < contributions.length; i++) {
    const c = contributions[i];
    const singleStep = (c.radius * c.radius * 0.5) * (c.thetaStep - Math.sin(c.thetaStep));
    sumAbsPredicted += singleStep * c.stepCount * c.height;
  }

  const allowedBudget = Math.max(1e-4 * Math.abs(meshVolume), 3.0 * sumAbsPredicted + 1e-3);
  const isAccepted = residual <= allowedBudget;

  let rejectionReason: string | undefined;
  if (!isAccepted) {
    rejectionReason = `Volume residual (${residual.toFixed(2)} mm³) exceeds allowable budget (${allowedBudget.toFixed(2)} mm³). Possible topological blowout or hole leakage.`;
  }

  return {
    meshVolume,
    solidVolume,
    predictedDeltaTotal,
    actualDelta,
    residual,
    allowedBudget,
    isAccepted,
    rejectionReason
  };
}
