import { processPipelineTask } from '../src/worker/pipeline-worker.js';
import * as fs from 'fs';

async function main() {
  const filePath = '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  const rawBuffer = fs.readFileSync(filePath);
  
  console.log('Starting pipeline conversion with strict 1:1 thread preservation...');
  const t0 = performance.now();
  const res = await processPipelineTask({
    taskId: 'test-1',
    filePath,
    rawBuffer,
    options: {
      outDir: 'test_output',
      emitStep: true,
      emitJson: false,
      decimate: true,
      maxTrianglesThreshold: 35000,
      validateRsvs: false
    }
  }, (progress) => {
    console.log(`[Stage ${progress.stage}] ${progress.stageName}: ${progress.percentage}%`);
  });

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`Pipeline finished in ${elapsed}s! Success: ${res.success}`);
  if (!res.success) {
    console.error('Error details:', res.error);
  }
  console.log(`Triangles in: ${res.trianglesIn}, processed: ${res.trianglesProcessed}`);
  console.log(`STEP file: ${res.stepFilePath}`);
}

main().catch(err => {
  console.error('Pipeline error:', err);
  process.exit(1);
});
