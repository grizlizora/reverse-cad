// ==============================================================================
// scripts/benchmark_latency.ts — High-Precision Pipeline Latency Benchmark
// ==============================================================================

import { generatePrismaticM6Model, generateInternalLabyrinthModel, generateOrganicSaddleModel } from '../src/rsvs/procedural-benchmarks.js';
import { decimateMesh } from '../src/stages/stage2-decimate.js';
import { sanitizeTopology } from '../src/stages/stage3-sanitize.js';
import { segmentSurfaces } from '../src/stages/stage4-segmentation.js';
import { profileFeatures } from '../src/stages/stage5-profiling.js';
import { exportBRepStep } from '../src/stages/stage6-brep-step.js';
import { exportCADJson } from '../src/stages/stage7-export-json.js';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

async function benchmarkModel(name: string, meshGenerator: () => any) {
  console.log(chalk.bold.cyan(`\n⚡ BENCHMARKING MODEL: ${chalk.yellow(name)}`));
  const mesh = meshGenerator();
  const tmpDir = path.join(os.tmpdir(), `bench_${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const timings: Record<string, number> = {};
  const tTotalStart = performance.now();

  // Stage 2: Decimate
  let t0 = performance.now();
  const decimated = decimateMesh(mesh, { maxTrianglesThreshold: 80000 });
  timings['Stage 2: QEM Decimation'] = performance.now() - t0;

  // Stage 3: Sanitize
  t0 = performance.now();
  const sanitized = sanitizeTopology(decimated);
  timings['Stage 3: Topology Sanitize'] = performance.now() - t0;

  // Stage 4: Surface Segment (RANSAC)
  t0 = performance.now();
  const surfaces = segmentSurfaces(sanitized.cleanedMesh);
  timings['Stage 4: Surface Segmentation'] = performance.now() - t0;

  // Stage 5: Feature Profiling
  t0 = performance.now();
  const profiling = profileFeatures(sanitized.cleanedMesh, surfaces, sanitized.shells);
  timings['Stage 5: Feature Profiling'] = performance.now() - t0;

  // Stage 6: STEP Solid Synthesis
  t0 = performance.now();
  await exportBRepStep(sanitized.cleanedMesh, surfaces, profiling.threads, tmpDir, 'bench_model');
  timings['Stage 6: STEP Synthesis'] = performance.now() - t0;

  // Stage 7: JSON Export
  t0 = performance.now();
  await exportCADJson(sanitized.cleanedMesh, surfaces, sanitized.shells, profiling, tmpDir, 'bench_model');
  timings['Stage 7: CAD JSON Export'] = performance.now() - t0;

  const totalTime = performance.now() - tTotalStart;
  const polyPerSec = Math.round((mesh.triangleCount / (totalTime / 1000)));

  console.log(` • Initial triangles: ${chalk.white(mesh.triangleCount)}`);
  console.log(` • Total processing time: ${chalk.bold.green(totalTime.toFixed(2))} ms`);
  console.log(` • Pipeline throughput: ${chalk.bold.magenta(polyPerSec.toLocaleString())} triangles/sec\n`);

  console.log(chalk.bold('Stage latency breakdown:'));
  for (const [stg, ms] of Object.entries(timings)) {
    const pct = ((ms / totalTime) * 100).toFixed(1);
    const bar = '█'.repeat(Math.max(1, Math.round(Number(pct) / 4))).padEnd(25, '░');
    console.log(`   ${stg.padEnd(30)} ${ms.toFixed(2).padStart(8)} ms [${chalk.cyan(bar)}] ${pct.padStart(5)}%`);
  }

  await fs.promises.rm(tmpDir, { recursive: true, force: true });
}

async function run() {
  console.log(chalk.bold.magenta('==============================================================='));
  console.log(chalk.bold.magenta('  HIGH-PRECISION 3D CONVERSION PIPELINE LATENCY PROFILER'));
  console.log(chalk.bold.magenta('==============================================================='));

  await benchmarkModel('M6 Prismatic Bolt (Analytical Cylinders + Threads)', generatePrismaticM6Model);
  await benchmarkModel('Internal Cavity Labyrinth (Multi-shell Decomposition)', generateInternalLabyrinthModel);
  await benchmarkModel('Organic Saddle (Dense Freeform Curvature RANSAC)', generateOrganicSaddleModel);
}

run().catch(console.error);
