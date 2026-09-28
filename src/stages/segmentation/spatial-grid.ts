// ==============================================================================
// src/stages/segmentation/spatial-grid.ts — 3D Spatial Grid for RANSAC Candidate Seeding
// ==============================================================================

import { Point3D } from '../../types/geometry.js';

export class UniformSpatialGrid3D {
  private cellSize: number;
  private invCell: number;
  private grid: Map<number, number[]> = new Map();

  constructor(cellSize: number = 10.0) {
    this.cellSize = cellSize;
    this.invCell = 1.0 / cellSize;
  }

  private hash(cx: number, cy: number, cz: number): number {
    return (((cx * 73856093) ^ (cy * 19349663) ^ (cz * 83492791)) >>> 0);
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

  public queryNeighbors(x: number, y: number, z: number): number[] {
    const cx = Math.floor(x * this.invCell);
    const cy = Math.floor(y * this.invCell);
    const cz = Math.floor(z * this.invCell);

    const result: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const key = this.hash(cx + dx, cy + dy, cz + dz);
          const bucket = this.grid.get(key);
          if (bucket) {
            for (let i = 0; i < bucket.length; i++) {
              result.push(bucket[i]);
            }
          }
        }
      }
    }
    return result;
  }

  public clear(): void {
    this.grid.clear();
  }
}

export function pickRandomUnassigned(unassigned: Uint8Array): number {
  const len = unassigned.length;
  const start = Math.floor(Math.random() * len);
  for (let i = 0; i < len; i++) {
    const idx = (start + i) % len;
    if (unassigned[idx]) return idx;
  }
  return -1;
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

export function pickLocalizedNeighborBuffers(
  unassigned: Uint8Array,
  centroids: Float32Array,
  p: Point3D,
  maxDist: number,
  spatialGrid?: UniformSpatialGrid3D
): number {
  if (spatialGrid) {
    const neighbors = spatialGrid.queryNeighbors(p[0], p[1], p[2]);
    if (neighbors.length > 0) {
      const maxDistSq = maxDist * maxDist;
      const start = Math.floor(Math.random() * neighbors.length);
      const probeCount = Math.min(100, neighbors.length);
      for (let i = 0; i < probeCount; i++) {
        const idx = neighbors[(start + i) % neighbors.length];
        if (unassigned[idx]) {
          const i3 = idx * 3;
          const dx = centroids[i3] - p[0];
          const dy = centroids[i3 + 1] - p[1];
          const dz = centroids[i3 + 2] - p[2];
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq > 1e-4 && dSq < maxDistSq) {
            return idx;
          }
        }
      }
    }
  }

  const len = unassigned.length;
  const maxDistSq = maxDist * maxDist;
  const start = Math.floor(Math.random() * len);
  for (let i = 0; i < Math.min(200, len); i++) {
    const idx = (start + i) % len;
    if (unassigned[idx]) {
      const i3 = idx * 3;
      const dx = centroids[i3] - p[0];
      const dy = centroids[i3 + 1] - p[1];
      const dz = centroids[i3 + 2] - p[2];
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > 1e-4 && dSq < maxDistSq) {
        return idx;
      }
    }
  }
  return -1;
}
