// ==============================================================================
// src/capabilities/csg-dsl-generator.ts — Pure Functional CSG DSL Generator
// ==============================================================================

import type { HolePatternCluster } from './pcd-pattern-engine.js';

export interface CsgDslInput {
  boundingDimensionsMm?: [number, number, number];
  solidBodies?: any[];
  kinematicJoints?: any[];
  slots?: any[];
  clusters?: HolePatternCluster[];
  individualHoles?: any[];
}

/**
 * Generates an ultra-compact symbolic CAD CSG DSL summarizing entire model features in < 150 tokens.
 */
export function generateCompactCsgDsl(input: CsgDslInput): string {
  const dslParts: string[] = [];

  if (input.boundingDimensionsMm) {
    dslParts.push(`BOUNDS(${input.boundingDimensionsMm.join('x')} mm)`);
  }

  if (input.solidBodies && input.solidBodies.length > 0) {
    dslParts.push(`BODIES(${input.solidBodies.map((b: any) => `${b.role || 'body'}:${b.volumeMm3 ? Math.round(b.volumeMm3) : 0}mm³`).join(',')})`);
  }

  if (input.kinematicJoints && input.kinematicJoints.length > 0) {
    dslParts.push(`JOINTS(${input.kinematicJoints.map((j: any) => `${j.type}:${j.clearanceMm}mm`).join(',')})`);
  }

  if (input.slots && input.slots.length > 0) {
    dslParts.push(`SLOTS(${input.slots.map((s: any) => `${s.widthMm}x${s.lengthMm}mm`).join(',')})`);
  }

  if (input.clusters && input.clusters.length > 0) {
    for (const c of input.clusters) {
      if (c.compactDsl) dslParts.push(c.compactDsl);
    }
  }

  if (input.individualHoles && input.individualHoles.length > 0) {
    const holeSummary = input.individualHoles.slice(0, 5).map((h: any) => {
      const dia = h.diameter ?? h.diameterMm ?? 5.0;
      const th = h.isThreaded ? (h.threadSpec || h.thread || 'TH') : '';
      return `ø${dia}${th ? ':' + th : ''}`;
    }).join(',');
    const extra = input.individualHoles.length > 5 ? `+${input.individualHoles.length - 5}` : '';
    dslParts.push(`HOLES(${holeSummary}${extra})`);
  }

  return dslParts.join(' | ');
}
