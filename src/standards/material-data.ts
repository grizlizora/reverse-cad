// ==============================================================================
// src/standards/material-data.ts — Zero-IO Static Engineering Material Database
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { MaterialSpec } from './material-types.js';
import { OPTICAL_MATERIALS } from './materials-optical.js';
import { METALS_MATERIALS } from './materials-metals.js';
import { POLYMERS_MATERIALS } from './materials-polymers.js';

export type { MaterialSpec, MaterialCategory } from './material-types.js';

export const STANDARD_MATERIALS: Record<string, MaterialSpec> = Object.freeze({
  ...OPTICAL_MATERIALS,
  ...METALS_MATERIALS,
  ...POLYMERS_MATERIALS
});

/** Pre-computed immutable list & keys to eliminate Object.values / Object.keys allocations in hot loops */
export const STANDARD_MATERIALS_LIST: readonly MaterialSpec[] = Object.freeze(Object.values(STANDARD_MATERIALS));
export const STANDARD_MATERIALS_KEYS: readonly string[] = Object.freeze(Object.keys(STANDARD_MATERIALS));

let cachedMaterialCatalogList: MaterialSpec[] | null = null;

export function loadMaterialCatalogFile(): MaterialSpec[] {
  if (cachedMaterialCatalogList) {
    return cachedMaterialCatalogList;
  }
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.join(currentDir, 'data', 'materials-db.json'),
      path.resolve(currentDir, '../../src/standards/data/materials-db.json')
    ];
    for (const jsonPath of candidates) {
      if (fs.existsSync(jsonPath)) {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        if (Array.isArray(parsed.materials)) {
          cachedMaterialCatalogList = parsed.materials;
          return cachedMaterialCatalogList!;
        }
      }
    }
  } catch {}
  cachedMaterialCatalogList = STANDARD_MATERIALS_LIST as MaterialSpec[];
  return cachedMaterialCatalogList;
}
