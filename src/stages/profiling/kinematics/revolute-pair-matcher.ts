// ==============================================================================
// src/stages/profiling/kinematics/revolute-pair-matcher.ts — Pure Revolute Pair Matcher
// ==============================================================================

import { CylinderSurface, Vector3D } from '../../../types/geometry.js';
import { CandidateJoint } from './kinematic-dto.js';

export interface CylinderPairCandidate {
  socket: CylinderSurface;
  pin: CylinderSurface;
  shellA: number;
  shellB: number;
  axisSocket: Vector3D;
  axisPin: Vector3D;
}

/**
 * Fast zero-allocation 4-decimal places rounding with IEEE 754 epsilon safeguard.
 */
export function fastRound4(val: number): number {
  return Math.round((val + 1e-12) * 10000) / 10000;
}

/**
 * Pure, stateless geometric evaluator checking if two cylinders form a revolute pair.
 * Zero heap allocations on negative checks.
 */
export function matchRevolutePair(c: CylinderPairCandidate): CandidateJoint | null {
  const { socket, pin, shellA, shellB, axisSocket, axisPin } = c;

  if (pin.radius >= socket.radius) return null;

  // 1. Common axis parallelism check
  const dotA = axisSocket[0] * axisPin[0] +
               axisSocket[1] * axisPin[1] +
               axisSocket[2] * axisPin[2];
  if (Math.abs(dotA) < 0.95) return null;

  // 2. Axial projection and overlap along socket axis
  const dx = pin.axisOrigin[0] - socket.axisOrigin[0];
  const dy = pin.axisOrigin[1] - socket.axisOrigin[1];
  const dz = pin.axisOrigin[2] - socket.axisOrigin[2];
  const projW = dx * axisSocket[0] + dy * axisSocket[1] + dz * axisSocket[2];

  const minS = -socket.height * 0.5;
  const maxS = socket.height * 0.5;
  const minP = projW - pin.height * 0.5;
  const maxP = projW + pin.height * 0.5;

  const overlap = Math.min(maxS, maxP) - Math.max(minS, minP);
  if (overlap <= 0.0) return null;

  // 3. Scalar line-to-line midpoint distance (Zero Point3D Array Allocation!)
  const tMid = 0.5 * (Math.max(minS, minP) + Math.min(maxS, maxP));
  const sign = dotA >= 0 ? 1 : -1;
  const tPin = (tMid - projW) * sign;

  const pSockX = socket.axisOrigin[0] + tMid * axisSocket[0];
  const pSockY = socket.axisOrigin[1] + tMid * axisSocket[1];
  const pSockZ = socket.axisOrigin[2] + tMid * axisSocket[2];

  const pPinX = pin.axisOrigin[0] + tPin * axisPin[0];
  const pPinY = pin.axisOrigin[1] + tPin * axisPin[1];
  const pPinZ = pin.axisOrigin[2] + tPin * axisPin[2];

  const diffX = pSockX - pPinX;
  const diffY = pSockY - pPinY;
  const diffZ = pSockZ - pPinZ;
  const distMid = Math.sqrt(diffX * diffX + diffY * diffY + diffZ * diffZ);

  // 4. Zero-allocation FPU radial clearance calculation
  const radialClearance = fastRound4(socket.radius - pin.radius);

  // Print-in-Place physical gap validation
  if (distMid <= 0.65 && radialClearance >= 0.12 && radialClearance <= 2.0) {
    return {
      socketId: socket.id,
      pinId: pin.id,
      shellA: shellA !== -1 ? shellA : 0,
      shellB: shellB !== -1 ? shellB : 1,
      clearanceMm: radialClearance,
      overlapMm: fastRound4(overlap),
      perpDistMm: fastRound4(distMid),
      axisOrigin: [pSockX, pSockY, pSockZ],
      axisDirection: axisSocket
    };
  }

  return null;
}
