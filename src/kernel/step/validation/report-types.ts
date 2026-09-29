// ==============================================================================
// src/kernel/step/validation/report-types.ts — Validation Report & Diagnostic Data Types
// ==============================================================================

import { Point3D } from './types.js';

export interface ShellInfo {
  shellIndex: number;
  faceCount: number;
  faceIds: string[];
  uniqueEdgesCount: number;
  uniqueVerticesCount: number;
  openEdgesCount: number;
  isClosed: boolean;
  eulerCharacteristic: number; // chi = V - E + F
  genus: number;
  approxArea: number;
  approxVolume: number;
  isRogue: boolean; // small orphaned shell (<= 10 faces)
}

export interface BoreSpannerResult {
  holeName: string;
  axisX: number;
  axisY: number;
  nominalRadius: number;
  keepoutRadius: number;
  zMin: number;
  zMax: number;
  spannersCount: number;
  spannerFaceIds: string[];
}

export interface PlanarFaceInfo {
  faceId: string;
  area: number;
  centroid: Point3D;
  edgeCount: number;
  surfaceStepId: string;
}

export interface WeirdFaceInfo {
  faceId: string;
  centroid: Point3D;
  area: number;
  edgeCount: number;
  reason: string;
}

export interface StepValidationReport {
  filePath: string;
  fileSizeBytes: number;
  parseDurationMs: number;
  analysisDurationMs: number;
  totalDurationMs: number;

  // Entity counts
  cartesianPointsCount: number;
  vertexPointsCount: number;
  edgeCurvesCount: number;
  orientedEdgesCount: number;
  polyLoopsCount: number;
  edgeLoopsCount: number;
  facesCount: number;
  closedShellsEntityCount: number;
  openShellsEntityCount: number;
  manifoldSolidsEntityCount: number;

  // Topology & Manifoldness (1:1 Ground Truth)
  totalGeometricEdges: number;
  openEdgesCount: number;         // Count != 2 (cracks / holes)
  nonManifoldEdgesCount: number;  // Count > 2 (T-junctions / internal walls)
  invertedOrientationsCount: number; // Count == 2 but both traverse same direction
  circularSeamEdgesCount: number; // Length == 0 (closed circle seam)
  isWatertight: boolean;
  is2Manifold: boolean;
  isValidSolid: boolean;

  // Connected Components / Shells
  detectedShellsCount: number;
  shells: ShellInfo[];

  // Geometric Analysis
  boundingBox: {
    min: Point3D;
    max: Point3D;
    dimensions: Point3D;
  };
  weirdFaces: WeirdFaceInfo[];
  boreSpanners: BoreSpannerResult[];
  totalBoreSpanners: number;
  frontPlanarFaces: PlanarFaceInfo[];

  // FreeCAD C++ OpenCASCADE validation (if available)
  freecadConfirmation?: {
    available: boolean;
    readTimeSec: number;
    faces: number;
    solids: number;
    shells: number;
    isClosed: boolean;
    isValid: boolean;
  };

  errors: string[];
  warnings: string[];
}

export interface HoleDefinition {
  name: string;
  hx: number;
  hy: number;
  hr: number;
  zMin?: number;
  zMax?: number;
}

export interface FacePolygonData {
  faceId: string;
  vertices: Point3D[];
  holeLoops?: Point3D[][];
  sameSense?: boolean;
  signedVolumeContribution?: number;
  centroid: Point3D;
  area: number;
}
