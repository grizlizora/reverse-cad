// ==============================================================================
// src/stages/profiling/hole/single-hole-extractor.ts — Single Hole & Stud Extractor
// ==============================================================================

import { RawMesh, CylinderSurface } from '../../../types/geometry.js';
import { CADHole, CADThread } from '../../../types/features.js';
import { matchMetricThread, ISOThreadSpec } from '../../../standards/thread-catalog.js';
import { detectHelicalThread, HelicalDetectionResult } from '../thread-helical-detector.js';

export interface SingleExtractionResult {
  holes: CADHole[];
  threads: CADThread[];
}

/**
 * Extracts single internal and external cylindrical features (holes, threads, bosses).
 */
export function extractSingleCylinders(
  mesh: RawMesh,
  internalFullCylinders: CylinderSurface[],
  externalFullCylinders: CylinderSurface[],
  processedCylIds: Set<string>,
  startHoleCount: number,
  startThreadCount: number,
  inferTapDrill: boolean,
  checkHelical: boolean
): SingleExtractionResult {
  const holes: CADHole[] = [];
  const threads: CADThread[] = [];

  let holeCounter = startHoleCount;
  let threadCounter = startThreadCount;

  // 1. Remaining single internal cylinders
  for (let i = 0; i < internalFullCylinders.length; i++) {
    const cyl = internalFullCylinders[i];
    if (processedCylIds.has(cyl.id)) continue;

    const diameter = cyl.radius * 2.0;
    let matchedThread: HelicalDetectionResult | null = null;
    let catalogThread: ISOThreadSpec | null = null;

    if (checkHelical) {
      matchedThread = detectHelicalThread(mesh, cyl);
    }

    const aspectDepthRatio = cyl.height / Math.max(0.1, diameter);
    if (!matchedThread && inferTapDrill && aspectDepthRatio >= 0.35) {
      catalogThread = matchMetricThread(diameter, true, 0.45);
    }

    const isThreaded = matchedThread !== null || catalogThread !== null;
    const effectiveSpec = matchedThread || catalogThread;
    const threadSpec = effectiveSpec ? effectiveSpec.designation : undefined;
    const holeDia = effectiveSpec ? Math.min(diameter, effectiveSpec.tapDrillDiameter) : diameter;

    holes.push({
      id: `hole_${++holeCounter}`,
      type: 'through',
      diameter: parseFloat(holeDia.toFixed(2)),
      depth: parseFloat(cyl.height.toFixed(2)),
      axisOrigin: cyl.axisOrigin,
      axisDirection: cyl.axisDirection,
      isThreaded,
      threadSpec
    });

    if (matchedThread) {
      threads.push({
        id: `thread_${++threadCounter}`,
        isInternal: true,
        standard: 'ISO_METRIC',
        designation: matchedThread.designation,
        nominalDiameter: matchedThread.nominalDiameter,
        tapDrillDiameter: matchedThread.tapDrillDiameter,
        pitch: matchedThread.pitch,
        threadDepth: cyl.height,
        starts: 1,
        hand: 'right',
        axisOrigin: cyl.axisOrigin,
        axisDirection: cyl.axisDirection,
        radialFdmOffsetApplied: 0.0
      });
    } else if (catalogThread) {
      threads.push({
        id: `thread_${++threadCounter}`,
        isInternal: true,
        standard: 'ISO_METRIC',
        designation: catalogThread.designation,
        nominalDiameter: catalogThread.nominalDiameter,
        tapDrillDiameter: catalogThread.tapDrillDiameter,
        pitch: catalogThread.pitch,
        threadDepth: cyl.height,
        starts: 1,
        hand: 'right',
        axisOrigin: cyl.axisOrigin,
        axisDirection: cyl.axisDirection,
        radialFdmOffsetApplied: 0.0
      });
    }
  }

  // 2. External Full Cylinders (Helical Studs / Bosses)
  for (let i = 0; i < externalFullCylinders.length; i++) {
    const cyl = externalFullCylinders[i];
    if (processedCylIds.has(cyl.id)) continue;

    if (checkHelical) {
      const extHelical = detectHelicalThread(mesh, cyl);
      if (extHelical) {
        threads.push({
          id: `thread_${++threadCounter}`,
          isInternal: false,
          standard: 'ISO_METRIC',
          designation: extHelical.designation,
          nominalDiameter: extHelical.nominalDiameter,
          tapDrillDiameter: extHelical.tapDrillDiameter,
          pitch: extHelical.pitch,
          threadDepth: cyl.height,
          starts: 1,
          hand: 'right',
          axisOrigin: cyl.axisOrigin,
          axisDirection: cyl.axisDirection,
          radialFdmOffsetApplied: 0.0
        });
      }
    }
  }

  return { holes, threads };
}
