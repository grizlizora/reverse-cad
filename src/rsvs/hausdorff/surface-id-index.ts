// ==============================================================================
// src/rsvs/hausdorff/surface-id-index.ts — Zero-GC Surface Lookup Index
// ==============================================================================

import { SurfacePrimitive } from '../../types/geometry.js';

export class SurfaceLookupIndex {
  public readonly triToSurfaceId: Int32Array;
  public readonly surfaces: SurfacePrimitive[];

  constructor(surfaces: SurfacePrimitive[], triangleCount: number) {
    this.surfaces = surfaces;
    this.triToSurfaceId = new Int32Array(triangleCount).fill(-1);

    for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
      const inliers = surfaces[sIdx].inlierIndices;
      if (inliers) {
        for (let i = 0; i < inliers.length; i++) {
          const t = inliers[i];
          if (t >= 0 && t < triangleCount) {
            this.triToSurfaceId[t] = sIdx;
          }
        }
      }
    }
  }

  public getSurface(triangleIndex: number): SurfacePrimitive | undefined {
    const id = this.triToSurfaceId[triangleIndex];
    return id >= 0 ? this.surfaces[id] : undefined;
  }

  /**
   * Provides a zero-allocation backward compatible Map-like interface
   */
  public asMap(): Map<number, SurfacePrimitive> {
    const map = new Map<number, SurfacePrimitive>();
    for (let t = 0; t < this.triToSurfaceId.length; t++) {
      const s = this.getSurface(t);
      if (s) map.set(t, s);
    }
    return map;
  }
}
