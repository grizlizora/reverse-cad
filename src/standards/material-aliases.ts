// ==============================================================================
// src/standards/material-aliases.ts — Zero-Allocation O(1) Material Alias Resolver
// ==============================================================================

/**
 * Normalizes a raw material string into a lowercase underscore-delimited lookup key,
 * stripping parentheses, slashes, and punctuation.
 */
export function normalizeMaterialKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[()[\]{}/\\.,;:]+/g, ' ')
    .trim()
    .replace(/[\s\-_]+/g, '_');
}

/**
 * Static ReadonlyMap of common engineering, CAD, and localized material aliases.
 * Allocated once at module load time for O(1) zero-GC lookup.
 */
export const MATERIAL_ALIASES: ReadonlyMap<string, string> = new Map<string, string>([
  // Glass & Optics
  ['glass', 'glass'],
  ['sklo', 'glass'],
  ['скло', 'glass'],
  ['glass_clear', 'glass'],
  ['borosilicate', 'glass'],
  ['pyrex', 'glass'],
  ['float_glass', 'soda_lime_glass'],
  ['window_glass', 'soda_lime_glass'],
  ['soda_lime', 'soda_lime_glass'],
  ['silica', 'quartz'],
  ['fused_silica', 'quartz'],
  ['fused_quartz', 'quartz'],
  ['pmma', 'acrylic'],
  ['plexiglass', 'acrylic'],
  ['plexi', 'acrylic'],
  ['perspex', 'acrylic'],
  ['pc', 'polycarbonate'],
  ['lexan', 'polycarbonate'],
  ['makrolon', 'polycarbonate'],

  // Metals & Alloys
  ['inox', 'steel'],
  ['stainless', 'steel'],
  ['stainless_steel', 'steel'],
  ['ss316', 'steel'],
  ['ss316l', 'steel'],
  ['ss304', 'steel'],
  ['metal', 'steel'],
  ['сталь', 'steel'],
  ['iron', 'mild_steel'],
  ['carbon_steel', 'mild_steel'],
  ['aisi_1020', 'mild_steel'],
  ['al', 'aluminum'],
  ['alu', 'aluminum'],
  ['aluminium', 'aluminum'],
  ['al6061', 'aluminum'],
  ['6061', 'aluminum'],
  ['алюміній', 'aluminum'],
  ['bronze', 'brass'],
  ['c36000', 'brass'],
  ['латунь', 'brass'],
  ['cu', 'copper'],
  ['c11000', 'copper'],
  ['мідь', 'copper'],
  ['ti', 'titanium'],
  ['ti6al4v', 'titanium'],
  ['grade_5', 'titanium'],
  ['титан', 'titanium'],

  // Polymers & Elastomers
  ['plastic', 'pla'],
  ['polylactic', 'pla'],
  ['pa', 'nylon'],
  ['pa12', 'nylon'],
  ['pa6', 'nylon'],
  ['polyamide', 'nylon'],
  ['delrin', 'pom'],
  ['acetal', 'pom'],
  ['polyacetal', 'pom'],
  ['nbr', 'rubber'],
  ['nitrile', 'rubber'],
  ['gasket', 'rubber'],
  ['seal', 'rubber'],
  ['o_ring', 'rubber'],
  ['гума', 'rubber'],
  ['silicone_rubber', 'silicone'],
  ['силікон', 'silicone'],

  // Composites
  ['carbon', 'carbon_fiber'],
  ['carb', 'carbon_fiber'],
  ['car', 'carbon_fiber'],
  ['cfrp', 'carbon_fiber'],
  ['карбон', 'carbon_fiber']
]);
