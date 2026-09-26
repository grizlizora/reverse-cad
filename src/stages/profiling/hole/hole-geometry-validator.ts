// ==============================================================================
// src/stages/profiling/hole/hole-geometry-validator.ts — Physical Hole Validator
// ==============================================================================

import { RawMesh, PlaneSurface } from '../../../types/geometry.js';
import { CADHole } from '../../../types/features.js';

/**
 * Validates holes against physical part boundaries, wall thicknesses, and coordinate limits.
 */
export function filterPhysicallyValidHoles(
  holes: CADHole[],
  mesh: RawMesh,
  majorPlanes: PlaneSurface[]
): CADHole[] {
  const bbox = mesh.boundingBox;
  const dims = bbox.dimensions;
  const maxPartDim = Math.max(...dims);

  return holes.filter(h => {
    let alignsWithPrincipalOrFace = false;
    const ax = h.axisDirection[0], ay = h.axisDirection[1], az = h.axisDirection[2];

    if (Math.abs(ax) >= 0.80 || Math.abs(ay) >= 0.80 || Math.abs(az) >= 0.80) {
      alignsWithPrincipalOrFace = true;
    } else {
      for (let pIdx = 0; pIdx < majorPlanes.length; pIdx++) {
        const pl = majorPlanes[pIdx];
        const dotFace = Math.abs(ax * pl.normal[0] + ay * pl.normal[1] + az * pl.normal[2]);
        if (dotFace >= 0.80) {
          alignsWithPrincipalOrFace = true;
          break;
        }
      }
    }

    // Accept angled holes if physical depth and radius are well-defined
    if (!alignsWithPrincipalOrFace && (h.depth < 2.0 || h.diameter < 1.0)) {
      return false;
    }

    const inX = h.axisOrigin[0] >= bbox.min[0] - 2.0 && h.axisOrigin[0] <= bbox.max[0] + 2.0;
    const inY = h.axisOrigin[1] >= bbox.min[1] - 2.0 && h.axisOrigin[1] <= bbox.max[1] + 2.0;
    const inZ = h.axisOrigin[2] >= bbox.min[2] - 2.0 && h.axisOrigin[2] <= bbox.max[2] + 2.0;
    if (!inX || !inY || !inZ) return false;

    const thicknessAlongAxis = Math.abs(h.axisDirection[0]) * dims[0] +
                               Math.abs(h.axisDirection[1]) * dims[1] +
                               Math.abs(h.axisDirection[2]) * dims[2];
    if (h.depth > thicknessAlongAxis * 1.35) return false;

    // Minimum physical depth (at least 0.8mm)
    if (h.depth < 0.8) return false;

    // Hole diameter must be physically realistic (0.5mm <= D <= maxPartDim * 0.95)
    if (h.diameter < 0.5 || h.diameter > maxPartDim * 0.95) return false;

    return true;
  });
}
