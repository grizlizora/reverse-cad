// ==============================================================================
// src/stages/segmentation/cylinder-sampler.ts — Deterministic PRNG & Spatial Seed Sampler
// ==============================================================================

import { RawMesh, Point3D } from '../../types/geometry.js';
import type { UniformSpatialGrid3D } from './spatial-grid.js';

/**
 * Fast 32-bit deterministic Mulberry32 Pseudo-Random Number Generator.
 * Provides 100% reproducible test runs and avoids Math.random() non-determinism.
 */
export class FastPRNG {
  private state: number;

  constructor(seed: number = 0x1337beef) {
    this.state = seed >>> 0;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }
}

const defaultPRNG = new FastPRNG(0x42f00d);

/**
 * Picks a random unassigned triangle index uniformly using deterministic PRNG.
 */
export function pickRandomUnassigned(
  unassigned: Uint8Array,
  prng?: FastPRNG,
  totalTriangles?: number
): number {
  const total = totalTriangles ?? unassigned.length;
  if (total <= 0) return -1;
  const rng = prng ?? defaultPRNG;

  // Stride-based sampling for O(1) expected time
  const start = Math.floor(rng.next() * total);
  for (let i = 0; i < total; i++) {
    const idx = (start + i) % total;
    if (unassigned[idx] === 1) return idx;
  }
  return -1;
}

/**
 * Picks a spatial neighbor seed triangle for RANSAC candidate pair using UniformSpatialGrid3D.
 */
export function pickSpatialNeighbor(
  t0: number,
  mesh: RawMesh,
  unassigned: Uint8Array,
  grid: UniformSpatialGrid3D,
  prng: FastPRNG = defaultPRNG
): number {
  const t3 = t0 * 3;
  const i0 = mesh.indices[t3] * 3;
  const i1 = mesh.indices[t3 + 1] * 3;
  const i2 = mesh.indices[t3 + 2] * 3;

  const cx = (mesh.positions[i0] + mesh.positions[i1] + mesh.positions[i2]) / 3.0;
  const cy = (mesh.positions[i0 + 1] + mesh.positions[i1 + 1] + mesh.positions[i2 + 1]) / 3.0;
  const cz = (mesh.positions[i0 + 2] + mesh.positions[i1 + 2] + mesh.positions[i2 + 2]) / 3.0;

  const neighbors = grid.queryNeighbors(cx, cy, cz);
  if (neighbors.length > 0) {
    const startIdx = Math.floor(prng.next() * neighbors.length);
    for (let i = 0; i < neighbors.length; i++) {
      const cand = neighbors[(startIdx + i) % neighbors.length];
      if (cand !== t0 && unassigned[cand] === 1) {
        return cand;
      }
    }
  }

  // Fallback: pick any unassigned triangle
  return pickRandomUnassigned(unassigned, prng, mesh.triangleCount);
}

/**
 * Picks a localized neighbor buffer within [minDistSq, maxDistSq] using spatial grid and deterministic PRNG.
 */
export function pickLocalizedNeighborBuffers(
  unassigned: Uint8Array,
  centroids: Float32Array,
  p: Point3D,
  maxDist: number,
  spatialGrid?: UniformSpatialGrid3D,
  prng: FastPRNG = defaultPRNG
): number {
  const maxDistSq = maxDist * maxDist;
  const minDistSq = 1e-8; // Supports micro-features down to 0.1 mm

  if (spatialGrid) {
    const neighbors = spatialGrid.queryNeighbors(p[0], p[1], p[2]);
    const nLen = neighbors.length;
    if (nLen > 0) {
      const start = Math.floor(prng.next() * nLen);
      const probeCount = Math.min(100, nLen);
      for (let i = 0; i < probeCount; i++) {
        const idx = neighbors[(start + i) % nLen];
        if (unassigned[idx] === 1) {
          const i3 = idx * 3;
          const dx = centroids[i3] - p[0];
          const dy = centroids[i3 + 1] - p[1];
          const dz = centroids[i3 + 2] - p[2];
          const dSq = dx * dx + dy * dy + dz * dz;
          if (dSq > minDistSq && dSq < maxDistSq) {
            return idx;
          }
        }
      }
    }
  }

  const len = unassigned.length;
  const start = Math.floor(prng.next() * len);
  const probeCount = Math.min(200, len);
  for (let i = 0; i < probeCount; i++) {
    const idx = (start + i) % len;
    if (unassigned[idx] === 1) {
      const i3 = idx * 3;
      const dx = centroids[i3] - p[0];
      const dy = centroids[i3 + 1] - p[1];
      const dz = centroids[i3 + 2] - p[2];
      const dSq = dx * dx + dy * dy + dz * dz;
      if (dSq > minDistSq && dSq < maxDistSq) {
        return idx;
      }
    }
  }
  return -1;
}
