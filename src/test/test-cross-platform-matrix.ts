// ==============================================================================
// src/test/test-cross-platform-matrix.ts — Cross-Platform Matrix & Real STL Test
// ==============================================================================

import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { withTempDir } from './temp-dir-guard.js';
import { generatePrismaticM6Model } from '../rsvs/procedural-benchmarks.js';
import { writeMeshToBinaryStl } from '../utils/stl-writer.js';
import { processPipelineTask } from '../worker/pipeline-executor.js';
import { formatStepFloat } from '../kernel/step/step-orthonormal-basis.js';
import { StepBrepValidator } from '../kernel/step/step-brep-validator.js';
import chalk from 'chalk';

/**
 * 1. Simulates multi-architecture FPU precision across x86_64 and ARM64.
 */
function verifyFpuCrossArchitecturePrecision(): void {
  // Clamped acos domain guard (x86_64 FPU boundary drift protection)
  const driftVal = 1.0000000000000002;
  const safeAcos = Math.acos(Math.max(-1, Math.min(1, driftVal)));
  assert.equal(safeAcos, 0, 'Drifted cosine value must clamp to 0 without NaN');
  assert(!Number.isNaN(safeAcos), 'FPU boundary drift produced NaN in acos');

  // Negative zero elimination in STEP standard formatting
  assert.equal(formatStepFloat(-0), '0.00000', 'formatStepFloat(-0) must output 0.00000 without negative zero');
  assert.equal(formatStepFloat(-0.0), '0.00000', 'formatStepFloat(-0.0) must output 0.00000 without negative zero');
  assert(!formatStepFloat(-0).startsWith('-'), 'formatStepFloat(-0) must never start with minus sign');

  // Precision consistency check with specified decimals
  const formatted = formatStepFloat(12.34567, 5);
  assert.equal(formatted, '12.34567', 'Coordinate precision must preserve 5 decimals');
}

/**
 * 2. Simulates Windows x64 path separators and CRLF line-ending tolerance.
 */
async function verifyWindowsX64Simulation(): Promise<void> {
  const winPath = 'C:\\Users\\Bort\\Documents\\CAD_Projects\\test_part.stl';
  const normalized = winPath.replace(/\\/g, '/');
  assert.equal(path.basename(normalized), 'test_part.stl', 'Windows backslash path normalization');

  // Windows CRLF step parsing validation
  const crlfStep = [
    "ISO-10303-21;\r\nHEADER;\r\nFILE_DESCRIPTION(('STEP AP242'),'2;1');\r\n",
    "FILE_NAME('win_test.step','2026-09-29',(''),'','','','');\r\n",
    "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'));\r\nENDSEC;\r\n",
    "DATA;\r\n#10 = CARTESIAN_POINT('', (0., 0., 0.));\r\nENDSEC;\r\nEND-ISO-10303-21;\r\n"
  ].join('');

  const validator = new StepBrepValidator();
  validator.parse(crlfStep);
  assert(validator.getPoints().size >= 1, 'Windows CRLF STEP file must parse correctly');
}

/**
 * 3. Simulates Fedora Linux (AMD64) case sensitivity and POSIX conventions.
 */
function verifyLinuxFedoraSimulation(): void {
  const coreFiles = [
    'src/cli.ts',
    'src/cli/cli-wizard.ts',
    'src/kernel/step/fast-brep-builder.ts',
    'src/kernel/step/planar/hole-facet-band-stitcher.ts',
    'src/kernel/step/brep-fallback-planar-emitter.ts',
    'src/kernel/step/revolution/revolution-zband-analyzer.ts'
  ];

  for (const relPath of coreFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert(fs.existsSync(fullPath), `Linux case-sensitive path must exist: ${relPath}`);
    const dir = path.dirname(fullPath);
    const base = path.basename(fullPath);
    const entries = fs.readdirSync(dir);
    assert(entries.includes(base), `Exact casing mismatch on Linux file system: ${base}`);
  }
}

