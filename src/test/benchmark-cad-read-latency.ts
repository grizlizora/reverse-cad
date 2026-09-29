// ==============================================================================
// src/test/benchmark-cad-read-latency.ts — STEP Read Latency & Topology Benchmark (Phase 0)
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { StepTopologyLinter, TopologyValidationReport } from '../kernel/step/step-topology-linter.js';

export interface StepBenchmarkResult {
  filePath: string;
  fileSizeBytes: number;
  readDurationMs: number;
  lintDurationMs: number;
  report: TopologyValidationReport;
}

/**
 * Benchmarks the parsing latency and topological validity of a given STEP file.
 */
export async function benchmarkStepFile(stepFilePath: string): Promise<StepBenchmarkResult> {
  const stat = await fs.promises.stat(stepFilePath);
  const t0 = performance.now();
  const content = await fs.promises.readFile(stepFilePath, 'utf-8');
  const tRead = performance.now() - t0;

  const linter = new StepTopologyLinter();
  const report = linter.parseAndLintStep(content);

  return {
    filePath: stepFilePath,
    fileSizeBytes: stat.size,
    readDurationMs: tRead,
    lintDurationMs: report.linterDurationMs,
    report
  };
}

export function printBenchmarkSummary(results: StepBenchmarkResult[]): void {
  console.log(chalk.bold.cyan('\n============================================================================='));
  console.log(chalk.bold.cyan('                    STEP BENCHMARK & TOPOLOGY AUDIT REPORT                   '));
  console.log(chalk.bold.cyan('============================================================================='));
  console.log('| File                        | Size (KB) | Read (ms) | Lint (ms) | Solid? | Open Edges | Faces |');
  console.log('|-----------------------------|-----------|-----------|-----------|--------|------------|-------|');

  for (const r of results) {
    const baseName = path.basename(r.filePath).substring(0, 27).padEnd(27);
    const sizeKb = (r.fileSizeBytes / 1024).toFixed(1).padStart(9);
    const readMs = r.readDurationMs.toFixed(1).padStart(9);
    const lintMs = r.lintDurationMs.toFixed(1).padStart(9);
    const solid = (r.report.isValidSolid ? chalk.green('  YES ') : chalk.yellow('  NO  '));
    const openE = `${r.report.boundaryEdgeCount}`.padStart(10);
    const faces = `${r.report.totalFaces}`.padStart(5);
    console.log(`| ${baseName} | ${sizeKb} | ${readMs} | ${lintMs} | ${solid} | ${openE} | ${faces} |`);
  }
  console.log(chalk.bold.cyan('=============================================================================\n'));
}

async function main(): Promise<void> {
  const targetDir = process.argv[2] || 'output';
  if (!fs.existsSync(targetDir)) {
    console.log(`Target directory ${targetDir} does not exist. Skipping benchmark.`);
    return;
  }
  const files = (await fs.promises.readdir(targetDir))
    .filter(f => f.endsWith('.step') || f.endsWith('.stp'))
    .map(f => path.join(targetDir, f));

  if (files.length === 0) {
    console.log(`No STEP files found in ${targetDir}.`);
    return;
  }

  const results: StepBenchmarkResult[] = [];
  for (const file of files) {
    try {
      const res = await benchmarkStepFile(file);
      results.push(res);
    } catch (e: any) {
      console.error(`Failed to benchmark ${file}: ${e.message}`);
    }
  }
  printBenchmarkSummary(results);
}

if (process.argv[1]?.includes('benchmark-cad-read-latency')) {
  main().catch(console.error);
}
