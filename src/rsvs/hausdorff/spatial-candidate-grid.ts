// ==============================================================================
// src/rsvs/hausdorff/spatial-candidate-grid.ts — 2-Ring Search & Deduplicated Grid
// ==============================================================================

export class SpatialCandidateGrid {
  private readonly invCell: number;
  public readonly cellSize: number;
  private readonly grid: Map<number, number[]> = new Map();
  private readonly visitedStamps: Uint32Array;
  private queryId = 1;

  constructor(cellSize: number, maxTriangles: number) {
    this.cellSize = cellSize;
    this.invCell = 1.0 / cellSize;
    this.visitedStamps = new Uint32Array(maxTriangles);
  }

  private hash(cx: number, cy: number, cz: number): number {
    return (((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0);
  }

  public insertBox(t: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): void {
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
          bucket.push(t);
        }
      }
    }
  }

  /**
   * Traverses concentric rings (0, 1, 2) invoking callback with deduplicated triangles.
   * Stops early as soon as candidates are discovered in the closest ring.
   */
  public queryRingsDeduplicated(
    px: number,
    py: number,
    pz: number,
    maxRings: number,
    visitor: (triangleIndex: number) => void
  ): boolean {
    const cx = Math.floor(px * this.invCell);
    const cy = Math.floor(py * this.invCell);
    const cz = Math.floor(pz * this.invCell);

    const qId = ++this.queryId;
    if (this.queryId === 0xFFFFFFFF) {
      this.visitedStamps.fill(0);
      this.queryId = 1;
    }

    let foundAny = false;

    for (let r = 0; r <= maxRings; r++) {
      let foundInRing = false;
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            // Only examine outer shell of current ring
            if (r > 0 && Math.abs(dx) < r && Math.abs(dy) < r && Math.abs(dz) < r) continue;

            const bucket = this.grid.get(this.hash(cx + dx, cy + dy, cz + dz));
            if (bucket) {
              for (let i = 0; i < bucket.length; i++) {
                const t = bucket[i];
                if (this.visitedStamps[t] !== qId) {
                  this.visitedStamps[t] = qId;
                  visitor(t);
                  foundInRing = true;
                  foundAny = true;
                }
              }
            }
          }
        }
      }
      if (foundInRing) return true;
    }
    return foundAny;
  }
}
