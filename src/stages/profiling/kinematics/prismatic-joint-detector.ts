// ==============================================================================
// src/stages/profiling/kinematics/prismatic-joint-detector.ts — Prismatic Slider Detector
// ==============================================================================

import { MeshShell, Vector3D } from '../../../types/geometry.js';
import { CADKinematicJoint } from '../../../types/features.js';

/**
 * Detects prismatic linear sliding joints across adjacent shells.
 */
export function detectPrismaticJoints(
  outerShells: MeshShell[],
  connectedShellPairs: Set<string>,
  startCounter: number
): CADKinematicJoint[] {
  const prismaticJoints: CADKinematicJoint[] = [];
  let counter = startCounter;

  for (let i = 0; i < outerShells.length; i++) {
    for (let j = i + 1; j < outerShells.length; j++) {
      const sA = outerShells[i].shellIndex;
      const sB = outerShells[j].shellIndex;
      const pairKey = `${Math.min(sA, sB)}_${Math.max(sA, sB)}`;

      if (connectedShellPairs.has(pairKey)) continue;

      const bA = outerShells[i].boundingBox;
      const bB = outerShells[j].boundingBox;

      const gapX = Math.max(0, Math.max(bA.min[0] - bB.max[0], bB.min[0] - bA.max[0]));
      const gapY = Math.max(0, Math.max(bA.min[1] - bB.max[1], bB.min[1] - bA.max[1]));
      const gapZ = Math.max(0, Math.max(bA.min[2] - bB.max[2], bB.min[2] - bA.max[2]));

      const nonZeroGaps = [gapX, gapY, gapZ].filter(g => g > 0.05);

      if (nonZeroGaps.length === 1 && nonZeroGaps[0] >= 0.10 && nonZeroGaps[0] <= 3.0) {
        const gap = nonZeroGaps[0];
        const slideAxis: Vector3D = gapX > 0.05 ? [1, 0, 0] : gapY > 0.05 ? [0, 1, 0] : [0, 0, 1];
        prismaticJoints.push({
          id: `pip_prismatic_${++counter}`,
          type: 'prismatic',
          measuredClearanceMm: parseFloat(gap.toFixed(3)),
          axisOrigin: [
            parseFloat(((bA.center[0] + bB.center[0]) * 0.5).toFixed(2)),
            parseFloat(((bA.center[1] + bB.center[1]) * 0.5).toFixed(2)),
            parseFloat(((bA.center[2] + bB.center[2]) * 0.5).toFixed(2))
          ],
          axisDirection: slideAxis
        });
        connectedShellPairs.add(pairKey);
      }
    }
  }

  return prismaticJoints;
}
