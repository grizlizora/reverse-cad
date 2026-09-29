// ==============================================================================
// src/test/test-worker-pipeline.ts — Phase 2 Worker Executor & MCP Runner Tests
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { processPipelineTask, runCadMcpTask } from '../worker/pipeline-worker.js';
import { generateOrganicSaddleModel } from '../rsvs/procedural-benchmarks.js';
import { writeMeshToBinaryStl } from '../utils/stl-writer.js';
import { WorkerAbortedError } from '../worker/worker-abort-monitor.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('[TEST] Running Phase 2 Worker Executor & MCP Runner tests...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-test-'));

  try {
    // 1. Generate a 1152-triangle Organic Saddle STL
    const stlPath = path.join(tmpDir, 'test_saddle.stl');
    const mesh = generateOrganicSaddleModel();
    await writeMeshToBinaryStl(mesh, stlPath);
    const fileSizeBytes = fs.statSync(stlPath).size;

    // 2. Test processPipelineTask with forced QEM decimation (1152 -> ~500 tris)
    // This exercises cross-mesh RSVS Gate 4 with true rawMesh ground truth & AABB spatialGrid!
    const res = await processPipelineTask({
      taskId: 'test-decimated-gate4',
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
        decimate: true,
        maxTrianglesThreshold: 600
      }
    });

    assert(res.success === true, `Pipeline task failed: ${res.error}`);
    assert(res.trianglesIn === 1152, `Expected 1152 input triangles, got ${res.trianglesIn}`);
    assert(res.trianglesProcessed <= 1152, `Expected processed triangles <= 1152, got ${res.trianglesProcessed}`);
    assert(res.verificationReport !== undefined, 'Expected verificationReport');
    assert(
      res.verificationReport!.gates.gate4.status === 'PASSED',
      `Expected Gate 4 PASSED on model, got ${res.verificationReport!.gates.gate4.status} (H99=${res.verificationReport!.gates.gate4.hausdorff99PercentileMm})`
    );
    console.log(`  ✔ Full 7-Stage Pipeline & Gate 4 Ground-Truth: PASSED (${res.trianglesIn} -> ${res.trianglesProcessed} tris, H99=${res.verificationReport!.gates.gate4.hausdorff99PercentileMm}mm)`);

    // 3. Test MCP Task Runner: ANALYZE
    const analyzeRes = await runCadMcpTask({
      taskType: 'ANALYZE',
      filePath: stlPath,
      outDir: tmpDir
    });
    assert(analyzeRes.triangleCount === 1152, 'MCP ANALYZE triangleCount mismatch');
    assert(analyzeRes.isWatertight === true, 'MCP ANALYZE watertight check failed');
    console.log('  ✔ MCP Task Runner (ANALYZE): PASSED');

    // 4. Test MCP Task Runner: VERIFY_RSVS
    const verifyRes = await runCadMcpTask({
      taskType: 'VERIFY_RSVS',
      filePath: stlPath,
      outDir: tmpDir
    });
    assert(verifyRes.overallStatus === 'PASSED', `MCP VERIFY_RSVS expected PASSED, got ${verifyRes.overallStatus}`);
    console.log('  ✔ MCP Task Runner (VERIFY_RSVS): PASSED');

    // 5. Test Cooperative Abort via SharedArrayBuffer + Atomics
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.store(int32, 0, 1); // Pre-trigger abort flag

    let abortedCorrectly = false;
    try {
      await runCadMcpTask({
        taskType: 'ANALYZE',
        filePath: stlPath,
        taskId: 'abort-test-1',
        sharedAbortBuffer: sab
      });
    } catch (err) {
      if (err instanceof WorkerAbortedError || (err as Error).name === 'WorkerAbortedError') {
        abortedCorrectly = true;
      }
    }
    assert(abortedCorrectly, 'Expected WorkerAbortedError when sharedAbortBuffer is set to 1');
    console.log('  ✔ Cooperative Atomic Cancellation (SharedArrayBuffer): PASSED');

    console.log('\n[PASS] All Phase 2 Worker & Concurrency tests completed successfully.');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch(err => {
  console.error('[FAIL] Worker test failed:', err);
  process.exit(1);
});
