// ==============================================================================
// src/standards/material-heuristics.ts — Semantic Topological Material Heuristics
// ==============================================================================

import { MeshShell, BoundingBox3D } from '../types/geometry.js';
import { ClassifiedBody } from '../utils/body-classifier.js';
import { MaterialSpec, STANDARD_MATERIALS } from './material-catalog.js';
import { ProfilingResult } from '../stages/stage5-profiling.js';

export interface HeuristicThresholds {
  maxThinPlateThicknessMm: number;
  minAspectRatio: number;
}

export const DEFAULT_HEURISTIC_THRESHOLDS: HeuristicThresholds = Object.freeze({
  maxThinPlateThicknessMm: 4.0,
  minAspectRatio: 4.0
});

const MECHANICAL_ROLE_SET = new Set(['strut', 'link']);
const MECHANICAL_NAME_PATTERNS = ['pin', 'shaft', 'axle', 'rod', 'pivot', 'hinge'];
const OPTICAL_NAME_PATTERNS = ['lens', 'window', 'glass', 'cover', 'optics', 'screen'];

/**
 * Extracts sorted dimensions [min, mid, max] in CPU registers with zero heap allocations.
 */
export function extractSortedDimensions(
  dimensions: readonly [number, number, number]
): { min: number; mid: number; max: number } {
  let a = dimensions[0];
  let b = dimensions[1];
  let c = dimensions[2];
  if (a > b) { const t = a; a = b; b = t; }
  if (b > c) { const t = b; b = c; c = t; }
  if (a > b) { const t = a; a = b; b = t; }
  return { min: a, mid: b, max: c };
}

function isPointInBoundingBox(p: readonly [number, number, number], b: BoundingBox3D): boolean {
  return (
    p[0] >= b.min[0] && p[0] <= b.max[0] &&
    p[1] >= b.min[1] && p[1] <= b.max[1] &&
    p[2] >= b.min[2] && p[2] <= b.max[2]
  );
}

/**
 * Performs semantic heuristic material detection for an assembly when "auto" is requested.
 */
export function inferSemanticMaterial(
  shell: MeshShell,
  classified: ClassifiedBody | undefined,
  profiling?: ProfilingResult,
  thresholds: HeuristicThresholds = DEFAULT_HEURISTIC_THRESHOLDS
): MaterialSpec {
  const role = classified?.role ?? 'component';
  const name = (classified?.name ?? '').toLowerCase();

  // 1. Pins, shafts, revolute joints -> Hardened Stainless Steel / POM
  if (MECHANICAL_ROLE_SET.has(role) || MECHANICAL_NAME_PATTERNS.some(p => name.includes(p))) {
    return STANDARD_MATERIALS['steel'];
  }

  // 2. Optical window / transparent lens heuristic:
  const { min: thickness, mid: width, max: length } = extractSortedDimensions(shell.boundingBox.dimensions);

  if (thickness > 0) {
    const isThinPlate =
      thickness < thresholds.maxThinPlateThicknessMm &&
      (width / thickness > thresholds.minAspectRatio) &&
      (length / thickness > thresholds.minAspectRatio);

    if (isThinPlate && OPTICAL_NAME_PATTERNS.some(p => name.includes(p))) {
      return STANDARD_MATERIALS['glass'];
    }
  }

  // 3. Fasteners / External Threaded studs / bolts (ignore internal tapped holes)
  const threads = profiling?.threads;
  if (threads && threads.length > 0) {
    const box = shell.boundingBox;
    for (let i = 0; i < threads.length; i++) {
      const t = threads[i];
      if (!t.isInternal && isPointInBoundingBox(t.axisOrigin, box)) {
        return STANDARD_MATERIALS['steel'];
      }
    }
  }

  // 4. Default structural chassis: Aluminum 6061-T6
  return STANDARD_MATERIALS['aluminum'];
}
