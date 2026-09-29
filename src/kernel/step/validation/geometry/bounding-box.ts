// ==============================================================================
// src/kernel/step/validation/geometry/bounding-box.ts — Bounding Box Calculator
// ==============================================================================

import { Point3D, StepCartesianPoint } from '../types.js';

export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
  dimensions: Point3D;
}

export class BoundingBoxCalculator {
  public static compute(points: Iterable<StepCartesianPoint>): BoundingBox3D {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const pt of points) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
      if (pt.z < minZ) minZ = pt.z;
      if (pt.z > maxZ) maxZ = pt.z;
    }

    if (minX === Infinity) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 },
        dimensions: { x: 0, y: 0, z: 0 }
      };
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      dimensions: {
        x: maxX > minX ? maxX - minX : 0,
        y: maxY > minY ? maxY - minY : 0,
        z: maxZ > minZ ? maxZ - minZ : 0
      }
    };
  }
}
