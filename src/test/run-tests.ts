// ==============================================================================
// src/test/run-tests.ts — Automated Ground-Truth Benchmark Test Runner CLI Driver
// ==============================================================================

import { runBenchmarkSuite, BenchmarkSuiteResult } from './benchmark-runner.js';

export { runBenchmarkSuite, BenchmarkSuiteResult };

async function main(): Promise<void> {
  const result = await runBenchmarkSuite();
  if (!result.success) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal Benchmark Error:', err);
  process.exit(1);
});
