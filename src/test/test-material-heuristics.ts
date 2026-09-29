// ==============================================================================
// src/test/test-material-heuristics.ts — Unit & Edge Case Audit for Material Heuristics
// ==============================================================================

import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  parseMaterialSpec,
  compileMaterialSpec
} from '../standards/material-spec-parser.js';
import {
  extractSortedDimensions,
  inferSemanticMaterial
} from '../standards/material-heuristics.js';
import { resolveBodyMaterials } from '../standards/material-assignment.js';
import { MeshShell } from '../types/geometry.js';
import { ClassifiedBody } from '../utils/body-classifier.js';

describe('Material Parser & Heuristics Resilience Suite', () => {

  it('resiliently handles malformed and edge-case CLI strings without crash', () => {
    // Empty / whitespace
    assert.strictEqual(parseMaterialSpec('').isAuto, true);
    assert.strictEqual(parseMaterialSpec('   ').isAuto, true);
    assert.strictEqual(parseMaterialSpec(undefined).isAuto, true);

    // Malformed tokens: dangling equals, extra commas
    const malformed = parseMaterialSpec('0=steel,1=,,,2=pom,=glass');
    assert.strictEqual(malformed.isAuto, false);
    assert.strictEqual(malformed.indexedMaterials?.get(0), 'steel');
    assert.strictEqual(malformed.indexedMaterials?.get(2), 'pom');
    // Dangling key "1=" should not crash or corrupt other entries
    assert.strictEqual(malformed.indexedMaterials?.has(1), false);

    // Compiled spec
    const compiled = compileMaterialSpec(malformed);
    assert.strictEqual(compiled.indexedMaterialSpecs?.get(0)?.id, 'steel');
    assert.strictEqual(compiled.indexedMaterialSpecs?.get(2)?.id, 'pom');
  });

  it('extractSortedDimensions sorts dimensions in CPU registers with zero heap allocations', () => {
    const s1 = extractSortedDimensions([10, 5, 2]);
    assert.deepStrictEqual(s1, { min: 2, mid: 5, max: 10 });

    const s2 = extractSortedDimensions([1, 100, 50]);
    assert.deepStrictEqual(s2, { min: 1, mid: 50, max: 100 });

    const s3 = extractSortedDimensions([7, 7, 7]);
    assert.deepStrictEqual(s3, { min: 7, mid: 7, max: 7 });

    const s4 = extractSortedDimensions([0.1, 5.5, 0.05]);
    assert.deepStrictEqual(s4, { min: 0.05, mid: 0.1, max: 5.5 });
  });

  it('infers semantic materials for optical glass, pins, and external threaded studs', () => {
    const thinBox = {
      min: [0, 0, 0] as [number, number, number],
      max: [50, 50, 2] as [number, number, number],
      dimensions: [50, 50, 2] as [number, number, number],
      center: [25, 25, 1] as [number, number, number],
      diagonal: 70.7
    };

    const shellGlass: MeshShell = {
      shellIndex: 0,
      triangleIndices: [0, 1, 2],
      signedVolume: 5000.0,
      surfaceArea: 5400.0,
      isCavity: false,
      boundingBox: thinBox
    };

    const glassBody: ClassifiedBody = {
      shell: shellGlass,
      name: 'Inspection_Window_Cover',
      role: 'component',
      colorLabel: 'Clear',
      colorRgb: [0.9, 0.9, 1.0]
    };

    const inferredGlass = inferSemanticMaterial(shellGlass, glassBody);
    assert.strictEqual(inferredGlass.category, 'glass');

    // Mechanical pin heuristic
    const pinBody: ClassifiedBody = {
      shell: shellGlass,
      name: 'Pivot_Hinge_Pin',
      role: 'link',
      colorLabel: 'Silver',
      colorRgb: [0.7, 0.7, 0.7]
    };
    const inferredPin = inferSemanticMaterial(shellGlass, pinBody);
    assert.strictEqual(inferredPin.id, 'steel');
  });

  it('correctly passes through resolveBodyMaterials with compiled spec', () => {
    const box = {
      min: [0, 0, 0] as [number, number, number],
      max: [10, 10, 10] as [number, number, number],
      dimensions: [10, 10, 10] as [number, number, number],
      center: [5, 5, 5] as [number, number, number],
      diagonal: 17.32
    };
    const shell: MeshShell = {
      shellIndex: 0,
      triangleIndices: [0],
      signedVolume: 1000,
      surfaceArea: 600,
      isCavity: false,
      boundingBox: box
    };
    const bodies = resolveBodyMaterials([shell], [], 'titanium');
    assert.strictEqual(bodies.length, 1);
    assert.strictEqual(bodies[0].materialSpec.id, 'titanium');
  });
});
