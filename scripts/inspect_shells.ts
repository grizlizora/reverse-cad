import * as fs from 'fs';
import { readSTL } from '../dist/stages/stage1-read.js';
import { decimateMesh } from '../dist/stages/decimation/index.js';
import { sanitizeTopology } from '../dist/stages/sanitization/index.js';

async function main() {
  const filePath = '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  const rawMesh = await readSTL(fs.readFileSync(filePath));
  console.log('Raw mesh triangles:', rawMesh.triangleCount);

  const decimatedMesh = decimateMesh(rawMesh, {
    maxTrianglesThreshold: 35000,
    featureAngleDeg: 12,
    curvatureAngleDeg: 12,
    fineFeatureAngleDeg: 15.0,
    coplanarAngleDeg: 1.5
  });
  console.log('Decimated mesh triangles:', decimatedMesh.triangleCount);

  const report = sanitizeTopology(decimatedMesh);
  console.log('Report isWatertight:', report.isWatertight);
  console.log('Report openEdgesCount:', report.openEdgesCount);
  console.log('Report shells count:', report.shells.length);
  for (let i = 0; i < report.shells.length; i++) {
    const sh = report.shells[i];
    console.log(`  Shell ${i}: tris=${sh.triangleIndices.length}, vol=${sh.signedVolume.toFixed(2)}, isCavity=${sh.isCavity}`);
  }
}

main().catch(console.error);
