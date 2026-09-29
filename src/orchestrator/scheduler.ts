// ==============================================================================
// src/orchestrator/scheduler.ts — Hardened Resilient Orchestrator with DWRR & Watchdog
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { PipelineOptions, PipelineResult } from '../types/worker.js';
import { TerminalRenderer } from '../tui/terminal-renderer.js';
import { calculateSystemBudget } from './resource-calculator.js';
import { DWRRMeshScheduler } from './dwrr-queue.js';
import { MemoryCircuitBreaker } from './watchdog-guard.js';
import { discoverAndEnqueueFiles } from './file-discovery.js';
import { ManifestSink } from './manifest-sink.js';
import { initializeWorkerPool, executeWorkerPool } from './worker-pool-manager.js';

export * from './file-discovery.js';
export * from './manifest-sink.js';
export * from './worker-pool-manager.js';

export async function runScheduler(inputPath: string, options: PipelineOptions): Promise<PipelineResult[]> {
  const budget = calculateSystemBudget(options.threads);
  const baseConcurrency = budget.recommendedThreads;
  const memoryBreaker = new MemoryCircuitBreaker();
  const scheduler = new DWRRMeshScheduler();

  // 1. Discover STL files and populate 3-tier DWRR Queue
  const discovery = await discoverAndEnqueueFiles(inputPath, scheduler);
  if (!discovery.isValid || discovery.totalFilesCount === 0) {
    return [];
  }
  const totalFilesCount = discovery.totalFilesCount;

  // 2. Ensure output directory exists and setup manifest sink
  await fs.promises.mkdir(options.outDir, { recursive: true });
  const manifestSink = new ManifestSink(options.outDir);

  console.log(chalk.bold.cyan(`\n🚀 LAUNCHING RESILIENT PIPELINE CONVERSION-PULSE`));
  console.log(` • Models in DWRR queue: ${chalk.bold.green(totalFilesCount)}`);
  console.log(` • Base concurrency: ${chalk.bold.green(baseConcurrency)} (Apple Silicon P-Cores: ${budget.performanceCores}, ${budget.heapPerWorkerMb} MB/worker)`);
  console.log(` • Protection: Dynamic Watchdog + Memory Circuit Breaker + Multi-Tier Fallback`);
  console.log(` • Streaming manifest log: ${chalk.cyan(manifestSink.manifestPath)}\n`);

  const renderer = new TerminalRenderer(baseConcurrency, totalFilesCount, discovery.discoveredFiles);

  // Initialize Piscina worker pool
  const pool = initializeWorkerPool(baseConcurrency, budget.heapPerWorkerMb);

  // Trap process exit and signals to guarantee terminal restoration
  const restoreCursorHandler = () => {
    renderer.stop();
  };
  process.once('SIGINT', restoreCursorHandler);
  process.once('SIGTERM', restoreCursorHandler);

  const results = await executeWorkerPool(
    {
      baseConcurrency,
      totalFilesCount,
      heapPerWorkerMb: budget.heapPerWorkerMb,
      scheduler,
      options,
      renderer,
      manifestSink,
      memoryBreaker
    },
    pool
  );

  if (pool) {
    await pool.destroy();
  }

  await manifestSink.close();
  renderer.stop();
  process.removeListener('SIGINT', restoreCursorHandler);
  process.removeListener('SIGTERM', restoreCursorHandler);

  // Print final summary
  const passedCount = results.filter(r => r.success).length;
  const failedCount = results.filter(r => !r.success).length;

  console.log(chalk.bold.green(`\n✔ BATCH PROCESSING COMPLETED:`));
  console.log(` • Successfully converted: ${chalk.bold.green(passedCount)}`);
  if (failedCount > 0) {
    console.log(` • Failed or quarantined: ${chalk.bold.red(failedCount)}`);
  }
  console.log(` • Results saved to: ${chalk.cyan(options.outDir)}`);
  console.log(` • Manifest log: ${chalk.cyan(manifestSink.manifestPath)}`);

  // Display all generated files with exact sizes and purpose
  if (passedCount > 0) {
    console.log(chalk.bold.cyan(`\n📦 Generated Output Artifacts:`));
    for (const r of results) {
      if (r.success) {
        const base = path.basename(r.filePath, path.extname(r.filePath));
        const artifacts: { name: string; desc: string; size: string }[] = [];

        const registerArtifact = (filePath?: string, desc?: string) => {
          if (filePath && fs.existsSync(filePath)) {
            const sz = fs.statSync(filePath).size;
            const szStr = sz >= 1024 * 1024 ? `${(sz / (1024 * 1024)).toFixed(2)} MB` : `${(sz / 1024).toFixed(1)} KB`;
            artifacts.push({ name: path.basename(filePath), desc: desc || '', size: szStr });
          }
        };

        registerArtifact(r.stepFilePath, '3D CAD Solid B-Rep');
        registerArtifact(r.jsonSummaryPath, 'Engineering features summary (<1200 tok)');
        registerArtifact(r.jsonTopologyPath, 'B-Rep topology graph');

        const repPath = path.join(options.outDir, `${base}.verification_report.json`);
        registerArtifact(repPath, 'RSVS quality verification audit');

        const heatPath = r.verificationReport?.summary?.heatmapPath || path.join(options.outDir, `${base}.heatmap.glb`);
        registerArtifact(heatPath, '3D deviation heatmap (.glb)');

        for (const a of artifacts) {
          console.log(`   • ${chalk.bold.white(a.name)} ${chalk.gray(`(${a.size})`)} ➔ ${chalk.cyan(a.desc)}`);
        }
      }
    }
    console.log('');
  }

  return results;
}
