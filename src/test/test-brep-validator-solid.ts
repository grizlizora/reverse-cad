// ==============================================================================
// src/test/test-brep-validator-solid.ts — Isolated Solid B-Rep Verification Suite
// ==============================================================================

import { StepBrepValidator, StepStreamingLexer } from '../kernel/step/step-brep-validator.js';
import { SYNTHETIC_WATERTIGHT_CUBE_STEP } from './fixtures/step-topology-fixtures.js';
import { withTempDir } from './temp-dir-guard.js';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

export async function runBrepValidatorSolidTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n--- [INTEGRATION] StepBrepValidator Solid Verification ---'));
  let passedCount = 0;
  let totalTests = 0;

  function assertCondition(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ${chalk.green('✔')} ${name}`);
      passedCount++;
    } else {
      console.log(`  ${chalk.red('✖')} ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // Executed within an isolated RAII temp directory — completely race-free
  const solidSuiteSuccess = await withTempDir('brep_validator_solid', async (tmpDir) => {
    const tmpCubePath = path.join(tmpDir, 'cube_watertight.step');
    await fs.promises.writeFile(tmpCubePath, SYNTHETIC_WATERTIGHT_CUBE_STEP, 'utf-8');

    // 1. StepStreamingLexer 64-byte chunk boundary stitch test
    try {
      const chunkedEntities: string[] = [];
      StepStreamingLexer.scanFileChunks(tmpCubePath, (id) => chunkedEntities.push(id), 64);
      assertCondition(
        'StepStreamingLexer.scanFileChunks: 64-byte boundary stitching on file stream',
        chunkedEntities.length === 28,
        `Expected 28 entities, got ${chunkedEntities.length}`
      );
    } catch (err: unknown) {
      assertCondition('scanFileChunks execution', false, String(err));
    }

    // 2. StepBrepValidator synthetic solid evaluation
    const validator = new StepBrepValidator();
    try {
      const cubeReport = validator.validate(tmpCubePath);

      assertCondition('Synthetic Cube: Watertight solid verification', cubeReport.isWatertight && cubeReport.isValidSolid);
      assertCondition('Synthetic Cube: 2-Manifold mesh topology', cubeReport.is2Manifold && cubeReport.openEdgesCount === 0);
      assertCondition('Synthetic Cube: Detected shells count === 1', cubeReport.detectedShellsCount === 1);
      assertCondition('Synthetic Cube: Exactly 12 geometric edges', cubeReport.totalGeometricEdges === 12);
      assertCondition(
        'Synthetic Cube: Euler-Poincaré characteristic chi === 2',
        cubeReport.shells[0]?.eulerCharacteristic === 2,
        `Got chi=${cubeReport.shells[0]?.eulerCharacteristic}`
      );
    } catch (err: unknown) {
      assertCondition('Synthetic Cube validation execution', false, String(err));
    }

    // 3. Entity Inspector & Loop Pair Checker
    try {
      const inspected = validator.inspectPointRegion(0, 0, 0, 0.1);
      const hasPointsAndLoops = inspected.points.length > 0 && inspected.matchingLoops.length > 0;
      assertCondition('Entity Inspector: Point & Loop query in origin neighborhood', hasPointsAndLoops);

      const pairMatches = validator.checkLoopPairs([['#1', '#2']]);
      const matches = pairMatches.get('#1_#2');
      assertCondition(
        'Loop Pair Checker: Edge #1-#2 is shared by exactly 2 loops with opposing half-edges',
        matches !== undefined && matches.length === 2,
        `Got matches count: ${matches?.length}`
      );
    } catch (err: unknown) {
      assertCondition('Topology inspection execution', false, String(err));
    }

    // 4. Optional Heavy Real-Model Integration Check (Gated)
    const actualModelPath = path.join(process.cwd(), 'test_output', 'Metric_thread_testblock_v2.step');
    if (fs.existsSync(actualModelPath)) {
      try {
        const modelReport = validator.validate(actualModelPath);
        const isValidThreadBlock = modelReport.isWatertight && modelReport.isValidSolid && modelReport.totalBoreSpanners === 0;
        assertCondition(
          `Real Model Integration: Watertight, 0 Bore Spanners (${(modelReport.fileSizeBytes / 1e6).toFixed(1)} MB)`,
          isValidThreadBlock,
          `Watertight=${modelReport.isWatertight}, BoreSpanners=${modelReport.totalBoreSpanners}`
        );
      } catch (err: unknown) {
        assertCondition('Real Model validation execution', false, String(err));
      }
    } else {
      console.log(`  ${chalk.gray('ℹ')} Optional heavy real model skipped (not present in test_output)`);
    }

    return passedCount === totalTests;
  });

  return solidSuiteSuccess;
}

if (process.argv[1]?.includes('test-brep-validator-solid')) {
  runBrepValidatorSolidTests().then(success => {
    if (!success) process.exit(1);
  });
}
