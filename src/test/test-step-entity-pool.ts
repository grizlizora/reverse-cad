// ==============================================================================
// src/test/test-step-entity-pool.ts — Unit Tests for StepEntityPool & BRepGraphBuilder (Phase 3)
// ==============================================================================

import { StepEntityPool, formatStepNumber } from '../kernel/step/step-entity-pool.js';
import { StepBRepGraphBuilder } from '../kernel/step/step-brep-graph-builder.js';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { StepTopologyLinter } from '../kernel/step/step-topology-linter.js';
import chalk from 'chalk';

export async function runStepEntityPoolTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  PHASE 3: STEP ENTITY POOL & B-REP GRAPH BUILDER TESTS'));
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

  // TEST 1: ISO 10303-21 Compact Float Formatting
  {
    assertTest('formatStepNumber: 0 -> "0."', formatStepNumber(0) === '0.');
    assertTest('formatStepNumber: -0 -> "0."', formatStepNumber(-0) === '0.');
    assertTest('formatStepNumber: 15 -> "15."', formatStepNumber(15) === '15.');
    assertTest('formatStepNumber: 12.50000 -> "12.5"', formatStepNumber(12.50000) === '12.5');
    assertTest('formatStepNumber: 0.123456 -> "0.123456"', formatStepNumber(0.123456) === '0.123456');
  }

  // TEST 2: Spatial Deduplication of Cartesian Points (1e-5 mm tolerance)
  {
    const allocator = new StepIdAllocator(100);
    const pool = new StepEntityPool(allocator);

    const pt1 = pool.getOrCreateCartesianPoint(10.0, 20.0, 30.0);
    // Micro-jitter of 0.000003 mm (< 1e-5 mm)
    const pt2 = pool.getOrCreateCartesianPoint(10.000003, 20.0, 30.0);
    const pt3 = pool.getOrCreateCartesianPoint(50.0, 50.0, 50.0);

    assertTest('Spatial point deduplication: pt1 === pt2', pt1 === pt2, `pt1=${pt1}, pt2=${pt2}`);
    assertTest('Spatial point distinct: pt1 !== pt3', pt1 !== pt3, `pt1=${pt1}, pt3=${pt3}`);
  }

  // TEST 3: Normalized Direction Deduplication
  {
    const allocator = new StepIdAllocator(200);
    const pool = new StepEntityPool(allocator);

    const d1 = pool.getOrCreateDirection(0, 0, 1);
    const d2 = pool.getOrCreateDirection(0, 0, 100); // Same Z-direction
    const d3 = pool.getOrCreateDirection(1, 0, 0);

    assertTest('Direction deduplication: d1 === d2 (normalized)', d1 === d2, `d1=${d1}, d2=${d2}`);
    assertTest('Direction distinct: d1 !== d3', d1 !== d3, `d1=${d1}, d3=${d3}`);
  }

  // TEST 4: Topologically Stitched Adjacent Faces with Shared EDGE_CURVE (.T. and .F.)
  {
    const allocator = new StepIdAllocator(1000);
    const pool = new StepEntityPool(allocator);
    const builder = new StepBRepGraphBuilder(pool, allocator);

    // Two adjacent planar faces: Face A on [0..10] x [0..10], Face B on [10..20] x [0..10]
    // Shared boundary edge: between (10, 0, 0) and (10, 10, 0)
    const p00 = pool.getOrCreateCartesianPoint(0, 0, 0);
    const p10 = pool.getOrCreateCartesianPoint(10, 0, 0);
    const p11 = pool.getOrCreateCartesianPoint(10, 10, 0);
    const p01 = pool.getOrCreateCartesianPoint(0, 10, 0);
    const p20 = pool.getOrCreateCartesianPoint(20, 0, 0);
    const p21 = pool.getOrCreateCartesianPoint(20, 10, 0);

    // Face A (CCW): p00 -> p10 -> p11 -> p01
    // The shared edge at x=10 goes upwards from p10 to p11
    builder.addAdvancedFace({
      surfaceId: '#SURF_1',
      sameSense: true,
      outerLoopPtIds: [p00, p10, p11, p01]
    });

    // Face B (CCW): p10 -> p20 -> p21 -> p11
    // The shared edge at x=10 goes downwards from p11 to p10 (opposite to Face A!)
    builder.addAdvancedFace({
      surfaceId: '#SURF_1',
      sameSense: true,
      outerLoopPtIds: [p10, p20, p21, p11]
    });

    const poolBlock = pool.flushBuffer();
    const builderBlock = builder.flushBuffer();
    const fullText = poolBlock + builderBlock;

    const stats = builder.getStats();
    assertTest('BRep Graph Builder: emitted exactly 2 faces', stats.faceCount === 2);
    // Face A has 4 edges, Face B has 4 edges, 1 is shared -> exactly 7 unique edge curves!
    assertTest(
      'BRep Graph Builder: shared edge deduplicated (7 edge curves instead of 8)',
      stats.edgeCurveCount === 7,
      `Actual edges: ${stats.edgeCurveCount}`
    );

    // Verify with StepTopologyLinter
    const linter = new StepTopologyLinter();
    const report = linter.parseAndLintStep(fullText);
    assertTest(
      'Topological stitch: zero inverted normal orientations',
      report.invertedOrientationCount === 0,
      `Inverted count: ${report.invertedOrientationCount}`
    );
  }

  const allPassed = passedCount === totalTests;
  console.log(chalk.bold[allPassed ? 'green' : 'red'](
    `\n  StepEntityPool Tests Result: ${passedCount}/${totalTests} Passed\n`
  ));
  return allPassed;
}

if (process.argv[1]?.includes('test-step-entity-pool')) {
  runStepEntityPoolTests().then(success => {
    if (!success) process.exit(1);
  });
}
