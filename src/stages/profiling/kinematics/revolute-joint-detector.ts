// ==============================================================================
// src/stages/profiling/kinematics/revolute-joint-detector.ts — Joint Detector Façade
// ==============================================================================

import { CylinderSurface, Vector3D } from '../../../types/geometry.js';
import { CADKinematicJoint } from '../../../types/features.js';
import { dot } from '../../../math/index.js';
import { type CandidateJoint, pointToLineDistance3D } from './kinematic-dto.js';
import { matchRevolutePair, fastRound4 } from './revolute-pair-matcher.js';

export function getEffectiveAxis(d: Vector3D): Vector3D {
  if (Math.abs(d[2]) > 0.92) return [0, 0, d[2] > 0 ? 1 : -1];
  if (Math.abs(d[0]) > 0.92) return [d[0] > 0 ? 1 : -1, 0, 0];
  if (Math.abs(d[1]) > 0.92) return [0, d[1] > 0 ? 1 : -1, 0];
  return [d[0], d[1], d[2]];
}

export interface RevoluteDetectionResult {
  kinematicJoints: CADKinematicJoint[];
  jointCylIds: Set<string>;
  physicalHinges: CandidateJoint[];
  connectedShellPairs: Set<string>;
}

export function detectRevoluteJoints(
  cylinders: CylinderSurface[],
  cylinderShellMap: Int32Array
): RevoluteDetectionResult {
  const candidateJoints: CandidateJoint[] = [];
  const physicalHinges: CandidateJoint[] = [];
  const kinematicJoints: CADKinematicJoint[] = [];
  const jointCylIds = new Set<string>();
  const connectedShellPairs = new Set<string>();

  // 1. Pre-calculate effective axes ONCE: O(N) instead of O(N^2) allocations
  const count = cylinders.length;
  const effectiveAxes = new Array<Vector3D>(count);
  for (let i = 0; i < count; i++) {
    effectiveAxes[i] = getEffectiveAxis(cylinders[i].axisDirection);
  }

  // 2. High-performance pair matching loop
  for (let i = 0; i < count; i++) {
    const cA = cylinders[i];
    const shellA = cylinderShellMap[i];

    for (let j = i + 1; j < count; j++) {
      const cB = cylinders[j];
      const shellB = cylinderShellMap[j];

      if (shellA !== -1 && shellB !== -1 && shellA === shellB) continue;
      if (cA.isInternal === cB.isInternal) continue;

      const isAInternal = cA.isInternal;
      const cand = matchRevolutePair({
        socket: isAInternal ? cA : cB,
        pin: isAInternal ? cB : cA,
        shellA,
        shellB,
        axisSocket: isAInternal ? effectiveAxes[i] : effectiveAxes[j],
        axisPin: isAInternal ? effectiveAxes[j] : effectiveAxes[i]
      });

      if (cand) {
        candidateJoints.push(cand);
      }
    }
  }

  // 3. Cluster and deduplicate along the common physical hinge line
  for (const cand of candidateJoints) {
    let matched = false;
    for (const h of physicalHinges) {
      const perpDist = pointToLineDistance3D(cand.axisOrigin, h.axisOrigin, h.axisDirection);
      const dDot = Math.abs(dot(h.axisDirection, cand.axisDirection));

      if (perpDist < 2.5 && dDot > 0.90) {
        if (cand.overlapMm > h.overlapMm) {
          h.socketId = cand.socketId;
          h.pinId = cand.pinId;
          h.clearanceMm = cand.clearanceMm;
          h.overlapMm = cand.overlapMm;
          h.perpDistMm = cand.perpDistMm;
          h.axisOrigin = cand.axisOrigin;
        }
        matched = true;
        break;
      }
    }
    if (!matched) {
      physicalHinges.push({ ...cand });
    }
  }

  physicalHinges.sort((a, b) => a.axisOrigin[1] - b.axisOrigin[1]);

  // 4. Generate clean kinematic joints with zero string parsing
  let jointCounter = 0;
  for (const h of physicalHinges) {
    jointCounter++;
    kinematicJoints.push({
      id: `pip_revolute_${jointCounter}`,
      type: 'revolute',
      measuredClearanceMm: fastRound4(h.clearanceMm),
      axisOrigin: [fastRound4(h.axisOrigin[0]), fastRound4(h.axisOrigin[1]), fastRound4(h.axisOrigin[2])],
      axisDirection: [fastRound4(h.axisDirection[0]), fastRound4(h.axisDirection[1]), fastRound4(h.axisDirection[2])]
    });
    jointCylIds.add(h.socketId);
    jointCylIds.add(h.pinId);
    connectedShellPairs.add(`${Math.min(h.shellA, h.shellB)}_${Math.max(h.shellA, h.shellB)}`);
  }

  return { kinematicJoints, jointCylIds, physicalHinges, connectedShellPairs };
}
