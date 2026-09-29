// ==============================================================================
// src/kernel/step/revolution/revolution-surface-entity-builder.ts — Analytical Revolution Entity Builder
// Emits ISO 10303-42 CYLINDRICAL_SURFACE and CONICAL_SURFACE canonical STEP entities.
// ==============================================================================

import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import { RevolutionFeatureZone } from './revolution-zband-analyzer.js';
import { Vector3D } from '../../../types/geometry.js';

export interface RevolutionSurfaceContext {
  surfaceStepId: string;
  dirZ: Vector3D;
  dirX: Vector3D;
  dirNegX: Vector3D;
}

/**
 * Creates or retrieves the analytical STEP surface entity (CYLINDRICAL_SURFACE or CONICAL_SURFACE).
 */
export function getOrCreateRevolutionSurfaceEntity(
  allocator: StepIdAllocator,
  zone: RevolutionFeatureZone,
  surfaceToStepId?: Map<string, string>
): { context: RevolutionSurfaceContext | null; stepBuffer: string } {
  const O = zone.axisOrigin;
  const D = zone.axisDirection;
  const lenD = Math.hypot(D[0], D[1], D[2]);
  if (lenD < 1e-6) return { context: null, stepBuffer: '' };

  const dirNorm: Vector3D = [D[0] / lenD, D[1] / lenD, D[2] / lenD];
  const basis = computeOrthonormalBasis(dirNorm);
  const Z = basis.dirZ;
  const X = basis.dirX;
  const negX: Vector3D = [-X[0], -X[1], -X[2]];
  const R = zone.radius;
  if (R <= 1e-4) return { context: null, stepBuffer: '' };

  let stepBuffer = '';
  let surfaceStepId = surfaceToStepId?.get(zone.surfaceId);

  if (!surfaceStepId) {
    const ptOriginId = allocator.nextId();
    stepBuffer += `${ptOriginId} = CARTESIAN_POINT('', (${formatStepFloat(O[0])}, ${formatStepFloat(O[1])}, ${formatStepFloat(O[2])}));\n`;
    const dirZId = allocator.nextId();
    stepBuffer += `${dirZId} = DIRECTION('', (${formatStepFloat(Z[0])}, ${formatStepFloat(Z[1])}, ${formatStepFloat(Z[2])}));\n`;
    const dirXId = allocator.nextId();
    stepBuffer += `${dirXId} = DIRECTION('', (${formatStepFloat(X[0])}, ${formatStepFloat(X[1])}, ${formatStepFloat(X[2])}));\n`;
    const axPlacement = allocator.nextId();
    stepBuffer += `${axPlacement} = AXIS2_PLACEMENT_3D('', ${ptOriginId}, ${dirZId}, ${dirXId});\n`;

    surfaceStepId = allocator.nextId();
    if (zone.type === 'cone') {
      // Conical surface default semi-angle (default 45 deg if uncalibrated)
      const semiAngleRad = Math.PI / 4;
      stepBuffer += `${surfaceStepId} = CONICAL_SURFACE('${zone.surfaceId}', ${axPlacement}, ${formatStepFloat(R)}, ${formatStepFloat(semiAngleRad)});\n`;
    } else {
      stepBuffer += `${surfaceStepId} = CYLINDRICAL_SURFACE('${zone.surfaceId}', ${axPlacement}, ${formatStepFloat(R)});\n`;
    }

    if (surfaceToStepId) {
      surfaceToStepId.set(zone.surfaceId, surfaceStepId);
    }
  }

  return {
    context: {
      surfaceStepId,
      dirZ: Z,
      dirX: X,
      dirNegX: negX
    },
    stepBuffer
  };
}

/**
 * Filters zone inlier triangles that fall within a specific Z height band.
 */
export function filterBandTriangles(
  zone: RevolutionFeatureZone,
  z0: number,
  z1: number,
  positions?: Float32Array | number[],
  indices?: Uint32Array | number[]
): number[] {
  const result: number[] = [];
  const O = zone.axisOrigin;
  const Z = zone.axisDirection;
  const lenZ = Math.hypot(Z[0], Z[1], Z[2]);
  const normZ = lenZ > 1e-9 ? [Z[0] / lenZ, Z[1] / lenZ, Z[2] / lenZ] : [0, 0, 1];

  if (!positions || !indices) {
    return Array.from(zone.inlierTriangles);
  }

  for (const t of zone.inlierTriangles) {
    const t3 = t * 3;
    let inBand = true;
    for (let j = 0; j < 3; j++) {
      const v = indices[t3 + j];
      const px = positions[v * 3], py = positions[v * 3 + 1], pz = positions[v * 3 + 2];
      const proj = (px - O[0]) * normZ[0] + (py - O[1]) * normZ[1] + (pz - O[2]) * normZ[2];
      if (proj < z0 - 0.1 || proj > z1 + 0.1) {
        inBand = false;
        break;
      }
    }
    if (inBand) {
      result.push(t);
    }
  }

  return result;
}
