// ==============================================================================
// src/types/features/holes.ts — CAD Hole Types & Interfaces
// ==============================================================================

import { Point3D, Vector3D } from '../geometry.js';

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
