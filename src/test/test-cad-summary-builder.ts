// ==============================================================================
// src/test/test-cad-summary-builder.ts — Unit Tests for CAD Summary Builder (Phase 4)
// ==============================================================================

import { buildCADFeaturesSummary } from '../stages/export/cad-summary-builder.js';
import { RawMesh, MeshShell } from '../types/geometry.js';
import { ProfilingResult } from '../stages/stage5-profiling.js';

export async function runCadSummaryBuilderTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('  PHASE 4: CAD SUMMARY BUILDER ARCHITECTURE TESTS');
  console.log('======================================================\n');

  let passedCount = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ✔ ${name}`);
      passedCount++;
    } else {
      console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // 1. Construct minimal synthetic RawMesh & Shell
  const positions = new Float32Array([
    0, 0, 0,
    10, 0, 0,
    10, 10, 0,
    0, 10, 0,
    0, 0, 10,
    10, 0, 10,
    10, 10, 10,
    0, 10, 10
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, // bottom
    4, 6, 5, 4, 7, 6, // top
    0, 4, 5, 0, 5, 1, // front
    2, 6, 7, 2, 7, 3, // back
    0, 3, 7, 0, 7, 4, // left
    1, 5, 6, 1, 6, 2  // right
  ]);
  const mesh: RawMesh = {
    positions,
    indices,
    vertexCount: 8,
    triangleCount: 12,
    boundingBox: {
      min: [0, 0, 0],
      max: [10, 10, 10],
      dimensions: [10, 10, 10],
      center: [5, 5, 5],
      diagonal: Math.hypot(10, 10, 10)
    }
  };

  const shell: MeshShell = {
    shellIndex: 0,
    triangleIndices: Array.from({ length: 12 }, (_, i) => i),
    signedVolume: 1000,
    surfaceArea: 600,
    isCavity: false,
    boundingBox: mesh.boundingBox
  };

  const profiling: ProfilingResult = {
    cavities: [],
    holes: [{
      id: 'hole_1',
      type: 'through',
      diameter: 3.0,
      depth: 10.0,
      axisOrigin: [5, 5, 0],
      axisDirection: [0, 0, 1],
      isThreaded: false
    }],
    threads: [],
    slots: [],
    fillets: [],
    chamfers: [],
    kinematicJoints: []
  };

  const summary = buildCADFeaturesSummary(
    mesh,
    [shell],
    profiling,
    'cube_part',
    undefined,
    undefined,
    'aluminum'
  );

  assertTest('Summary has correct modelName', summary.modelName === 'cube_part');
  assertTest('Summary bounding dimensions match', summary.boundingDimensionsMm[0] === 10 && summary.boundingDimensionsMm[1] === 10 && summary.boundingDimensionsMm[2] === 10);
  assertTest('Summary total volume is 1000', Math.abs(summary.totalVolumeMm3 - 1000) < 1e-2);
  assertTest('Materials summary generated', (summary.materialsSummary?.elements?.length ?? 0) >= 1);
  assertTest('Solid bodies array generated', summary.solidBodies !== undefined && summary.solidBodies.length >= 1);
  assertTest('Engineering features include holes', summary.engineeringFeatures.holes.length === 1);
  assertTest('Manufacturing recommendations generated', summary.manufacturingRecommendations !== undefined);

  console.log(`\n  CAD Summary Tests Result: ${passedCount}/${totalTests} Passed\n`);
  return passedCount === totalTests;
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('test-cad-summary-builder')) {
  runCadSummaryBuilderTests().then(ok => {
    if (!ok) process.exit(1);
  });
}
