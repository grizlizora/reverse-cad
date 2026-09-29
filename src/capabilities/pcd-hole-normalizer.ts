// ==============================================================================
// src/capabilities/pcd-hole-normalizer.ts — Hole Specification Normalizer
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';
import { NormalizedHole } from './pcd-geometry-matcher.js';

/**
 * Normalizes an arbitrary 3D vector to unit length.
 * Fallbacks to [0, 0, 1] if degenerate (< 1e-12).
 */
export function ensureUnitVector(dir: Vector3D | number[]): Vector3D {
  const x = dir[0] || 0;
  const y = dir[1] || 0;
  const z = dir[2] || 0;
  const lenSq = x * x + y * y + z * z;
  if (lenSq > 1e-12) {
    const invLen = 1.0 / Math.sqrt(lenSq);
    return [x * invLen, y * invLen, z * invLen];
  }
  return [0, 0, 1];
}

/**
 * Normalizes any raw hole or cylinder representation into NormalizedHole.
 * Enforces unit axis vector for exact CAD projection and basis assembly.
 */
export function normalizeHole(h: any): NormalizedHole {
  if (!h || typeof h !== 'object') {
    return {
      id: 'hole_empty',
      diameter: 5.0,
      depth: 10.0,
      position: [0, 0, 0],
      direction: [0, 0, 1],
      isThreaded: false
    };
  }

  const dia = typeof h.diameter === 'number' ? h.diameter : (typeof h.diameterMm === 'number' ? h.diameterMm : 5.0);
  const depth = typeof h.depth === 'number' ? h.depth : (typeof h.depthMm === 'number' ? h.depthMm : 10.0);
  const rawPos = Array.isArray(h.axisOrigin) ? h.axisOrigin : (Array.isArray(h.position) ? h.position : [0, 0, 0]);
  const rawDir = Array.isArray(h.axisDirection) ? h.axisDirection : (Array.isArray(h.direction) ? h.direction : [0, 0, 1]);

  const pos: Point3D = [rawPos[0] || 0, rawPos[1] || 0, rawPos[2] || 0];
  const dir: Vector3D = ensureUnitVector(rawDir);

  return {
    id: String(h.id || 'hole_0'),
    diameter: dia,
    depth,
    position: pos,
    direction: dir,
    isThreaded: Boolean(h.isThreaded),
    threadSpec: h.threadSpec || h.thread || undefined
  };
}
