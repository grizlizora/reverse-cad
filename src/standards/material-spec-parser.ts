// ==============================================================================
// src/standards/material-spec-parser.ts — CLI Material Specification Parser
// ==============================================================================

import { MaterialSpec, resolveMaterial } from './material-catalog.js';

export interface ParsedMaterialSpec {
  isAuto: boolean;
  globalMaterial?: string;
  indexedMaterials?: Map<number, string>;
  roleMaterials?: Map<string, string>;
}

export interface CompiledMaterialSpec {
  isAuto: boolean;
  globalMaterialSpec?: MaterialSpec;
  indexedMaterialSpecs?: Map<number, MaterialSpec>;
  roleMaterialSpecs?: Map<string, MaterialSpec>;
  namePatternSpecs?: Array<{ pattern: string; spec: MaterialSpec }>;
}

/**
 * Parses user-supplied material CLI specification into structured string maps.
 * Handles single global, comma-separated positional, indexed key-value, and role pairs.
 */
export function parseMaterialSpec(specStr?: string): ParsedMaterialSpec {
  if (!specStr || specStr.trim() === '' || specStr.toLowerCase() === 'auto') {
    return { isAuto: true };
  }

  const trimmed = specStr.trim();

  // If no comma or equals sign, it's a single global material
  if (!trimmed.includes(',') && !trimmed.includes('=')) {
    return { isAuto: false, globalMaterial: trimmed };
  }

  const indexedMaterials = new Map<number, string>();
  const roleMaterials = new Map<string, string>();
  const tokens = trimmed.split(',');

  let hasKeyValue = false;
  let positionalIndex = 0;

  for (let i = 0; i < tokens.length; i++) {
    const rawTok = tokens[i].trim();
    if (rawTok.length === 0) continue;

    const eqIdx = rawTok.indexOf('=');
    if (eqIdx !== -1) {
      hasKeyValue = true;
      const key = rawTok.substring(0, eqIdx).trim().toLowerCase();
      const val = rawTok.substring(eqIdx + 1).trim().toLowerCase();
      if (val.length === 0) continue;

      const numIdx = parseInt(key, 10);
      if (!isNaN(numIdx)) {
        indexedMaterials.set(numIdx, val);
      } else if (key.length > 0) {
        roleMaterials.set(key, val);
      }
    } else {
      indexedMaterials.set(positionalIndex++, rawTok.toLowerCase());
    }
  }

  return {
    isAuto: false,
    indexedMaterials: indexedMaterials.size > 0 ? indexedMaterials : undefined,
    roleMaterials: hasKeyValue && roleMaterials.size > 0 ? roleMaterials : undefined
  };
}

/**
 * Pre-compiles string tokens into resolved MaterialSpec instances once,
 * converting O(N * M) repeated lookups into O(1) direct object retrievals.
 */
export function compileMaterialSpec(parsed: ParsedMaterialSpec): CompiledMaterialSpec {
  if (parsed.isAuto) {
    return { isAuto: true };
  }

  let globalMaterialSpec: MaterialSpec | undefined;
  if (parsed.globalMaterial) {
    globalMaterialSpec = resolveMaterial(parsed.globalMaterial);
  }

  let indexedMaterialSpecs: Map<number, MaterialSpec> | undefined;
  if (parsed.indexedMaterials && parsed.indexedMaterials.size > 0) {
    indexedMaterialSpecs = new Map<number, MaterialSpec>();
    for (const [idx, name] of parsed.indexedMaterials.entries()) {
      indexedMaterialSpecs.set(idx, resolveMaterial(name));
    }
  }

  let roleMaterialSpecs: Map<string, MaterialSpec> | undefined;
  let namePatternSpecs: Array<{ pattern: string; spec: MaterialSpec }> | undefined;

  if (parsed.roleMaterials && parsed.roleMaterials.size > 0) {
    roleMaterialSpecs = new Map<string, MaterialSpec>();
    namePatternSpecs = [];
    for (const [role, name] of parsed.roleMaterials.entries()) {
      const spec = resolveMaterial(name);
      roleMaterialSpecs.set(role, spec);
      namePatternSpecs.push({ pattern: role, spec });
    }
  }

  return {
    isAuto: false,
    globalMaterialSpec,
    indexedMaterialSpecs,
    roleMaterialSpecs,
    namePatternSpecs
  };
}
