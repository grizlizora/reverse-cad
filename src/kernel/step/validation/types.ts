// ==============================================================================
// src/kernel/step/validation/types.ts — B-Rep & STEP Topology Validation Types
// ==============================================================================

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface StepCartesianPoint {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface StepEdgeCurve {
  id: string;
  v1: string; // vertex or point id
  v2: string; // vertex or point id
  curveId: string;
  sameSense: boolean;
}

export interface StepOrientedEdge {
  id: string;
  edgeCurveId: string;
  orientation: boolean; // true = .T., false = .F.
}

export interface StepLoop {
  id: string;
  type: 'POLY_LOOP' | 'EDGE_LOOP';
  pointIds: string[]; // For POLY_LOOP
  orientedEdgeIds: string[]; // For EDGE_LOOP
}

export interface StepFace {
  id: string;
  type: 'ADVANCED_FACE' | 'FACE_SURFACE';
  surfaceId: string;
  sameSense: boolean;
  outerLoopId?: string;
  outerLoopOrientation?: boolean;
  holeLoopIds: string[];
  holeLoopOrientations?: boolean[];
}

export interface GeometricEdgeKey {
  k1: string;
  k2: string;
}

export interface HalfEdgeOccurrence {
  faceIndex: number;
  faceId: string;
  loopId: string;
  vStartId: string;
  vEndId: string;
  p0: Point3D;
  p1: Point3D;
  forward: boolean; // true if traverses k1 -> k2, false if k2 -> k1
  kA?: string;
  kB?: string;
}

export interface GeometricEdgeInfo {
  key: string;
  pA: Point3D;
  pB: Point3D;
  length: number;
  occurrences: HalfEdgeOccurrence[];
  isCircularSeam: boolean;
}

export interface StepParsedModel {
  points: Map<string, StepCartesianPoint>;
  vertexPoints: Map<string, string>; // vertexId -> pointId
  edgeCurves: Map<string, StepEdgeCurve>;
  orientedEdges: Map<string, StepOrientedEdge>;
  loops: Map<string, StepLoop>;
  faces: StepFace[];
  faceById: Map<string, StepFace>;
  faceBoundToLoop: Map<string, { loopId: string; isOuter: boolean; orientation?: boolean }>;
  closedShellEntities: string[][];
  openShellEntities: string[][];
  manifoldSolidEntities: string[];
  brepWithVoidsEntities: string[][];
}

// Re-export diagnostic and report types for 100% backward compatibility
export type {
  ShellInfo,
  BoreSpannerResult,
  PlanarFaceInfo,
  WeirdFaceInfo,
  StepValidationReport,
  HoleDefinition,
  FacePolygonData
} from './report-types.js';
