// ==============================================================================
// src/kernel/step/validation/topology/spatial-vertex-indexer.ts — Hybrid 27-Cell Spatial & Topological Indexer
// ==============================================================================

import { Point3D } from '../types.js';

interface CanonicalVertexEntry {
  key: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Hybrid Topological & 27-Cell Spatial Hash Vertex Indexer.
 * 1. Prioritizes topological VERTEX_POINT / CARTESIAN_POINT entity IDs when matched.
 * 2. Searches the 27-cell spatial neighborhood (dx, dy, dz in {-1, 0, 1}) within tolerance `tol`
 *    to completely eliminate boundary quantization splits at `(k + 0.5) * tol`.
 */
export class SpatialVertexIndexer {
  private readonly tol: number;
  private readonly tolSq: number;
  private readonly cellSize: number;
  private readonly cellBuckets = new Map<string, CanonicalVertexEntry[]>();
  private readonly idToCanonicalKey = new Map<string, string>();
  private nextVertexUid = 1;

  constructor(tol: number = 1e-4) {
    this.tol = tol;
    this.tolSq = tol * tol;
    this.cellSize = Math.max(1e-7, tol * 2.0);
  }

  /**
   * Resolves a 3D point (and optional STEP entity ID) to a canonical vertex key,
   * checking the 27-cell spatial neighborhood to avoid grid-boundary quantization artifacts.
   */
  public resolveVertexKey(p: Point3D, entityId?: string): string {
    if (entityId) {
      const existingById = this.idToCanonicalKey.get(entityId);
      if (existingById) return existingById;
    }

    const cx = Math.floor(p.x / this.cellSize);
    const cy = Math.floor(p.y / this.cellSize);
    const cz = Math.floor(p.z / this.cellSize);

    // Search 27-cell neighborhood for existing canonical vertex within tol
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cellKey = `${cx + dx}_${cy + dy}_${cz + dz}`;
          const bucket = this.cellBuckets.get(cellKey);
          if (!bucket) continue;
          for (let i = 0; i < bucket.length; i++) {
            const entry = bucket[i];
            const distSq =
              (p.x - entry.x) * (p.x - entry.x) +
              (p.y - entry.y) * (p.y - entry.y) +
              (p.z - entry.z) * (p.z - entry.z);
            if (distSq <= this.tolSq) {
              if (entityId) this.idToCanonicalKey.set(entityId, entry.key);
              return entry.key;
            }
          }
        }
      }
    }

    // Create new canonical vertex entry
    const canonicalKey = `V${this.nextVertexUid++}`;
    const homeCellKey = `${cx}_${cy}_${cz}`;
    let homeBucket = this.cellBuckets.get(homeCellKey);
    if (!homeBucket) {
      homeBucket = [];
      this.cellBuckets.set(homeCellKey, homeBucket);
    }
    homeBucket.push({ key: canonicalKey, x: p.x, y: p.y, z: p.z });

    if (entityId) {
      this.idToCanonicalKey.set(entityId, canonicalKey);
    }
    return canonicalKey;
  }

  /**
   * Resolves a canonical undirected edge and its traversal direction using the 27-cell hybrid indexer.
   */
  public resolveEdge(
    pA: Point3D,
    pB: Point3D,
    idA?: string,
    idB?: string
  ): {
    kA: string;
    kB: string;
    edgeKey: string;
    forward: boolean;
    isCircular: boolean;
    dist: number;
  } {
    const kA = this.resolveVertexKey(pA, idA);
    const kB = this.resolveVertexKey(pB, idB);
    const isCircular = kA === kB;
    const forward = kA <= kB;
    const edgeKey = forward ? `${kA}__${kB}` : `${kB}__${kA}`;
    const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);

    return { kA, kB, edgeKey, forward, isCircular, dist };
  }

  public static quantizePoint(p: Point3D, tol: number = 1e-4): string {
    const qx = Math.round(p.x / tol);
    const qy = Math.round(p.y / tol);
    const qz = Math.round(p.z / tol);
    return `${qx}_${qy}_${qz}`;
  }

  public static getCanonicalEdge(
    pA: Point3D,
    pB: Point3D,
    tol: number = 1e-4
  ): {
    kA: string;
    kB: string;
    edgeKey: string;
    forward: boolean;
    isCircular: boolean;
    dist: number;
  } {
    const kA = SpatialVertexIndexer.quantizePoint(pA, tol);
    const kB = SpatialVertexIndexer.quantizePoint(pB, tol);
    const isCircular = kA === kB;
    const forward = kA <= kB;
    const edgeKey = forward ? `${kA}__${kB}` : `${kB}__${kA}`;
    const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y, pB.z - pA.z);

    return {
      kA,
      kB,
      edgeKey,
      forward,
      isCircular,
      dist
    };
  }
}
