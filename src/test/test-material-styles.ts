// ==============================================================================
// src/test/test-material-styles.ts — STEP Material Styles & Mass Calculation Tests
// ==============================================================================

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { writeBodyPresentationStyles, writeMaterialDesignations } from '../kernel/step/step-presentation-styles.js';
import { buildCADFeaturesSummary } from '../stages/export/cad-summary-builder.js';
import { MeshShell } from '../types/geometry.js';

describe('Material Presentation Styles & Mass Summary', () => {

  it('generates transparent ISO 10303-46 presentation styles and material designations', async () => {
    let output = '';
    const mockWriter: any = {
      writeLine: async (line: string) => { output += line + '\n'; }
    };
    const allocator = new StepIdAllocator(10);

    const bodyConfigs = [
      {
        name: 'Lens',
        colorRgb: [0.90, 0.95, 1.00] as [number, number, number],
        colorLabel: 'Glass',
        materialName: 'Borosilicate Glass',
        densityGcm3: 2.23,
        transparency: 0.85
      },
      {
        name: 'Mount',
        colorRgb: [0.75, 0.76, 0.78] as [number, number, number],
        colorLabel: 'Steel',
        materialName: 'Stainless Steel 316L',
        densityGcm3: 7.98,
        transparency: 0.0
      }
    ];

    // Presentation styles
    const styles = await writeBodyPresentationStyles(mockWriter, allocator, bodyConfigs);
    assert.strictEqual(styles.length, 2);
    assert.ok(output.includes('SURFACE_STYLE_TRANSPARENT(0.8500);'));

    // Material designations
    const matIds = await writeMaterialDesignations(mockWriter, allocator, bodyConfigs, ['#50', '#60']);
    assert.strictEqual(matIds.length, 2);
    assert.ok(output.includes("MATERIAL_DESIGNATION('Borosilicate Glass', (#50));"));
    assert.ok(output.includes("PROPERTY_DEFINITION('density_g_cm3', '2.2300'"));
    assert.ok(output.includes("MATERIAL_DESIGNATION('Stainless Steel 316L', (#60));"));
  });

  it('calculates individual and multi-material total mass in JSON summary', () => {
    const rawMesh: any = {
      positions: new Float64Array([0,0,0, 10,0,0, 0,10,0]),
      indices: new Uint32Array([0, 1, 2]),
      triangleCount: 1,
      vertexCount: 3,
      boundingBox: {
        min: [0, 0, 0],
        max: [10, 10, 10],
        dimensions: [10, 10, 10],
        center: [5, 5, 5],
        diagonal: 17.32
      }
    };

    const dummyBox = rawMesh.boundingBox;
    const shells: MeshShell[] = [
      { shellIndex: 0, triangleIndices: [0], signedVolume: 10000.0, surfaceArea: 1200.0, isCavity: false, boundingBox: dummyBox }, // 10 cm³
      { shellIndex: 1, triangleIndices: [0], signedVolume: 2000.0, surfaceArea: 400.0, isCavity: false, boundingBox: dummyBox }   // 2 cm³
    ];

    const profiling: any = {
      holes: [],
      threads: [],
      cavities: [],
      kinematicJoints: []
    };

    // Body 0: Aluminum (10 cm³ * 2.7 g/cm³ = 27.0 g)
    // Body 1: Glass (2 cm³ * 2.23 g/cm³ = 4.46 g)
    // Total Mass = 31.46 g
    const summary = buildCADFeaturesSummary(
      rawMesh,
      shells,
      profiling,
      'test_optics',
      undefined,
      undefined,
      '0=aluminum, 1=glass'
    );

    assert.ok(summary.materialsSummary);
    assert.strictEqual(summary.materialsSummary.hasTransparentOptics, true);
    assert.strictEqual(summary.materialsSummary.elements.length, 2);

    const el0 = summary.materialsSummary.elements[0];
    assert.strictEqual(el0.materialName, 'Aluminum 6061-T6');
    assert.strictEqual(el0.densityGcm3, 2.7);
    assert.strictEqual(el0.massGrams, 27.0);

    const el1 = summary.materialsSummary.elements[1];
    assert.strictEqual(el1.materialName, 'Borosilicate Glass');
    assert.strictEqual(el1.densityGcm3, 2.23);
    assert.strictEqual(el1.massGrams, 4.46);
    assert.strictEqual(el1.transparency, 0.85);

    assert.strictEqual(summary.materialsSummary.totalMassGrams, 31.46);
  });
});
