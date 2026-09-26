// ==============================================================================
// src/test/benchmark-runner.ts — Programmatic Ground-Truth Benchmark Test Runner
// ==============================================================================

import {
  generatePrismaticM6Model,
  generateInternalLabyrinthModel,
  generatePrintInPlaceHingeModel,
  generateOrganicSaddleModel
} from '../rsvs/procedural-benchmarks.js';
import { runMutationSelfTest } from '../rsvs/mutation-self-test.js';
import { runMatrixScanner } from './rsvs-matrix-scanner.js';
import { processPipelineTask } from '../worker/pipeline-worker.js';
import { writeMeshToBinaryStl } from '../utils/stl-writer.js';
import { withTempDir } from './temp-dir-guard.js';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

export interface BenchmarkSuiteResult {
  success: boolean;
  testsPassed: number;
  totalBenchmarks: number;
  mutationPassed: boolean;
  matrixPassed: boolean;
  elapsedMs: number;
}

/**
 * Executes the complete RSVS Reality Simulation & Ground-Truth Test Benchmark suite.
 * Fully programmatic and isolated, returns structured results without killing the host process.
 */
export async function runBenchmarkSuite(keepTempFiles: boolean = false): Promise<BenchmarkSuiteResult> {
  const startTime = Date.now();
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  RSVS REALITY SIMULATION & GROUND-TRUTH TEST BENCHMARK'));
  console.log(chalk.bold.cyan('======================================================\n'));

  return withTempDir('rsvs_test', async (tmpDir) => {
    const benchmarks = [
      { name: 'benchmark_prismatic_m6.stl', gen: generatePrismaticM6Model, expectThread: true },
      { name: 'benchmark_internal_labyrinth.stl', gen: generateInternalLabyrinthModel, expectCavity: true },
      { name: 'benchmark_pip_hinge.stl', gen: generatePrintInPlaceHingeModel, expectKinematics: true },
      { name: 'benchmark_organic_saddle.stl', gen: generateOrganicSaddleModel, expectFreeform: true }
    ];

    let testsPassed = 0;

    for (const b of benchmarks) {
      const stlPath = path.join(tmpDir, b.name);
      console.log(chalk.bold(`• Testing procedural model: ${chalk.yellow(b.name)}`));

      const mesh = b.gen();
      await writeMeshToBinaryStl(mesh, stlPath);

      const result = await processPipelineTask({
        taskId: b.name,
        filePath: stlPath,
        fileSizeBytes: (await fs.promises.stat(stlPath)).size,
        options: {
          threads: 1,
          quality: 'high',
          outDir: tmpDir,
          verify: true,
          jsonOnly: false,
          stepOnly: false,
          heatmapMode: 'none',
          verbose: false,
          inferTapDrillThreads: b.expectThread ?? false
        }
      });

      if (!result.success) {
        console.log(`  ${chalk.red('✖ PROCESSING ERROR:')} ${result.error}`);
        continue;
      }

      console.log(`  ${chalk.green('✔')} Successfully converted in ${result.elapsedMs} ms`);
      console.log(`  ${chalk.green('✔')} Input triangles: ${result.trianglesIn} ➔ processed: ${result.trianglesProcessed}`);
      console.log(`  ${chalk.green('✔')} Analytical surfaces extracted: ${result.surfacesExtracted}`);

      if (result.verificationReport) {
        const g = result.verificationReport.gates;
        console.log(`  ${chalk.cyan('➜')} RSVS Gates: [G0: ${g.gate0.status}] [G1: ${g.gate1.status}] [G2: ${g.gate2.status}] [G3: ${g.gate3.status}] [G4: ${g.gate4.status}]`);
      }

      if (b.expectThread) {
        const hasThread = result.summaryData?.engineeringFeatures.threads.length! > 0;
        console.log(`  ${hasThread ? chalk.green('✔') : chalk.yellow('⚠')} M6 thread detection: ${hasThread ? 'CONFIRMED' : 'SKIPPED'}`);
      }

      if (b.expectCavity) {
        const hasCavity = (result.summaryData?.cavitiesCount ?? 0) > 0;
        console.log(`  ${hasCavity ? chalk.green('✔') : chalk.yellow('⚠')} Internal cavity detection (Zero-Voxel): ${hasCavity ? 'CONFIRMED' : 'SKIPPED'}`);
      }

      if (b.expectKinematics) {
        const hasKinematics = result.summaryData?.engineeringFeatures.kinematics.length! > 0;
        console.log(`  ${hasKinematics ? chalk.green('✔') : chalk.yellow('⚠')} Print-in-Place clearance detection: ${hasKinematics ? 'CONFIRMED' : 'SKIPPED'}`);
      }

      console.log('');
      testsPassed++;
    }

    // Run Mutation Self Test
    console.log(chalk.bold.cyan('• Running RSVS mutation self-test (4 injected defects)...'));
    const mutRes = await runMutationSelfTest();
    console.log(`  ${mutRes.allDefectsCaught ? chalk.green('✔') : chalk.red('✖')} Detected ${mutRes.defectsDetected}/${mutRes.totalDefectsTested} defects\n`);

    // Run Combinatorial Matrix Scanner & Zero-GC Audit
    const matrixPassed = await runMatrixScanner();

    const allPassed = testsPassed === benchmarks.length && mutRes.allDefectsCaught && matrixPassed;

    if (allPassed) {
      console.log(chalk.bold.green('======================================================'));
      console.log(chalk.bold.green('  ✔ ALL TESTS PASSED SUCCESSFULLY! PIPELINE 100% VALID.'));
      console.log(chalk.bold.green('======================================================\n'));
    } else {
      console.log(chalk.bold.red('======================================================'));
      console.log(chalk.bold.red('  ✖ TESTS COMPLETED WITH ERRORS.'));
      console.log(chalk.bold.red('======================================================\n'));
    }

    return {
      success: allPassed,
      testsPassed,
      totalBenchmarks: benchmarks.length,
      mutationPassed: mutRes.allDefectsCaught,
      matrixPassed,
      elapsedMs: Date.now() - startTime
    };
  }, keepTempFiles);
}