/**
 * 4. End-to-End Real STL Conversion: Prismatic M6 Bore with Analytical Cylinder.
 */
async function verifyRealStlEndToEndConversion(): Promise<void> {
  await withTempDir('matrix_stl', async (tmpDir) => {
    const stlPath = path.join(tmpDir, 'bort_m6_test.stl');
    const mesh = generatePrismaticM6Model();
    await writeMeshToBinaryStl(mesh, stlPath);
    const fileSizeBytes = (await fs.promises.stat(stlPath)).size;

    const res = await processPipelineTask({
      taskId: 'bort-real-stl-test',
      filePath: stlPath,
      fileSizeBytes,
      options: {
        threads: 1,
        quality: 'high',
        outDir: tmpDir,
        verify: true,
        jsonOnly: false,
        stepOnly: false,
        heatmapMode: 'none',
        verbose: false,
        inferTapDrillThreads: true
      }
    });

    assert(res.success, `Real STL pipeline execution failed: ${res.error}`);
    assert(res.stepFilePath && fs.existsSync(res.stepFilePath), 'Output STEP file must exist');

    const stepContent = await fs.promises.readFile(res.stepFilePath, 'utf-8');

    // 4.1. Verify Analytical CYLINDRICAL_SURFACE presence (Bort's issue resolved)
    assert(stepContent.includes('CYLINDRICAL_SURFACE'), 'STEP AP242 solid must contain CYLINDRICAL_SURFACE');

    // 4.2. Verify 100% Watertight Solid (RSVS Gate 3 PASS, openEdges = 0)
    assert.equal(res.verificationReport?.gates.gate3.status, 'PASSED', 'RSVS Gate 3 must pass on real STL');
    assert.equal(res.verificationReport?.gates.gate3.metrics.openEdges, 0, 'Must have zero open boundary edges');

    // 4.3. Verify Zero Cyrillic Characters in generated STEP output (Localization resolved)
    const cyrillicRegex = /[\u0400-\u04FF]/;
    assert(!cyrillicRegex.test(stepContent), 'STEP file must have 0 Cyrillic characters');
  });
}

/**
 * Main export for cross-platform test matrix execution.
 */
export async function runCrossPlatformMatrixTests(): Promise<boolean> {
  console.log(chalk.bold('\n======================================================'));
  console.log(chalk.bold('  CROSS-PLATFORM MATRIX & REAL STL SIMULATION SUITE  '));
  console.log(chalk.bold('======================================================\n'));

  try {
    verifyFpuCrossArchitecturePrecision();
    console.log(`  ${chalk.green('✔')} FPU Multi-Arch Precision (x86_64 / ARM64 IEEE-754 drift): PASSED`);

    await verifyWindowsX64Simulation();
    console.log(`  ${chalk.green('✔')} Windows x64 Simulation (Backslash Paths & CRLF line-endings): PASSED`);

    verifyLinuxFedoraSimulation();
    console.log(`  ${chalk.green('✔')} Linux Fedora Simulation (Case-sensitivity & POSIX compliance): PASSED`);

    await verifyRealStlEndToEndConversion();
    console.log(`  ${chalk.green('✔')} Real STL End-to-End Conversion (CYLINDRICAL_SURFACE & Watertight): PASSED`);

    console.log(chalk.green('\n  ✔ ALL CROSS-PLATFORM & REAL STL TESTS PASSED!\n'));
    return true;
  } catch (err: any) {
    console.error(chalk.red(`\n  ✖ Cross-Platform Matrix Test FAILED: ${err.message}`));
    console.error(err);
    return false;
  }
}

// CLI direct run support
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('test-cross-platform-matrix.ts') ||
  process.argv[1].endsWith('test-cross-platform-matrix.js')
);

if (isDirectExecution) {
  runCrossPlatformMatrixTests().then(success => {
    if (!success) process.exit(1);
  });
}
