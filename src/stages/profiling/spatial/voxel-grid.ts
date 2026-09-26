// ==============================================================================
// src/stages/profiling/spatial/voxel-grid.ts — Fast Static Uniform 3D Voxel Grid
// ==============================================================================

import { Point3D, BoundingBox3D } from '../../../types/geometry.js';

export class UniformVoxelGrid3D {
  private cellSize: number;
  private invCellSize: number;
  private minX: number;
  private minY: number;
  private minZ: number;
  private dimX: number;
  private dimY: number;
  private dimZ: number;
  private cells: Map<number, number[]>;

  constructor(positions: Float32Array, vertexCount: number, bbox: BoundingBox3D, targetCellSize = 10.0) {
    this.cellSize = Math.max(1.0, targetCellSize);
    this.invCellSize = 1.0 / this.cellSize;
    this.minX = bbox.min[0] - 1.0;
    this.minY = bbox.min[1] - 1.0;
    this.minZ = bbox.min[2] - 1.0;

    this.dimX = Math.max(1, Math.ceil((bbox.max[0] - this.minX) * this.invCellSize) + 2);
    this.dimY = Math.max(1, Math.ceil((bbox.max[1] - this.minY) * this.invCellSize) + 2);
    this.dimZ = Math.max(1, Math.ceil((bbox.max[2] - this.minZ) * this.invCellSize) + 2);

    this.cells = new Map<number, number[]>();

    for (let i = 0; i < vertexCount; i++) {
      const i3 = i * 3;
      const key = this.getKey(positions[i3], positions[i3 + 1], positions[i3 + 2]);
      let list = this.cells.get(key);
      if (!list) {
        list = [];
        this.cells.set(key, list);
      }
      list.push(i);
    }
  }

  private getKey(x: number, y: number, z: number): number {
    const ix = Math.floor((x - this.minX) * this.invCellSize);
    const iy = Math.floor((y - this.minY) * this.invCellSize);
    const iz = Math.floor((z - this.minZ) * this.invCellSize);
    return (iz * this.dimY + iy) * this.dimX + ix;
  }

  /**
   * Queries vertex indices that fall inside an AABB region.
   */
  public queryAABB(min: Point3D, max: Point3D): number[] {
    const minIX = Math.max(0, Math.floor((min[0] - this.minX) * this.invCellSize));
    const maxIX = Math.min(this.dimX - 1, Math.floor((max[0] - this.minX) * this.invCellSize));
    const minIY = Math.max(0, Math.floor((min[1] - this.minY) * this.invCellSize));
    const maxIY = Math.min(this.dimY - 1, Math.floor((max[1] - this.minY) * this.invCellSize));
    const minIZ = Math.max(0, Math.floor((min[2] - this.minZ) * this.invCellSize));
    const maxIZ = Math.min(this.dimZ - 1, Math.floor((max[2] - this.minZ) * this.invCellSize));

    const result: number[] = [];
    for (let iz = minIZ; iz <= maxIZ; iz++) {
      const zOffset = iz * this.dimY;
      for (let iy = minIY; iy <= maxIY; iy++) {
        const zyOffset = (zOffset + iy) * this.dimX;
        for (let ix = minIX; ix <= maxIX; ix++) {
          const key = zyOffset + ix;
          const list = this.cells.get(key);
          if (list) {
            for (let k = 0; k < list.length; k++) {
              result.push(list[k]);
            }
          }
        }
      }
    }

    return result;
  }
}
