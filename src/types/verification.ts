// ==============================================================================
// src/types/verification.ts — RSVS (Reality Simulation & Verification Suite) Types
// ==============================================================================

export type GateStatus = 'PASSED' | 'FAILED' | 'WARNING';

export interface GateResult {
  gateId: string;
  name: string;
  status: GateStatus;
  description: string;
  metrics: Record<string, number | string | boolean>;
  failureReasons?: string[];
}

export interface Gate0Result extends GateResult {
  gateId: 'GATE_0_MESH_INTAKE';
  isWatertight: boolean;
  degenerateTriangleCount: number;
  selfIntersectionCount: number;
  eulerCharacteristic: number;
}

export interface Gate1Result extends GateResult {
  gateId: 'GATE_1_SEGMENTATION_COVERAGE';
  coveragePercentage: number; // target >= 98.0%
  analyticalSurfacesCount: number;
  freeformSurfacesCount: number;
  unclassifiedTrianglesCount: number;
  meanFittingResidualMm: number;
}

export interface Gate2Result extends GateResult {
  gateId: 'GATE_2_FEATURE_COAXIALITY';
  coaxialityToleranceMm: number;
  cylindricityToleranceMm: number;
  minClearanceDetectedMm: number;
  kinematicPreservation: boolean;
}

export interface Gate3Result extends GateResult {
  gateId: 'GATE_3_BREP_TOPOLOGY';
  isClosedSolid: boolean;
  bRepCheckStatus: string;
  sewingToleranceMm: number;
  hasSelfIntersections: boolean;
}

export interface Gate4Result extends GateResult {
  gateId: 'GATE_4_REALITY_DIFFERENTIAL';
  hausdorff99PercentileMm: number; // target <= 0.05 mm
  hausdorffMaxMm: number;
  surfaceWeightedRmseMm: number;   // target <= 0.015 mm
  volumeErrorRawPercent: number;
  volumeErrorEffectivePercent: number; // with signed curvature compensation, target <= 0.3%
  centerOfMassDriftMm: number;     // target <= 0.02 mm
  topologyInvariantsPreserved: boolean;
}

export interface VerificationReport {
  file: string;
  timestamp: string;
  overallStatus: GateStatus;
  processingTimeMs: number;
  gates: {
    gate0: Gate0Result;
    gate1: Gate1Result;
    gate2: Gate2Result;
    gate3: Gate3Result;
    gate4: Gate4Result;
  };
  summary: {
    allGatesPassed: boolean;
    criticalDefectsCount: number;
    warningsCount: number;
    heatmapGlbGenerated: boolean;
    heatmapPath?: string;
  };
}
