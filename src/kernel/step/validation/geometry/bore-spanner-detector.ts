// ==============================================================================
// src/kernel/step/validation/geometry/bore-spanner-detector.ts — Bore Spanner Analyzer
// ==============================================================================

import { HoleDefinition, BoreSpannerResult, FacePolygonData } from '../types.js';
import { BoundingBox3D } from './bounding-box.js';

export class BoreSpannerDetector {
  public static detect(
    facePolygons: FacePolygonData[],
    bbox: BoundingBox3D,
    customHoles?: HoleDefinition[]
  ): {
    boreSpanners: BoreSpannerResult[];
    totalBoreSpanners: number;
  } {
    const defaultHoles: HoleDefinition[] = customHoles ?? [
      { name: 'M3', hx: 9.47, hy: 48.75, hr: 1.22, zMin: 2.0, zMax: 20.0 },
      { name: 'M4', hx: 20.41, hy: 48.75, hr: 1.64, zMin: 2.0, zMax: 20.0 },
      { name: 'M5', hx: 32.16, hy: 48.76, hr: 2.08, zMin: 2.0, zMax: 20.0 },
      { name: 'M6', hx: 44.75, hy: 48.74, hr: 2.49, zMin: 2.0, zMax: 20.0 },
      { name: 'M8', hx: 58.65, hy: 48.74, hr: 3.39, zMin: 2.0, zMax: 20.0 },
      { name: 'M10', hx: 74.26, hy: 48.73, hr: 4.21, zMin: 2.0, zMax: 20.0 },
      { name: 'M12', hx: 91.68, hy: 48.78, hr: 5.06, zMin: 2.0, zMax: 20.0 },
      { name: 'M14', hx: 110.73, hy: 48.76, hr: 5.98, zMin: 2.0, zMax: 20.0 }
    ];

    const boreSpanners: BoreSpannerResult[] = [];
    let totalBoreSpanners = 0;

    for (const h of defaultHoles) {
      const zMin = h.zMin ?? (bbox.min.z + 2.0);
      const zMax = h.zMax ?? (bbox.max.z - 2.0);
      const keepoutRadius = h.hr * 0.70;
      const spannerIds: string[] = [];

      for (const poly of facePolygons) {
        const c = poly.centroid;
        if (c.z > zMin && c.z < zMax) {
          const d = Math.hypot(c.x - h.hx, c.y - h.hy);
          if (d < keepoutRadius) {
            spannerIds.push(poly.faceId);
          }
        }
      }

      totalBoreSpanners += spannerIds.length;
      boreSpanners.push({
        holeName: h.name,
        axisX: h.hx,
        axisY: h.hy,
        nominalRadius: h.hr,
        keepoutRadius,
        zMin,
        zMax,
        spannersCount: spannerIds.length,
        spannerFaceIds: spannerIds
      });
    }

    return {
      boreSpanners,
      totalBoreSpanners
    };
  }
}
