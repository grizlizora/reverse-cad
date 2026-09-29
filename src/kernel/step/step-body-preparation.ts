// ==============================================================================
// src/kernel/step/step-body-preparation.ts — Solid Body, Vertex & Thread Prep
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../../types/geometry.js';
import { classifySolidBodies } from '../../utils/body-classifier.js';
import { resolveBodyMaterials } from '../../standards/material-assignment.js';
import { SolidBodyConfig, StepWriterOptions } from './step-types.js';
import { quantizeStepFloat } from './step-orthonormal-basis.js';
import {
  type PrecomputedShellTopology,
  executeShellSemanticPrepass
} from './step-shell-prepass.js';

export type { PrecomputedShellTopology } from './step-shell-prepass.js';

export interface PreparedStepBodies {
  targetShells: MeshShell[];
  cavityShells: MeshShell[];
  bodyDefinitions: SolidBodyConfig[];
  stepVerticesX: Float64Array;
  stepVerticesY: Float64Array;
  stepVerticesZ: Float64Array;
  usedVertices: Uint8Array;
  precomputedShells: Map<number, PrecomputedShellTopology>;
}

/**
 * Resolves solid shells and cavities, assigns kinematic roles and materials,
 * quantizes vertices once with zero string allocations, and delegates
 * coplanar clusters and semantic through-hole absorption to executeShellSemanticPrepass.
 */
export function prepareStepSolidBodies(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  options: StepWriterOptions = {},
  shells?: MeshShell[]
): PreparedStepBodies {
  const rawShells = options.shells ?? shells;
  let targetShells: MeshShell[] = [];
  let cavityShells: MeshShell[] = [];

  if (rawShells && rawShells.length > 0) {
    targetShells = rawShells.filter(s => !s.isCavity && s.triangleIndices.length > 0);
    cavityShells = rawShells.filter(s => s.isCavity && s.triangleIndices.length > 0);
  }

  if (targetShells.length === 0 && mesh.triangleCount > 0) {
    const allTris = new Array<number>(mesh.triangleCount);
    for (let i = 0; i < mesh.triangleCount; i++) allTris[i] = i;
    targetShells = [{
      shellIndex: 0,
      triangleIndices: allTris,
      signedVolume: 1.0,
      surfaceArea: 1.0,
      isCavity: false,
      boundingBox: mesh.boundingBox
    }];
  }

  const classified = classifySolidBodies(targetShells, options.kinematicJoints);
  if (classified.length > 0) targetShells = classified.map(c => c.shell);

  const bodyDefinitions: SolidBodyConfig[] =
    options.bodyConfigs && options.bodyConfigs.length === targetShells.length
      ? options.bodyConfigs
      : resolveBodyMaterials(targetShells, classified, options.material);

  const vertexCount = mesh.vertexCount;
  const positions = mesh.positions;
  const indices = mesh.indices;
  const stepVerticesX = new Float64Array(vertexCount);
  const stepVerticesY = new Float64Array(vertexCount);
  const stepVerticesZ = new Float64Array(vertexCount);

  for (let i = 0; i < vertexCount; i++) {
    const i3 = i * 3;
    stepVerticesX[i] = quantizeStepFloat(positions[i3], 5);
    stepVerticesY[i] = quantizeStepFloat(positions[i3 + 1], 5);
    stepVerticesZ[i] = quantizeStepFloat(positions[i3 + 2], 5);
  }

  let absorbedTris: Uint8Array = new Uint8Array(mesh.triangleCount);
  let precomputedShells = new Map<number, PrecomputedShellTopology>();

  if (options.threadMode === 'semantic') {
    const prepass = executeShellSemanticPrepass(
      surfaces,
      targetShells,
      mesh,
      stepVerticesX,
      stepVerticesY,
      stepVerticesZ
    );
    absorbedTris = prepass.absorbedTris;
    precomputedShells = prepass.precomputedShells;
  }

  const usedVertices = new Uint8Array(vertexCount);
  for (let sIdx = 0; sIdx < targetShells.length; sIdx++) {
    const shTris = targetShells[sIdx].triangleIndices;
    for (let k = 0; k < shTris.length; k++) {
      const t = shTris[k];
      if (absorbedTris[t]) continue;
      const t3 = t * 3;
      usedVertices[indices[t3]] = 1;
      usedVertices[indices[t3 + 1]] = 1;
      usedVertices[indices[t3 + 2]] = 1;
    }
    const pre = precomputedShells.get(sIdx);
    if (pre?.matchedHoles) {
      for (const mh of pre.matchedHoles) {
        for (let i = 0; i < mh.topLoop.length; i++) usedVertices[mh.topLoop[i]] = 1;
        for (let i = 0; i < mh.botLoop.length; i++) usedVertices[mh.botLoop[i]] = 1;
      }
    }
  }

  for (let cIdx = 0; cIdx < cavityShells.length; cIdx++) {
    const cTris = cavityShells[cIdx].triangleIndices;
    for (let k = 0; k < cTris.length; k++) {
      const t3 = cTris[k] * 3;
      usedVertices[indices[t3]] = 1;
      usedVertices[indices[t3 + 1]] = 1;
      usedVertices[indices[t3 + 2]] = 1;
    }
  }

  return {
    targetShells,
    cavityShells,
    bodyDefinitions,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ,
    usedVertices,
    precomputedShells
  };
}
