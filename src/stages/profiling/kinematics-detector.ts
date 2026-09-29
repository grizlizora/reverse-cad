// ==============================================================================
// src/stages/profiling/kinematics-detector.ts — Print-in-Place Kinematic Joint Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive, CylinderSurface, MeshShell } from '../../types/geometry.js';
import { CADKinematicJoint } from '../../types/features.js';
import {
  type CandidateJoint,
  type KinematicsResult,
  type HingeRegistry,
  pointToLineDistance3D,
  isCylinderHingeAssociated
} from './kinematics/kinematic-dto.js';
import {
  buildTriangleToShellMap,
  mapSurfacesToShells
} from './kinematics/shell-surface-mapper.js';
import {
  detectRevoluteJoints
} from './kinematics/revolute-joint-detector.js';
import {
  detectPrismaticJoints
} from './kinematics/prismatic-joint-detector.js';

export {
  CandidateJoint,
  KinematicsResult,
  HingeRegistry,
  pointToLineDistance3D,
  isCylinderHingeAssociated
};

/**
 * Detects kinematic revolute hinges and prismatic sliders across connected shells.
 */
export function detectKinematics(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[]
): KinematicsResult {
  const outerShells = shells.filter(s => !s.isCavity && Math.abs(s.signedVolume) > 10.0);
  const allCylinders = surfaces.filter((s): s is CylinderSurface => s.type === 'cylinder');

  const kinematicJoints: CADKinematicJoint[] = [];
  const jointCylIds = new Set<string>();
  const physicalHinges: CandidateJoint[] = [];

  if (outerShells.length >= 2) {
    const triangleToShell = buildTriangleToShellMap(mesh, shells);

    // Filter out edge fillets from joint search
    const nonFilletCylinders = allCylinders.filter(c =>
      c.subType !== 'fillet' && (c.angularSpanRad === undefined || c.angularSpanRad > (140 * Math.PI / 180))
    );

    // O(N) map of non-fillet cylinders to their shell indices
    const cylinderShellMap = mapSurfacesToShells(nonFilletCylinders, triangleToShell, outerShells);

    // 1. Detect Revolute Joints
    const revoluteRes = detectRevoluteJoints(nonFilletCylinders, cylinderShellMap);
    for (let i = 0; i < revoluteRes.kinematicJoints.length; i++) {
      kinematicJoints.push(revoluteRes.kinematicJoints[i]);
    }
    for (const id of revoluteRes.jointCylIds) {
      jointCylIds.add(id);
    }
    for (let i = 0; i < revoluteRes.physicalHinges.length; i++) {
      physicalHinges.push(revoluteRes.physicalHinges[i]);
    }

    // 2. Detect Prismatic Joints
    const prismaticJoints = detectPrismaticJoints(
      outerShells,
      revoluteRes.connectedShellPairs,
      kinematicJoints.length
    );
    for (let i = 0; i < prismaticJoints.length; i++) {
      kinematicJoints.push(prismaticJoints[i]);
    }
  }

  const registry: HingeRegistry = { jointCylIds, physicalHinges };

  return {
    kinematicJoints,
    jointCylIds,
    physicalHinges,
    isHingeAssociatedCylinder: (c: CylinderSurface) => isCylinderHingeAssociated(c, registry)
  };
}
