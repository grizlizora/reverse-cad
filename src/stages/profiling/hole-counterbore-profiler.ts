// ==============================================================================
// src/stages/profiling/hole-counterbore-profiler.ts — Hole & Counterbore Profiler Façade
// ==============================================================================

import { RawMesh, SurfacePrimitive, CylinderSurface, PlaneSurface } from '../../types/geometry.js';
import { CADHole, CADThread } from '../../types/features.js';
import { isCoaxialFeature } from './coaxial-analyzer.js';
import { matchCoaxialHolePairs } from './hole/coaxial-hole-matcher.js';
import { extractSingleCylinders } from './hole/single-hole-extractor.js';
import { validateAndDeduplicateHoles } from './hole/hole-thread-deduplicator.js';

export { isCoaxialFeature, validateAndDeduplicateHoles };

export interface HoleProfilingOptions {
  inferTapDrillThreads?: boolean;
  detectHelicalThreads?: boolean;
}

export interface HoleExtractionResult {
  holes: CADHole[];
  threads: CADThread[];
}

/**
 * Profiles internal cylinders into through holes, blind holes, counterbores, and threaded holes.
 */
export function profileHolesAndThreads(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  isHingeAssociatedCylinder: (c: CylinderSurface) => boolean,
  options: HoleProfilingOptions = {}
): HoleExtractionResult {
  const inferTapDrill = options.inferTapDrillThreads ?? true;
  const checkHelical = options.detectHelicalThreads ?? true;

  const allCylinders = surfaces.filter((s): s is CylinderSurface => s.type === 'cylinder');
  const maxPartDim = Math.max(...mesh.boundingBox.dimensions);

  const fullCylinders = allCylinders.filter(c => {
    if (c.subType === 'fillet') return false;
    if (c.subType !== 'full_cylinder' && (c.angularSpanRad === undefined || c.angularSpanRad < (280 * Math.PI / 180))) return false;
    if (c.radius * 2.0 > maxPartDim * 0.95) return false;
    return true;
  });

  const internalFullCylinders = fullCylinders.filter(c => c.isInternal && !isHingeAssociatedCylinder(c));
  const internalCandidateCylinders = allCylinders.filter(c => c.isInternal && c.subType !== 'fillet' && !isHingeAssociatedCylinder(c));

  // 1. Detect Counterbore and coaxial through-hole pairs
  const coaxialRes = matchCoaxialHolePairs(internalFullCylinders, internalCandidateCylinders, 0, 0);

  // 2. Extract remaining single internal & external cylinders
  const externalFullCylinders = fullCylinders.filter(c => !c.isInternal && !isHingeAssociatedCylinder(c));
  const singleRes = extractSingleCylinders(
    mesh,
    internalFullCylinders,
    externalFullCylinders,
    coaxialRes.processedCylIds,
    coaxialRes.holes.length,
    coaxialRes.threads.length,
    inferTapDrill,
    checkHelical
  );

  const holes = [...coaxialRes.holes, ...singleRes.holes];
  const threads = [...coaxialRes.threads, ...singleRes.threads];

  return { holes, threads };
}
