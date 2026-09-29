// ==============================================================================
// src/test/test-material-properties.ts — Material Resolution & Assignment Tests
// ==============================================================================

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  resolveMaterial,
  listStandardMaterials,
  loadMaterialCatalogFile
} from '../standards/material-catalog.js';
import {
  parseMaterialSpec,
  resolveBodyMaterials
} from '../standards/material-assignment.js';
import { MeshShell } from '../types/geometry.js';
import { ClassifiedBody } from '../utils/body-classifier.js';

describe('Material Catalog Resolution & Assignment', () => {

  it('correctly resolves physical & optical properties for Glass, Metals, and Composites without substring collision', () => {
    const glass = resolveMaterial('glass');
    assert.strictEqual(glass.id, 'glass');
    assert.strictEqual(glass.densityGcm3, 2.23);
    assert.strictEqual(glass.transparency, 0.85);
    assert.strictEqual(glass.refractiveIndex, 1.52);

    const ukrGlass = resolveMaterial('sklo');
    assert.strictEqual(ukrGlass.id, 'glass');
    assert.strictEqual(resolveMaterial('скло').id, 'glass');

    // Verify no false-positive collision between "car"/"carb" and "polycarbonate"
    assert.strictEqual(resolveMaterial('car').id, 'carbon_fiber');
    assert.strictEqual(resolveMaterial('carb').id, 'carbon_fiber');
    assert.strictEqual(resolveMaterial('carbon').id, 'carbon_fiber');
    assert.strictEqual(resolveMaterial('polycarb').id, 'polycarbonate');

    // Verify 3-letter polymer keys ("pla", "abs", "pom") never falsely match inside unrelated words
    assert.strictEqual(resolveMaterial('plate').id, 'steel');
    assert.strictEqual(resolveMaterial('template_part').id, 'steel');
    assert.strictEqual(resolveMaterial('slab').id, 'steel');
    assert.strictEqual(resolveMaterial('pommel').id, 'steel');

    // Verify multi-word full display names and parenthetical grades resolve 1:1
    assert.strictEqual(resolveMaterial('Structural Carbon Steel (AISI 1020)').id, 'mild_steel');
    assert.strictEqual(resolveMaterial('Soda-Lime Float Glass').id, 'soda_lime_glass');
    assert.strictEqual(resolveMaterial('Titanium Grade 5 (Ti-6Al-4V)').id, 'titanium');
    assert.strictEqual(resolveMaterial('POM / Polyacetal (Delrin)').id, 'pom');

    const steel = resolveMaterial('steel');
    assert.strictEqual(steel.densityGcm3, 7.98);
    assert.strictEqual(steel.transparency, 0.0);

    const alu = resolveMaterial('alu');
    assert.strictEqual(alu.id, 'aluminum');
    assert.strictEqual(alu.densityGcm3, 2.70);

    const all = listStandardMaterials();
    assert.strictEqual(all.length, 19);

    const fromJson = loadMaterialCatalogFile();
    assert.strictEqual(fromJson.length, 19);
  });

  it('parses diverse multi-material CLI specification strings', () => {
    // 1. Single global material
    const s1 = parseMaterialSpec('glass');
    assert.strictEqual(s1.isAuto, false);
    assert.strictEqual(s1.globalMaterial, 'glass');

    // 2. Comma-separated positional list
    const s2 = parseMaterialSpec('aluminum, glass, steel');
    assert.strictEqual(s2.isAuto, false);
    assert.strictEqual(s2.indexedMaterials?.get(0), 'aluminum');
    assert.strictEqual(s2.indexedMaterials?.get(1), 'glass');
    assert.strictEqual(s2.indexedMaterials?.get(2), 'steel');

    // 3. Indexed key-value mapping
    const s3 = parseMaterialSpec('0=steel, 1=glass, 2=pom');
    assert.strictEqual(s3.isAuto, false);
    assert.strictEqual(s3.indexedMaterials?.get(0), 'steel');
    assert.strictEqual(s3.indexedMaterials?.get(1), 'glass');
    assert.strictEqual(s3.indexedMaterials?.get(2), 'pom');

    // 4. Role-based mapping
    const s4 = parseMaterialSpec('base=aluminum, arm=glass');
    assert.strictEqual(s4.isAuto, false);
    assert.strictEqual(s4.roleMaterials?.get('base'), 'aluminum');
    assert.strictEqual(s4.roleMaterials?.get('arm'), 'glass');

    // 5. Auto heuristic
    const s5 = parseMaterialSpec('auto');
    assert.strictEqual(s5.isAuto, true);
  });

  it('assigns different materials to different bodies of an assembly', () => {
    const dummyBox = {
      min: [0, 0, 0] as [number, number, number],
      max: [10, 10, 10] as [number, number, number],
      dimensions: [10, 10, 10] as [number, number, number],
      center: [5, 5, 5] as [number, number, number],
      diagonal: 17.32
    };

    const shells: MeshShell[] = [
      { shellIndex: 0, triangleIndices: [0, 1, 2], signedVolume: 1000.0, surfaceArea: 600.0, isCavity: false, boundingBox: dummyBox },
      { shellIndex: 1, triangleIndices: [3, 4, 5], signedVolume: 500.0, surfaceArea: 350.0, isCavity: false, boundingBox: dummyBox }
    ];

    const classified: ClassifiedBody[] = [
      { shell: shells[0], name: 'Body_1_Enclosure', role: 'base', colorLabel: 'Gray', colorRgb: [0.5, 0.5, 0.5] },
      { shell: shells[1], name: 'Body_2_OpticalWindow', role: 'arm', colorLabel: 'Clear', colorRgb: [0.9, 0.9, 1.0] }
    ];

    const assigned = resolveBodyMaterials(shells, classified, '0=aluminum, 1=glass');

    assert.strictEqual(assigned.length, 2);
    assert.strictEqual(assigned[0].name, 'Body_1_Enclosure');
    assert.strictEqual(assigned[0].materialName, 'Aluminum 6061-T6');
    assert.strictEqual(assigned[0].densityGcm3, 2.70);
    assert.strictEqual(assigned[0].transparency, 0.0);

    assert.strictEqual(assigned[1].name, 'Body_2_OpticalWindow');
    assert.strictEqual(assigned[1].materialName, 'Borosilicate Glass');
    assert.strictEqual(assigned[1].densityGcm3, 2.23);
    assert.strictEqual(assigned[1].transparency, 0.85);
    assert.strictEqual(assigned[1].refractiveIndex, 1.52);
  });
});
