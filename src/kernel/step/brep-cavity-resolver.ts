// ==============================================================================
// src/kernel/step/brep-cavity-resolver.ts — Internal Cavity Void Shell Synthesizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { StepFaceEmitter } from './step-face-emitter.js';
import { computeShellMetrics, ShellMetricResult } from './brep-mesh-metrics.js';

/**
 * Assigns each internal cavity shell to its unique smallest-volume enclosing outer shell,
 * preventing duplicate void assignment in multi-body or nested assemblies.
 */
export function assignCavitiesToBodies(
  targetShells: MeshShell[],
  cavityShells: MeshShell[]
): Map<number, MeshShell[]> {
  const assignedByBody = new Map<number, MeshShell[]>();
  if (!cavityShells || cavityShells.length === 0 || targetShells.length === 0) {
    return assignedByBody;
  }

  for (let c = 0; c < cavityShells.length; c++) {
    const cav = cavityShells[c];
    if (!cav.triangleIndices || cav.triangleIndices.length === 0) continue;

    let bestBodyIdx = -1;
    let bestOuterVol = Infinity;

    for (let b = 0; b < targetShells.length; b++) {
      const shell = targetShells[b];
      if (
        cav.boundingBox.min[0] >= shell.boundingBox.min[0] - 1e-3 &&
        cav.boundingBox.max[0] <= shell.boundingBox.max[0] + 1e-3 &&
        cav.boundingBox.min[1] >= shell.boundingBox.min[1] - 1e-3 &&
        cav.boundingBox.max[1] <= shell.boundingBox.max[1] + 1e-3 &&
        cav.boundingBox.min[2] >= shell.boundingBox.min[2] - 1e-3 &&
        cav.boundingBox.max[2] <= shell.boundingBox.max[2] + 1e-3
      ) {
        const outerVol = Math.abs(shell.signedVolume) || Infinity;
        if (outerVol < bestOuterVol) {
          bestOuterVol = outerVol;
          bestBodyIdx = b;
        }
      }
    }

    if (bestBodyIdx !== -1) {
      let list = assignedByBody.get(bestBodyIdx);
      if (!list) {
        list = [];
        assignedByBody.set(bestBodyIdx, list);
      }
      list.push(cav);
    }
  }

  return assignedByBody;
}

/**
 * Adjusts outer shell metrics by subtracting enclosed cavity volumes and adding cavity surface areas.
 */
export function adjustMetricsForCavities(
  outerMetrics: ShellMetricResult,
  assignedCavities: MeshShell[] | undefined,
  mesh: RawMesh,
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array
): ShellMetricResult {
  if (!assignedCavities || assignedCavities.length === 0) {
    return outerMetrics;
  }

  let voidVol = 0;
  let voidArea = 0;
  for (let i = 0; i < assignedCavities.length; i++) {
    const cavMetrics = computeShellMetrics(
      mesh,
      assignedCavities[i].triangleIndices,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ
    );
    voidVol += cavMetrics.volumeMm3;
    voidArea += cavMetrics.surfaceAreaMm2;
  }

  return {
    ...outerMetrics,
    volumeMm3: Math.max(0, outerMetrics.volumeMm3 - voidVol),
    surfaceAreaMm2: outerMetrics.surfaceAreaMm2 + voidArea
  };
}

/**
 * Synthesizes CLOSED_SHELL entities for all cavities assigned to a specific outer body.
 */
export async function synthesizeBodyCavityShells(
  assignedCavities: MeshShell[] | undefined,
  indices: Uint32Array,
  surfaceMapping: SurfaceStepMapping,
  emitter: StepFaceEmitter
): Promise<string[]> {
  const internalCavityShellIds: string[] = [];
  if (!assignedCavities || assignedCavities.length === 0) {
    return internalCavityShellIds;
  }

  for (let c = 0; c < assignedCavities.length; c++) {
    const cav = assignedCavities[c];
    const cavFaceIds: string[] = [];
    for (let k = 0; k < cav.triangleIndices.length; k++) {
      const t = cav.triangleIndices[k];
      const t3 = t * 3;
      const cavPlaneId = await surfaceMapping.getOrCreateFacetPlane(t);
      const fid = await emitter.emitTriangleFace(
        indices[t3],
        indices[t3 + 1],
        indices[t3 + 2],
        cavPlaneId,
        false
      );
      cavFaceIds.push(fid);
    }
    if (cavFaceIds.length > 0) {
      const cavClosedShellId = await emitter.emitClosedShell(cavFaceIds);
      internalCavityShellIds.push(cavClosedShellId);
    }
  }

  return internalCavityShellIds;
}
