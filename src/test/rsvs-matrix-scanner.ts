// ==============================================================================
// src/test/rsvs-matrix-scanner.ts — Combinatorial Matrix Scanner & Sanity Validator
// ==============================================================================

import { generatePrismaticM6Model, generateInternalLabyrinthModel, generatePrintInPlaceHingeModel } from '../rsvs/procedural-benchmarks.js';
import { decimateMesh } from '../stages/stage2-decimate.js';
import { sanitizeTopology } from '../stages/stage3-sanitize.js';
import { segmentSurfaces } from '../stages/stage4-segmentation.js';
import { profileFeatures } from '../stages/stage5-profiling.js';
import { ZeroGCSpyCLI } from '../rsvs/zero-gc-spy.js';
import { PipelineLeakTrackerCLI } from '../rsvs/leak-tracker.js';
import chalk from 'chalk';

export interface MatrixTestResult {
  modelName: string;
  targetTriangles: number;
  passed: boolean;
  checks: {
    noNaNs: boolean;
    validEuler: boolean;
    validVolume: boolean;
    surfacesFound: number;
  };
  error?: string;
}

export async function runMatrixScanner(): Promise<boolean> {
  console.log(chalk.bold.magenta('\n==============================================================='));
  console.log(chalk.bold.magenta('  RSVS COMBINATORIAL MATRIX SCANNER & ZERO-GC AUDIT'));
  console.log(chalk.bold.magenta('===============================================================\n'));

  const models = [
    { name: 'Prismatic_M6', gen: generatePrismaticM6Model },
    { name: 'Internal_Labyrinth', gen: generateInternalLabyrinthModel },
    { name: 'PiP_Hinge', gen: generatePrintInPlaceHingeModel }
  ];

  const triangleTargets = [80000, 40000];
  const leakTracker = new PipelineLeakTrackerCLI();
  const spy = new ZeroGCSpyCLI();

  let allPassed = true;

  for (const model of models) {
    for (const target of triangleTargets) {
      process.stdout.write(` • Scanning [${chalk.yellow(model.name)}] @ target ${target} tris... `);
      leakTracker.checkpoint(`start_${model.name}_${target}`);

      try {
        const raw = model.gen();
        const decimated = decimateMesh(raw, { maxTrianglesThreshold: target });
        const sanitized = sanitizeTopology(decimated);
        const surfaces = segmentSurfaces(sanitized.cleanedMesh);
        const profiling = profileFeatures(sanitized.cleanedMesh, surfaces, sanitized.shells);

        // Assertions
        const positions = sanitized.cleanedMesh.positions;
        let hasNaN = false;
        for (let i = 0; i < positions.length; i++) {
          if (isNaN(positions[i]) || !isFinite(positions[i])) {
            hasNaN = true;
            break;
          }
        }

        // Multi-shell Euler bound: for S closed shells of genus g >= 0, chi = sum(2 - 2g) <= 2 * S
        const maxAllowedEuler = 2 * Math.max(1, sanitized.shells.length);
        const validEuler = sanitized.eulerCharacteristic <= maxAllowedEuler;
        const totalVol = sanitized.shells.reduce((sum, s) => s.isCavity ? sum : sum + s.signedVolume, 0);
        const validVolume = totalVol > 0;
        const passed = !hasNaN && validEuler && validVolume && surfaces.length > 0;

        if (passed) {
          console.log(chalk.green(`✔ PASS (Euler: ${sanitized.eulerCharacteristic}, Surfaces: ${surfaces.length})`));
        } else {
          console.log(chalk.red(`✘ FAIL (hasNaN: ${hasNaN}, validEuler: ${validEuler}, validVolume: ${validVolume})`));
          allPassed = false;
        }
      } catch (err: any) {
        console.log(chalk.red(`✘ ERROR: ${err.message}`));
        allPassed = false;
      }

      leakTracker.checkpoint(`end_${model.name}_${target}`);
    }
  }

  const leakAudit = leakTracker.detectLeak();
  if (leakAudit.hasLeak) {
    console.log(chalk.yellow(`\n⚠ Memory Leak Warning: ${leakAudit.warning}`));
  } else {
    console.log(chalk.green(`\n✔ Memory Audit Clean: No lingering ArrayBuffer leaks detected.`));
  }

  const gcDelta = spy.delta();
  console.log(chalk.cyan(` • Benchmark elapsed: ${(gcDelta.elapsedMs / 1000).toFixed(2)}s | Heap delta: ${gcDelta.heapUsedDeltaMb.toFixed(2)} MB\n`));

  return allPassed;
}
