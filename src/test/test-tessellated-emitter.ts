// ==============================================================================
// src/test/test-tessellated-emitter.ts — Unit Tests for Adaptive AP242 Emitter (Phase 4)
// ==============================================================================

import {
  computeAnalyticalCoverageRatio,
  writeTessellatedShapeAP242
} from '../kernel/step/step-tessellated-emitter.js';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { StepStreamWriter } from '../kernel/step/step-stream-writer.js';
import { RawMesh } from '../types/geometry.js';
import { computeBoundingBox } from '../utils/math3d.js';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function runTessellatedEmitterTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  PHASE 4: ADAPTIVE AP242 ORGANIC EMITTER TESTS       '));
  console.log(chalk.bold.cyan('======================================================\n'));

  let passedCount = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ${chalk.green('✔')} ${name}`);
      passedCount++;
    } else {
      console.log(`  ${chalk.red('✖')} ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // TEST 1: Analytical Coverage Ratio Computation
  {
    const cadSurfaces = [
      { type: 'plane', area: 100 },
      { type: 'cylinder', area: 50 },
      { type: 'freeform', area: 10 }
    ];
    const etaCad = computeAnalyticalCoverageRatio(cadSurfaces);
    assertTest(
      'Coverage ratio: CAD model has high analytical coverage (> 0.8)',
      etaCad > 0.8 && etaCad >= 0.45,
      `eta: ${etaCad.toFixed(3)}`
    );

    const organicSurfaces = [
      { type: 'plane', area: 10 },
      { type: 'freeform', area: 200 }
    ];
    const etaOrganic = computeAnalyticalCoverageRatio(organicSurfaces);
    assertTest(
      'Coverage ratio: Organic model detected (< 0.45 threshold)',
      etaOrganic < 0.45,
      `eta: ${etaOrganic.toFixed(3)}`
    );
  }

  // TEST 2: High-Speed Streaming AP242 Tessellated Shape Generation
  {
    const tmpFile = path.join(os.tmpdir(), `test_tessellated_${Date.now()}.step`);
    const writer = new StepStreamWriter(tmpFile, 64 * 1024);
    const allocator = new StepIdAllocator(500);

    // Create a 4-triangle pyramid
    const positions = new Float32Array([
      0, 0, 0,
      10, 0, 0,
      5, 10, 0,
      5, 5, 8
    ]);
    const indices = new Uint32Array([
      0, 1, 2, // base
      0, 1, 3, // side 1
      1, 2, 3, // side 2
      2, 0, 3  // side 3
    ]);

    const mockMesh: RawMesh = {
      positions,
      indices,
      vertexCount: 4,
      triangleCount: 4,
      boundingBox: computeBoundingBox(positions)
    };

    const report = await writeTessellatedShapeAP242(writer, allocator, mockMesh, 'TEST_PYRAMID');
    await writer.close();

    const content = await fs.promises.readFile(tmpFile, 'utf8');
    await fs.promises.unlink(tmpFile);

    assertTest('Tessellated report: total vertices === 4', report.totalVertices === 4);
    assertTest('Tessellated report: total triangles === 4', report.totalTriangles === 4);
    assertTest(
      'STEP content: contains COORDINATES_LIST and TRIANGULATED_FACE',
      content.includes('COORDINATES_LIST') && content.includes('TRIANGULATED_FACE')
    );
    assertTest(
      'STEP content: contains TESSELLATED_SOLID',
      content.includes('TESSELLATED_SOLID') && content.includes('TEST_PYRAMID')
    );
  }

  const allPassed = passedCount === totalTests;
  console.log(chalk.bold[allPassed ? 'green' : 'red'](
    `\n  Adaptive Emitter Tests Result: ${passedCount}/${totalTests} Passed\n`
  ));
  return allPassed;
}

if (process.argv[1]?.includes('test-tessellated-emitter')) {
  runTessellatedEmitterTests().then(success => {
    if (!success) process.exit(1);
  });
}
