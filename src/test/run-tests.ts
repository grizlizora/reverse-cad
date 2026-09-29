// ==============================================================================
// src/test/run-tests.ts — Automated Ground-Truth Benchmark Test Runner CLI Driver
// ==============================================================================

import { runBenchmarkSuite, type BenchmarkSuiteResult } from './benchmark-runner.js';
import { runWatertightSolidHoleTests } from './test-watertight-solid-hole.js';
import { runWave8MathFixTests } from './test-wave8-math-fixes.js';
import { runWave9BugFixTests } from './test-wave9-bugfixes.js';
import { runWave10BugFixTests } from './test-wave10-bugfixes.js';
import { runBoundaryUnifierTests } from './test-boundary-unifier.js';
import { runCreasePreservationTests } from './test-crease-preservation.js';
import { runCrossPlatformMatrixTests } from './test-cross-platform-matrix.js';

export { runBenchmarkSuite, type BenchmarkSuiteResult };

async function main(): Promise<void> {
  runWave8MathFixTests();
  runWave9BugFixTests();
  runWave10BugFixTests();

  const crossPlatformSuccess = await runCrossPlatformMatrixTests();
  if (!crossPlatformSuccess) {
    process.exit(1);
  }

  const boundarySuccess = await runBoundaryUnifierTests();
  if (!boundarySuccess) {
    process.exit(1);
  }

  const creaseSuccess = await runCreasePreservationTests();
  if (!creaseSuccess) {
    process.exit(1);
  }

  const holeSuccess = await runWatertightSolidHoleTests();
  if (!holeSuccess) {
    process.exit(1);
  }

  const result = await runBenchmarkSuite();
  if (!result.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
