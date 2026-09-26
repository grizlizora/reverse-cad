// ==============================================================================
// src/types/features.ts — Semantic CAD Engineering Features & JSON Schemas
// ==============================================================================

import { Point3D, Vector3D, BoundingBox3D, SurfacePrimitive } from './geometry.js';

export type HoleType = 'through' | 'blind' | 'counterbore' | 'countersink';

export interface CADHole {
  id: string;
  type: HoleType;
  diameter: number;
  depth: number;
  axisOrigin: Point3D;
  axisDirection: Vector3D;
  counterboreDiameter?: number;
  counterboreDepth?: number;
  countersinkAngleDeg?: number;
  isThreaded: boolean;
  threadSpec?: string; // e.g. "M6x1.0"
}

export type ThreadStandard = 'ISO_METRIC' | 'WHITWORTH' | 'TRAPEZOIDAL' | 'NPT' | 'CUSTOM';
export type ThreadHand = 'right' | 'left';

export interface CADThread {
  id: string;
  isInternal: boolean; // true = threaded hole / nut, false = bolt / stud
  standard: ThreadStandard;
  designation: string; // e.g. "M6x1.0", "1/4-20 UNC", "Tr10x2"
  nominalDiameter: number; // e.g. 6.0 mm
  tapDrillDiameter: number; // e.g. 5.0 mm (used for physical CAD solid geometry to prevent CAM overboring)
  pitch: number; // e.g. 1.0 mm
  threadDepth: number; // axial engagement length
  starts: number; // 1 = single-start, 2+ = multi-start
  hand: ThreadHand;
  axisOrigin: Point3D;
  axisDirection: Vector3D;
  radialFdmOffsetApplied: number; // e.g. -0.2 mm if detected from 3D print mesh
}

export interface CADCavity {
  id: string;
  volumeMm3: number;
  centerOfMass: Point3D;
  boundingBox: BoundingBox3D;
  isEnclosedVoid: boolean; // true if completely isolated inside solid
}

export interface CADPattern {
  id: string;
  type: 'linear_array' | 'rectangular_array' | 'circular_array';
  baseFeatureId: string;
  instancesCount: number;
  spacing?: number[];
  rotationAngleDeg?: number;
  axisDirection?: Vector3D;
}

export interface CADSlot {
  id: string;
  type: 'positioning_notch' | 'transverse_slot' | 'linear_slot';
  positionMm: Point3D;
  direction?: Vector3D;
  widthMm?: number;
}

export interface CADKinematicJoint {
  id: string;
  type: 'print_in_place_hinge' | 'revolute' | 'prismatic';
  measuredClearanceMm: number; // gap between mating parts (e.g. 0.35 mm)
  axisOrigin: Point3D;
  axisDirection: Vector3D;
}

// -----------------------------------------------------------------------------
// Two-Tier JSON Output Interfaces
// -----------------------------------------------------------------------------

/**
 * High-density summary JSON for LLMs / AI reasoning (< 1200 tokens).
 * Contains CSG structure, design intent, dimensions, holes, threads, patterns.
 */
export interface CADFeaturesSummary {
  modelName: string;
  generator: string;
  timestamp: string;
  boundingDimensionsMm: [number, number, number]; // width, depth, height
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
  isWatertight: boolean;
  solidBodiesCount: number;
  cavitiesCount: number;
  
  massProperties?: {
    volumeMm3: number;
    surfaceAreaMm2: number;
    centerOfMass: Point3D;
    momentsOfInertia: {
      Ixx: number;
      Iyy: number;
      Izz: number;
    };
    estimatedMinWallThicknessMm: number;
  };

  solidBodies?: Array<{
    name: string;
    volumeMm3: number;
    boundingBox: BoundingBox3D;
  }>;
  
  engineeringFeatures: {
    holes: Array<{
      id: string;
      type: HoleType;
      diameterMm: number;
      depthMm: number;
      isThreaded: boolean;
      thread?: string;
      position: Point3D;
      direction: Vector3D;
    }>;
    threads: Array<{
      id: string;
      type: 'internal_hole' | 'external_stud';
      spec: string;
      pitchMm: number;
      hand: ThreadHand;
      nominalDiameterMm: number;
      tapDrillDiameterMm: number;
    }>;
    cavities: Array<{
      id: string;
      volumeMm3: number;
      center: Point3D;
    }>;
    patterns: Array<{
      type: string;
      feature: string;
      count: number;
    }>;
    kinematics: Array<{
      type: string;
      clearanceMm: number;
      axisOrigin?: Point3D;
      axisDirection?: Vector3D;
    }>;
    chamfers?: Array<{
      id: string;
      widthMm: number;
      angleDeg: number;
      areaMm2: number;
    }>;
    fillets?: Array<{
      id: string;
      radiusMm: number;
      lengthMm: number;
      areaMm2: number;
    }>;
    slots?: CADSlot[];
  };

  manufacturingRecommendations: {
    recommendedNozzleMm: number;
    suggestedLayerHeightMm: number;
    orientationSuggestions: string;
    criticalTolerances: string[];
  };
}

/**
 * Detailed topological dump with explicit geometry coordinates.
 */
export interface CADFeaturesTopology {
  summary: CADFeaturesSummary;
  surfaces: SurfacePrimitive[];
  cavitiesDetail: CADCavity[];
  kinematicJoints: CADKinematicJoint[];
}
