// ==============================================================================
// src/kernel/step/validation/geometry/face-geometry-evaluator.ts — Newell's Normal, Net Area & Divergence Volume
// ==============================================================================

import { Point3D, FacePolygonData, WeirdFaceInfo } from '../types.js';
import { BoundingBox3D } from './bounding-box.js';

export class FaceGeometryEvaluator {
  public static computeLoopArea(loopPts: Point3D[]): number {
    const count = loopPts.length;
    if (count < 3) return 0;

    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < count; i++) {
      const curr = loopPts[i];
      const next = loopPts[(i + 1) % count];
      nx += (curr.y - next.y) * (curr.z + next.z);
      ny += (curr.z - next.z) * (curr.x + next.x);
      nz += (curr.x - next.x) * (curr.y + next.y);
    }
    return 0.5 * Math.hypot(nx, ny, nz);
  }

  public static computeLoopTetrahedralVolume(loopPts: Point3D[]): number {
    const count = loopPts.length;
    if (count < 3) return 0;

    let vol = 0;
    const p0 = loopPts[0];
    for (let i = 1; i < count - 1; i++) {
      const p1 = loopPts[i];
      const p2 = loopPts[i + 1];
      const det =
        p0.x * (p1.y * p2.z - p1.z * p2.y) -
        p0.y * (p1.x * p2.z - p1.z * p2.x) +
        p0.z * (p1.x * p2.y - p1.y * p2.x);
      vol += det / 6.0;
    }
    return vol;
  }

  /**
   * Evaluates a B-Rep face's outer boundary and inner hole loops:
   * - Computes centroid and Newell's area
   * - Subtracts inner hole loop areas to obtain true net surface area
   * - Computes signed divergence volume contribution taking `sameSense` into account
   */
  public static evaluatePolygon(
    faceId: string,
    facePts: Point3D[],
    bbox: BoundingBox3D,
    holeLoopsPts: Point3D[][] = [],
    sameSense: boolean = true
  ): {
    polygon: FacePolygonData | null;
    weirdFace: WeirdFaceInfo | null;
  } {
    const count = facePts.length;
    if (count < 3) {
      return { polygon: null, weirdFace: null };
    }

    let cx = 0, cy = 0, cz = 0;
    let nx = 0, ny = 0, nz = 0;

    for (let i = 0; i < count; i++) {
      const curr = facePts[i];
      const next = facePts[(i + 1) % count];
      cx += curr.x;
      cy += curr.y;
      cz += curr.z;
      nx += (curr.y - next.y) * (curr.z + next.z);
      ny += (curr.z - next.z) * (curr.x + next.x);
      nz += (curr.x - next.x) * (curr.y + next.y);
    }

    cx /= count;
    cy /= count;
    cz /= count;
    const outerArea = 0.5 * Math.hypot(nx, ny, nz);

    let holesAreaSum = 0;
    for (let h = 0; h < holeLoopsPts.length; h++) {
      holesAreaSum += FaceGeometryEvaluator.computeLoopArea(holeLoopsPts[h]);
    }
    const netArea = Math.max(0, outerArea - holesAreaSum);

    const sign = sameSense ? 1.0 : -1.0;
    const outerVol = FaceGeometryEvaluator.computeLoopTetrahedralVolume(facePts);
    let rawVol = outerVol;
    for (let h = 0; h < holeLoopsPts.length; h++) {
      // Inner hole loops subtract from the outer loop's tetrahedral volume magnitude
      const hVol = FaceGeometryEvaluator.computeLoopTetrahedralVolume(holeLoopsPts[h]);
      if (outerVol * hVol > 0) {
        rawVol -= hVol;
      } else {
        rawVol += hVol;
      }
    }
    const signedVol = sign * rawVol;

    const polygon: FacePolygonData = {
      faceId,
      vertices: facePts,
      holeLoops: holeLoopsPts,
      sameSense,
      signedVolumeContribution: signedVol,
      centroid: { x: cx, y: cy, z: cz },
      area: holeLoopsPts.length > 0 ? netArea : outerArea
    };

    let weirdFace: WeirdFaceInfo | null = null;

    const isOutOfBounds =
      cx < bbox.min.x - 0.5 || cx > bbox.max.x + 0.5 ||
      cy < bbox.min.y - 0.5 || cy > bbox.max.y + 0.5 ||
      cz < bbox.min.z - 0.5 || cz > bbox.max.z + 0.5;

    if (outerArea < 1e-10) {
      weirdFace = {
        faceId,
        centroid: { x: cx, y: cy, z: cz },
        area: outerArea,
        edgeCount: count,
        reason: 'Degenerate zero-area face'
      };
    } else if (isOutOfBounds) {
      weirdFace = {
        faceId,
        centroid: { x: cx, y: cy, z: cz },
        area: polygon.area,
        edgeCount: count,
        reason: 'Centroid lies outside model bounding box'
      };
    }

    return { polygon, weirdFace };
  }
}
