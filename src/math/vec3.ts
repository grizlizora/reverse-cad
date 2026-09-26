// ==============================================================================
// src/math/vec3.ts — High-Performance Zero-Allocation 3D Vector Math Primitives
// ==============================================================================

import { Point3D, Vector3D } from '../types/geometry.js';

export function dot(a: Vector3D, b: Vector3D): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vector3D, b: Vector3D): Vector3D {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function norm(v: Vector3D): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function normalize(v: Vector3D): Vector3D {
  const len = norm(v);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function add(a: Point3D, b: Vector3D): Point3D {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Point3D, b: Point3D): Vector3D {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(v: Vector3D, s: number): Vector3D {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function distance(a: Point3D, b: Point3D): number {
  return norm(sub(a, b));
}

export function angleBetween(a: Vector3D, b: Vector3D): number {
  const nA = normalize(a);
  const nB = normalize(b);
  const d = Math.max(-1, Math.min(1, dot(nA, nB)));
  return Math.acos(d);
}

// ------------------------------------------------------------------------------
// Direct scalar primitives for zero heap allocations in inner loops
// ------------------------------------------------------------------------------

export function dotDirect(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  return ax * bx + ay * by + az * bz;
}

export function normDirect(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function distanceDirect(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x1 - x2, dy = y1 - y2, dz = z1 - z2;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function crossTo(a: Vector3D, b: Vector3D, out: Vector3D): Vector3D {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
  return out;
}

export function normalizeDirect(x: number, y: number, z: number, out: Vector3D): Vector3D {
  const len = Math.sqrt(x * x + y * y + z * z);
  if (len < 1e-12) {
    out[0] = 0; out[1] = 0; out[2] = 1;
  } else {
    out[0] = x / len; out[1] = y / len; out[2] = z / len;
  }
  return out;
}
