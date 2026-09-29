// ==============================================================================
// src/stages/segmentation/spatial-grid.ts — 3D Spatial Grid for RANSAC Candidate Seeding
// ==============================================================================

export class UniformSpatialGrid3D {
  private cellSize: number;
  private invCell: number;
  private grid: Map<number, number[]> = new Map();

  constructor(cellSize: number = 10.0) {
    this.cellSize = cellSize;
    this.invCell = 1.0 / cellSize;
  }

  /**
   * 31-bit SMI-safe spatial hash avoiding HeapNumber allocations in V8.
   */
  private hash(cx: number, cy: number, cz: number): number {
    return (
      (Math.imul(cx, 73856093) ^
        Math.imul(cy, 19349663) ^
        Math.imul(cz, 83492791)) &
      0x3fffffff
    );
  }

  public insert(index: number, x: number, y: number, z: number): void {
    const cx = Math.floor(x * this.invCell);
    const cy = Math.floor(y * this.invCell);
    const cz = Math.floor(z * this.invCell);
    const key = this.hash(cx, cy, cz);

    let bucket = this.grid.get(key);
    if (!bucket) {
      bucket = [];
      this.grid.set(key, bucket);
    }
    bucket.push(index);
  }

  /**
   * Inserts a 3D bounding box (e.g. triangle AABB) into all overlapping grid cells.
   */
  public insertBox(
    index: number,
    minX: number,
    minY: number,
    minZ: number,
    maxX: number,
    maxY: number,
    maxZ: number
  ): void {
    const ix0 = Math.floor(minX * this.invCell);
    const iy0 = Math.floor(minY * this.invCell);
    const iz0 = Math.floor(minZ * this.invCell);
    const ix1 = Math.floor(maxX * this.invCell);
    const iy1 = Math.floor(maxY * this.invCell);
    const iz1 = Math.floor(maxZ * this.invCell);

    for (let cx = ix0; cx <= ix1; cx++) {
      for (let cy = iy0; cy <= iy1; cy++) {
        for (let cz = iz0; cz <= iz1; cz++) {
          const key = this.hash(cx, cy, cz);
          let bucket = this.grid.get(key);
          if (!bucket) {
            bucket = [];
            this.grid.set(key, bucket);
          }
          bucket.push(index);
        }
      }
    }
  }

  public queryCell(x: number, y: number, z: number): number[] {
    const cx = Math.floor(x * this.invCell);
    const cy = Math.floor(y * this.invCell);
    const cz = Math.floor(z * this.invCell);
    return this.grid.get(this.hash(cx, cy, cz)) || [];
  }

  /**
   * Zero-allocation neighbor traversal across 27 adjacent cells.
   */
  public forEachNeighbor(
    x: number,
    y: number,
    z: number,
    cb: (idx: number) => void
  ): void {
    const cx = Math.floor(x * this.invCell);
    const cy = Math.floor(y * this.invCell);
    const cz = Math.floor(z * this.invCell);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const bucket = this.grid.get(this.hash(cx + dx, cy + dy, cz + dz));
          if (bucket) {
            const blen = bucket.length;
            for (let i = 0; i < blen; i++) {
              cb(bucket[i]);
            }
          }
        }
      }
    }
  }

  /**
   * Fills an external buffer without allocating a new array.
   */
  public queryNeighborsInto(
    x: number,
    y: number,
    z: number,
    outBuffer: number[]
  ): number {
    outBuffer.length = 0;
    this.forEachNeighbor(x, y, z, (idx) => outBuffer.push(idx));
    return outBuffer.length;
  }

  /**
   * Backward-compatible neighbor query.
   */
  public queryNeighbors(x: number, y: number, z: number): number[] {
    const result: number[] = [];
    this.forEachNeighbor(x, y, z, (idx) => result.push(idx));
    return result;
  }

  public clear(): void {
    this.grid.clear();
  }
}

export function buildSpatialGrid(
  unassigned: Uint8Array,
  centroids: Float32Array,
  cellSize: number = 20.0
): UniformSpatialGrid3D {
  const grid = new UniformSpatialGrid3D(cellSize);
  const len = unassigned.length;
  for (let i = 0; i < len; i++) {
    if (unassigned[i]) {
      const i3 = i * 3;
      grid.insert(i, centroids[i3], centroids[i3 + 1], centroids[i3 + 2]);
    }
  }
  return grid;
}
