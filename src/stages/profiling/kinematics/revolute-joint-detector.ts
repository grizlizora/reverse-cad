// ==============================================================================
// src/stages/profiling/kinematics/revolute-joint-detector.ts — Revolute Joint Detector
// ==============================================================================

import { CylinderSurface, Point3D, Vector3D } from '../../../types/geometry.js';
import { CADKinematicJoint } from '../../../types/features.js';
import { dot } from '../../../math/index.js';
import { CandidateJoint, pointToLineDistance3D } from './kinematic-dto.js';

/**
 * Returns snapped canonical axis direction without mutating the underlying surface.
 */
export function getEffectiveAxis(d: Vector3D): Vector3D {
  if (Math.abs(d[2]) > 0.92) {
    return [0, 0, d[2] > 0 ? 1 : -1];
  } else if (Math.abs(d[0]) > 0.92) {
    return [d[0] > 0 ? 1 : -1, 0, 0];
  } else if (Math.abs(d[1]) > 0.92) {
    return [0, d[1] > 0 ? 1 : -1, 0];
  }
  return [d[0], d[1], d[2]];
}

export interface RevoluteDetectionResult {
  kinematicJoints: CADKinematicJoint[];
  jointCylIds: Set<string>;
  physicalHinges: CandidateJoint[];
  connectedShellPairs: Set<string>;
}

/**
 * Detects Print-in-Place revolute hinges between different shells.
 */
export function detectRevoluteJoints(
  cylinders: CylinderSurface[],
  cylinderShellMap: Int32Array
): RevoluteDetectionResult {
  const candidateJoints: CandidateJoint[] = [];
  const physicalHinges: CandidateJoint[] = [];
  const kinematicJoints: CADKinematicJoint[] = [];
  const jointCylIds = new Set<string>();
  const connectedShellPairs = new Set<string>();

  for (let i = 0; i < cylinders.length; i++) {
    const cA = cylinders[i];
    const shellA = cylinderShellMap[i];

    for (let j = i + 1; j < cylinders.length; j++) {
      const cB = cylinders[j];
      const shellB = cylinderShellMap[j];

      // Cylinders must belong to different shells
      if (shellA !== -1 && shellB !== -1 && shellA === shellB) continue;

      // Must be Socket (internal) vs Pin (external)
      if (cA.isInternal === cB.isInternal) continue;
      const socket = cA.isInternal ? cA : cB;
      const pin = cA.isInternal ? cB : cA;

      if (pin.radius >= socket.radius) continue;

      const axisSocket = getEffectiveAxis(socket.axisDirection);
      const axisPin = getEffectiveAxis(pin.axisDirection);

      // Axis parallelism
      const dotA = axisSocket[0] * axisPin[0] +
                   axisSocket[1] * axisPin[1] +
                   axisSocket[2] * axisPin[2];
      if (Math.abs(dotA) < 0.95) continue;

      const u = axisSocket;
      const dx = pin.axisOrigin[0] - socket.axisOrigin[0];
      const dy = pin.axisOrigin[1] - socket.axisOrigin[1];
      const dz = pin.axisOrigin[2] - socket.axisOrigin[2];
      const projW = dx * u[0] + dy * u[1] + dz * u[2];

      // Axial overlap along common axis
      const minS = -socket.height * 0.5;
      const maxS = socket.height * 0.5;
      const minP = projW - pin.height * 0.5;
      const maxP = projW + pin.height * 0.5;
      const overlap = Math.min(maxS, maxP) - Math.max(minS, minP);
      if (overlap <= 0.0) continue;

      // Midpoint line-line distance
      const tMid = 0.5 * (Math.max(minS, minP) + Math.min(maxS, maxP));
      const pSocketMid: Point3D = [
        socket.axisOrigin[0] + tMid * u[0],
        socket.axisOrigin[1] + tMid * u[1],
        socket.axisOrigin[2] + tMid * u[2]
      ];
      const sign = dotA >= 0 ? 1 : -1;
      const tPin = (tMid - projW) * sign;
      const pPinMid: Point3D = [
        pin.axisOrigin[0] + tPin * axisPin[0],
        pin.axisOrigin[1] + tPin * axisPin[1],
        pin.axisOrigin[2] + tPin * axisPin[2]
      ];
      const distMid = Math.hypot(
        pSocketMid[0] - pPinMid[0],
        pSocketMid[1] - pPinMid[1],
        pSocketMid[2] - pPinMid[2]
      );

      const stepSocketRadius = parseFloat(socket.radius.toFixed(5));
      const stepPinRadius = parseFloat(pin.radius.toFixed(5));
      const radialClearance = parseFloat((stepSocketRadius - stepPinRadius).toFixed(4));

      if (distMid <= 0.65 && radialClearance >= 0.12 && radialClearance <= 2.0) {
        candidateJoints.push({
          socketId: socket.id,
          pinId: pin.id,
          shellA: shellA !== -1 ? shellA : 0,
          shellB: shellB !== -1 ? shellB : 1,
          clearanceMm: radialClearance,
          overlapMm: overlap,
          perpDistMm: distMid,
          axisOrigin: [pSocketMid[0], pSocketMid[1], pSocketMid[2]],
          axisDirection: u
        });
      }
    }
  }

  // Cluster and deduplicate along the same physical hinge line
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

  let jointCounter = 0;
  for (const h of physicalHinges) {
    jointCounter++;
    kinematicJoints.push({
      id: `pip_revolute_${jointCounter}`,
      type: 'revolute',
      measuredClearanceMm: parseFloat(h.clearanceMm.toFixed(4)),
      axisOrigin: [
        parseFloat(h.axisOrigin[0].toFixed(4)),
        parseFloat(h.axisOrigin[1].toFixed(4)),
        parseFloat(h.axisOrigin[2].toFixed(4))
      ],
      axisDirection: [
        parseFloat(h.axisDirection[0].toFixed(4)),
        parseFloat(h.axisDirection[1].toFixed(4)),
        parseFloat(h.axisDirection[2].toFixed(4))
      ]
    });
    jointCylIds.add(h.socketId);
    jointCylIds.add(h.pinId);
    const pairKey = `${Math.min(h.shellA, h.shellB)}_${Math.max(h.shellA, h.shellB)}`;
    connectedShellPairs.add(pairKey);
  }

  return {
    kinematicJoints,
    jointCylIds,
    physicalHinges,
    connectedShellPairs
  };
}
