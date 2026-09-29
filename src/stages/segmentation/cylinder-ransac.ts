// ==============================================================================
// src/stages/segmentation/cylinder-ransac.ts — Façade for Localized Cylinder RANSAC
// ==============================================================================

import { CylinderSurface } from '../../types/geometry.js';
import { CylinderRansacContext, extractCylindersRANSACInternal } from './cylinder-ransac-coordinator.js';
import { pickRandomUnassigned, pickLocalizedNeighborBuffers } from './cylinder-sampler.js';

export type { CylinderRansacContext };
export { pickRandomUnassigned, pickLocalizedNeighborBuffers };

/**
 * Backward-compatible entry point for cylindrical surface primitive extraction via localized RANSAC.
 * Delegates to the optimized cylinder-ransac-coordinator.
 */
export function extractCylindersRANSAC(
  ctx: CylinderRansacContext,
  initialUnassignedCount: number,
  idGenerator: () => string
): { cylinders: CylinderSurface[]; remainingUnassignedCount: number } {
  return extractCylindersRANSACInternal(ctx, initialUnassignedCount, idGenerator);
}
