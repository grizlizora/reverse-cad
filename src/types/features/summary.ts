// ==============================================================================
// src/types/features/summary.ts — CAD Features High-Level Summary & Topology DTOs
// ==============================================================================

import { Point3D, Vector3D, BoundingBox3D, SurfacePrimitive } from '../geometry.js';
import { HoleType } from './holes.js';
import { ThreadHand } from './threads.js';
import { CADCavity, CADSlot } from './cavities.js';
import { CADKinematicJoint } from './mechanisms.js';
import { CADMaterialsSummary } from './materials.js';

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

  materialsSummary?: CADMaterialsSummary;

  solidBodies?: Array<{
    name: string;
    volumeMm3: number;
    boundingBox: BoundingBox3D;
    materialName?: string;
    densityGcm3?: number;
    massGrams?: number;
    transparency?: number;
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
