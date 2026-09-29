// ==============================================================================
// src/types/features/threads.ts — CAD Thread Types & Standards
// ==============================================================================

import { Point3D, Vector3D } from '../geometry.js';

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
