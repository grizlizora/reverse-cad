// ==============================================================================
// src/stages/profiling/hole/hole-thread-deduplicator.ts — Hole & Thread Deduplicator
// ==============================================================================

import { RawMesh, PlaneSurface } from '../../../types/geometry.js';
import { CADHole, CADThread } from '../../../types/features.js';
import { matchTappedHolePair } from '../../../standards/thread-catalog.js';
import { STATIC_ISO_METRIC_THREADS } from '../../../standards/thread/iso-thread-data.js';
import { isCoaxialFeature, deduplicateThreads } from '../coaxial-analyzer.js';
import { filterPhysicallyValidHoles } from './hole-geometry-validator.js';

export interface FinalProfilingFeatures {
  finalHoles: CADHole[];
  finalThreads: CADThread[];
}

/**
 * Deduplicates and validates candidate holes and threads against geometric boundary interfaces.
 */
export function validateAndDeduplicateHoles(
  holes: CADHole[],
  threads: CADThread[],
  mesh: RawMesh,
  majorPlanes: PlaneSurface[]
): FinalProfilingFeatures {
  const uniqueThreads = deduplicateThreads(threads);
  const uniqueHoles: CADHole[] = [];

  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    const existing = uniqueHoles.find(u =>
      isCoaxialFeature(h.axisOrigin, h.axisDirection, u.axisOrigin, u.axisDirection)
    );
    if (!existing) {
      uniqueHoles.push({ ...h });
    } else {
      existing.depth = Math.max(existing.depth, h.depth);

      if (h.isThreaded && existing.isThreaded) {
        if (h.diameter > existing.diameter) {
          existing.threadSpec = h.threadSpec;
          existing.diameter = h.diameter;
          existing.axisOrigin = h.axisOrigin;
          existing.axisDirection = h.axisDirection;
        }
      } else if (h.isThreaded && !existing.isThreaded) {
        existing.isThreaded = true;
        existing.threadSpec = h.threadSpec;
        existing.diameter = h.diameter;
        existing.axisOrigin = h.axisOrigin;
        existing.axisDirection = h.axisDirection;
      } else if (!h.isThreaded && !existing.isThreaded) {
        const diaSmaller = Math.min(existing.diameter, h.diameter);
        const diaLarger = Math.max(existing.diameter, h.diameter);
        const pairMatch = (diaLarger - diaSmaller > 0.35 && diaLarger - diaSmaller < 6.5)
          ? matchTappedHolePair(diaSmaller, diaLarger)
          : null;

        if (pairMatch) {
          existing.isThreaded = true;
          existing.threadSpec = pairMatch.designation;
          existing.diameter = pairMatch.tapDrillDiameter;
        }
      }
    }
  }

  const validHoles = filterPhysicallyValidHoles(uniqueHoles, mesh, majorPlanes);

  validHoles.sort((a, b) => {
    if (Math.abs(a.axisOrigin[2] - b.axisOrigin[2]) > 2.0) {
      return a.axisOrigin[2] - b.axisOrigin[2];
    }
    return a.axisOrigin[0] - b.axisOrigin[0];
  });

  validHoles.forEach((h, idx) => {
    h.id = `hole_${idx + 1}`;
  });

  const finalThreads: CADThread[] = [];
  let threadIdx = 0;

  // 1. Add threads derived from valid holes
  for (let i = 0; i < validHoles.length; i++) {
    const h = validHoles[i];
    if (!h.isThreaded || !h.threadSpec) continue;

    const parts = h.threadSpec.match(/^M(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?/);
    const nomDia = parts ? parseFloat(parts[1]) : 10;
    
    // Look up exact standard pitch if not specified in regex
    let pitch = parts && parts[2] ? parseFloat(parts[2]) : undefined;
    if (pitch === undefined) {
      const specMatch = STATIC_ISO_METRIC_THREADS.find(s => Math.abs(s.nominalDiameter - nomDia) < 0.05);
      pitch = specMatch ? specMatch.pitch : 1.5;
    }

    finalThreads.push({
      id: `thread_${++threadIdx}`,
      isInternal: true,
      standard: 'ISO_METRIC',
      designation: h.threadSpec,
      nominalDiameter: nomDia,
      tapDrillDiameter: h.diameter,
      pitch,
      threadDepth: h.depth,
      starts: 1,
      hand: 'right',
      axisOrigin: h.axisOrigin,
      axisDirection: h.axisDirection,
      radialFdmOffsetApplied: 0.0
    });
  }

  // 2. Retain external threads (studs / bosses)
  const externalThreads = uniqueThreads.filter(t => !t.isInternal);
  for (let i = 0; i < externalThreads.length; i++) {
    const extT = externalThreads[i];
    finalThreads.push({
      ...extT,
      id: `thread_${++threadIdx}`
    });
  }

  return { finalHoles: validHoles, finalThreads };
}
