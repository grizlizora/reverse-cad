// ==============================================================================
// src/stages/profiling/kinematics/kinematic-dto.ts — Kinematic Types & DTOs
// ==============================================================================

import { Point3D, Vector3D, CylinderSurface } from '../../../types/geometry.js';
import { CADKinematicJoint } from '../../../types/features.js';
import { dot } from '../../../math/index.js';

export interface CandidateJoint {
  socketId: string;
  pinId: string;
  shellA: number;
  shellB: number;
  clearanceMm: number;
  overlapMm: number;
  perpDistMm: number;
  axisOrigin: Point3D;
  axisDirection: Vector3D;
}

export interface HingeRegistry {
  jointCylIds: Set<string>;
  physicalHinges: CandidateJoint[];
}

export interface KinematicsResult {
  kinematicJoints: CADKinematicJoint[];
  jointCylIds: Set<string>;
  physicalHinges: CandidateJoint[];
  isHingeAssociatedCylinder: (c: CylinderSurface) => boolean;
}

/**
 * Calculates true 3D perpendicular distance between point p and infinite line (lineOrigin, lineDir).
 */
export function pointToLineDistance3D(p: Point3D, lineOrigin: Point3D, lineDir: Vector3D): number {
  const dx = p[0] - lineOrigin[0];
  const dy = p[1] - lineOrigin[1];
  const dz = p[2] - lineOrigin[2];
  const proj = dx * lineDir[0] + dy * lineDir[1] + dz * lineDir[2];
  const perpX = dx - proj * lineDir[0];
  const perpY = dy - proj * lineDir[1];
  const perpZ = dz - proj * lineDir[2];
  return Math.sqrt(perpX * perpX + perpY * perpY + perpZ * perpZ);
}

/**
 * Pure, serializable predicate checking if a cylinder is part of or associated with a hinge line.
 */
export function isCylinderHingeAssociated(c: CylinderSurface, registry: HingeRegistry): boolean {
  if (registry.jointCylIds.has(c.id)) return true;
  for (let i = 0; i < registry.physicalHinges.length; i++) {
    const h = registry.physicalHinges[i];
    const perpDist = pointToLineDistance3D(c.axisOrigin, h.axisOrigin, h.axisDirection);
    const dDot = Math.abs(dot(c.axisDirection, h.axisDirection));
    if (perpDist < 3.5 && dDot > 0.90) return true;
  }
  return false;
}
