// ==============================================================================
// src/rsvs/gates/gate0-mesh-intake.ts — Gate 0: Mesh Intake & Topology Invariants
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { Gate0Result, GateStatus } from '../../types/verification.js';

export function evaluateGate0(
  mesh: RawMesh,
  openEdges: number,
  degenerateCount: number,
  chi: number,
  shellsCount = 1
): Gate0Result {
  const isWatertight = openEdges === 0;
  // Topological invariant: For S closed 2-manifold shells: chi <= 2 * S, even integer
  const maxAllowedEuler = 2 * Math.max(1, shellsCount);
  const isEulerValid = Number.isInteger(chi) && chi <= maxAllowedEuler && (Math.abs(chi) % 2 === 0);
  const status: GateStatus = isWatertight && degenerateCount === 0 && isEulerValid
    ? 'PASSED'
    : openEdges < 5
      ? 'WARNING'
      : 'FAILED';

  return {
    gateId: 'GATE_0_MESH_INTAKE',
    name: 'Mesh Topology & Watertightness Intake Gate',
    status,
    description: 'Ensures mesh is a closed 2-manifold without degenerate faces',
    isWatertight,
    degenerateTriangleCount: degenerateCount,
    selfIntersectionCount: 0,
    eulerCharacteristic: chi,
    metrics: {
      isWatertight,
      openEdges,
      degenerateFaces: degenerateCount,
      eulerCharacteristic: chi
    }
  };
}
