// ==============================================================================
// scripts/test_qem.ts — QEM Decimation Benchmark & Testing Driver
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readSTL } from '../src/stages/stage1-read.js';
import { decimateMesh } from '../src/stages/decimation/index.js';
import { RawMesh } from '../src/types/geometry.js';

export function qemDecimateMesh(
  mesh: RawMesh,
  targetTriangles: number,
  maxErrorSq: number = 0.0025
): RawMesh {
  return decimateMesh(mesh, {
    maxTrianglesThreshold: targetTriangles,
    featureAngleDeg: 12.0,
    curvatureAngleDeg: 12.0,
    fineFeatureAngleDeg: 4.0,
    coplanarAngleDeg: 1.5,
    maxInwardDisplacementMm: Math.sqrt(maxErrorSq)
  });
}

export async function runQemBenchmark(customPath?: string): Promise<RawMesh> {
  const defaultPaths = [
    customPath,
    path.resolve(process.cwd(), 'test_files/m16_nut.stl'),
    '/Users/roman/Downloads/Metric_thread_testblock_v2.STL'
  ].filter(Boolean) as string[];

  let targetPath = '';
  for (const p of defaultPaths) {
    if (fs.existsSync(p)) {
      targetPath = p;
      break;
    }
  }

  if (!targetPath) {
    throw new Error('No valid test STL file found for QEM benchmark.');
  }

  console.log(`[QEM Benchmark] Reading STL: ${targetPath}`);
  let mesh = await readSTL(targetPath);
  console.log(`Initial: ${mesh.triangleCount} triangles, ${mesh.vertexCount} vertices.`);

  const t0 = performance.now();
  for (let pass = 0; pass < 3; pass++) {
    if (mesh.triangleCount <= 85000) break;
    mesh = qemDecimateMesh(mesh, 85000, 0.02 * (pass + 1));
  }
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

  console.log(`[QEM Benchmark] Complete in ${elapsed}s: ${mesh.triangleCount} triangles, ${mesh.vertexCount} vertices.`);
  return mesh;
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    const entryBase = path.basename(process.argv[1]).replace(/\.[jt]s$/, '');
    const selfBase = path.basename(fileURLToPath(import.meta.url)).replace(/\.[jt]s$/, '');
    return entryBase === selfBase;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  runQemBenchmark(process.argv[2]).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
