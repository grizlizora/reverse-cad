// ==============================================================================
// src/rsvs/gates/gate3-brep.ts — Gate 3: B-Rep Solid Topology Validation
// ==============================================================================

import { Gate3Result } from '../../types/verification.js';

export interface StepValidationInfo {
  isWatertight: boolean;
  is2Manifold: boolean;
  openEdgesCount: number;
  nonManifoldEdgesCount: number;
  invertedOrientationsCount: number;
  totalBoreSpanners: number;
  shellsCount: number;
}

export function evaluateGate3(isClosedSolid: boolean, stepValidation?: StepValidationInfo): Gate3Result {
  const failureReasons: string[] = [];
  let isPassed = isClosedSolid;

  if (stepValidation) {
    if (!stepValidation.isWatertight || stepValidation.openEdgesCount > 0) {
      isPassed = false;
      failureReasons.push(`STEP contains ${stepValidation.openEdgesCount} open boundary edges (unstitched cracks).`);
    }
    if (!stepValidation.is2Manifold || stepValidation.nonManifoldEdgesCount > 0) {
      isPassed = false;
      failureReasons.push(`STEP contains ${stepValidation.nonManifoldEdgesCount} non-manifold edges.`);
    }
    if (stepValidation.invertedOrientationsCount > 0) {
      isPassed = false;
      failureReasons.push(`STEP contains ${stepValidation.invertedOrientationsCount} inverted normal traversals.`);
    }
    if (stepValidation.totalBoreSpanners > 0) {
      isPassed = false;
      failureReasons.push(`STEP contains ${stepValidation.totalBoreSpanners} bore spanners plugging thread holes.`);
    }
  } else if (!isClosedSolid) {
    failureReasons.push('Mesh shells contain open boundary edges.');
  }

  return {
    gateId: 'GATE_3_BREP_TOPOLOGY',
    name: 'B-Rep Solid Topology Gate',
    status: isPassed ? 'PASSED' : 'FAILED',
    description: 'Validates that generated STEP model represents a closed, watertight CAD solid',
    isClosedSolid: isPassed,
    bRepCheckStatus: isPassed ? 'NoError' : 'TopologicalDefectsDetected',
    sewingToleranceMm: 0.005,
    hasSelfIntersections: stepValidation ? stepValidation.nonManifoldEdgesCount > 0 : false,
    failureReasons: failureReasons.length > 0 ? failureReasons : undefined,
    metrics: {
      isClosedSolid: isPassed,
      checkStatus: isPassed ? 'Valid' : 'Invalid',
      ...(stepValidation ? {
        openEdges: stepValidation.openEdgesCount,
        nonManifoldEdges: stepValidation.nonManifoldEdgesCount,
        boreSpanners: stepValidation.totalBoreSpanners,
        shells: stepValidation.shellsCount
      } : {})
    }
  };
}
