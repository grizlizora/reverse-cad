// ==============================================================================
// src/types/features/cavities.ts — CAD Cavities, Patterns & Slots
// ==============================================================================

import { Point3D, Vector3D, BoundingBox3D } from '../geometry.js';

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
