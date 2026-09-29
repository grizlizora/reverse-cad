// ==============================================================================
// src/types/features/mechanisms.ts — CAD Kinematic Joints & Mechanism Types
// ==============================================================================

import { Point3D, Vector3D } from '../geometry.js';

export interface CADKinematicJoint {
  id: string;
  type: 'print_in_place_hinge' | 'revolute' | 'prismatic';
  measuredClearanceMm: number; // gap between mating parts (e.g. 0.35 mm)
  axisOrigin: Point3D;
  axisDirection: Vector3D;
}
