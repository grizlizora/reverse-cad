// ==============================================================================
// src/standards/material-catalog.ts — Engineering Materials Catalog & Resolver Façade
// ==============================================================================
// Standard engineering material definitions with physical, optical, mechanical,
// and presentation rendering properties for CAD (STEP AP214 / AP242) and JSON.
// ==============================================================================

import {
  MaterialSpec,
  STANDARD_MATERIALS,
  STANDARD_MATERIALS_LIST,
  STANDARD_MATERIALS_KEYS,
  loadMaterialCatalogFile
} from './material-data.js';
import { MATERIAL_ALIASES, normalizeMaterialKey } from './material-aliases.js';

export {
  type MaterialSpec,
  STANDARD_MATERIALS,
  STANDARD_MATERIALS_LIST,
  STANDARD_MATERIALS_KEYS,
  loadMaterialCatalogFile
} from './material-data.js';
export { MATERIAL_ALIASES, normalizeMaterialKey } from './material-aliases.js';

/**
 * Normalizes input name or alias to canonical MaterialSpec in O(1) time with zero heap allocations:
 * 1. Exact canonical ID match
 * 2. Static ReadonlyMap alias lookup
 * 3. Tokenized 2-word bigram & 1-word token O(1) lookup (prioritizing multi-word compounds like "carbon_steel" and "soda_lime")
 * 4. Safe prefix / long-key (>= 5 chars) match (prevents 3-letter keys "pla"/"abs"/"pom" from matching "plate"/"slab"/"pommel")
 */
export function resolveMaterial(nameOrId?: string, fallback = 'steel'): MaterialSpec {
  if (!nameOrId) {
    return STANDARD_MATERIALS[fallback] || STANDARD_MATERIALS['steel'];
  }

  const key = normalizeMaterialKey(nameOrId);
  if (!key) {
    return STANDARD_MATERIALS[fallback] || STANDARD_MATERIALS['steel'];
  }

  // 1. O(1) Exact canonical ID match
  if (STANDARD_MATERIALS[key]) {
    return STANDARD_MATERIALS[key];
  }

  // 2. O(1) Static alias map lookup
  const mappedId = MATERIAL_ALIASES.get(key);
  if (mappedId && STANDARD_MATERIALS[mappedId]) {
    return STANDARD_MATERIALS[mappedId];
  }

  // 3. Tokenized O(1) lookup: check 2-word adjacent bigrams first, then single-word tokens
  if (key.includes('_')) {
    const tokens = key.split('_');
    // 3A. Two-word compound tokens (e.g., "carbon_steel" -> "mild_steel", "soda_lime" -> "soda_lime_glass")
    for (let t = 0; t < tokens.length - 1; t++) {
      if (!tokens[t] || !tokens[t + 1]) continue;
      const bigram = `${tokens[t]}_${tokens[t + 1]}`;
      if (STANDARD_MATERIALS[bigram]) {
        return STANDARD_MATERIALS[bigram];
      }
      const bigramAlias = MATERIAL_ALIASES.get(bigram);
      if (bigramAlias && STANDARD_MATERIALS[bigramAlias]) {
        return STANDARD_MATERIALS[bigramAlias];
      }
    }

    // 3B. Single-word tokens (e.g., "part_borosilicate_lens" -> token "borosilicate" -> "glass")
    for (let t = 0; t < tokens.length; t++) {
      const tok = tokens[t];
      if (!tok) continue;
      if (STANDARD_MATERIALS[tok]) {
        return STANDARD_MATERIALS[tok];
      }
      const tokAlias = MATERIAL_ALIASES.get(tok);
      if (tokAlias && STANDARD_MATERIALS[tokAlias]) {
        return STANDARD_MATERIALS[tokAlias];
      }
    }
  }

  // 4. Safe prefix / long-key (>= 5 chars) match
  // Never allows 3-letter keys ("pla", "abs", "pom") to match inside unrelated words ("plate", "slab", "pommel")
  for (let i = 0; i < STANDARD_MATERIALS_KEYS.length; i++) {
    const matKey = STANDARD_MATERIALS_KEYS[i];
    if (matKey.length >= 5 && (key.includes(matKey) || (key.length >= 4 && matKey.startsWith(key)))) {
      return STANDARD_MATERIALS[matKey];
    }
  }

  return STANDARD_MATERIALS[fallback] || STANDARD_MATERIALS['steel'];
}

/**
 * Returns array of all available material specifications without per-call Object.values allocation.
 */
export function listStandardMaterials(): MaterialSpec[] {
  return STANDARD_MATERIALS_LIST as MaterialSpec[];
}
