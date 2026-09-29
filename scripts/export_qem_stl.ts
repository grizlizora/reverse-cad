// ==============================================================================
// scripts/export_qem_stl.ts — Export QEM Decimated Mesh to Binary STL
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readSTL } from '../src/stages/stage1-read.js';
import { qemDecimateMesh } from './test_qem.js';
import { writeMeshToBinaryStl } from '../src/utils/stl-writer.js';

export async function exportQemDecimatedStl(
  inputPath?: string,
  outputPath: string = 'test_output/decimated_test.stl'
): Promise<void> {
  const defaultPaths = [
    inputPath,
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
    throw new Error('No valid test STL file found for export.');
  }

  console.log(`[Export QEM] Reading STL: ${targetPath}`);
  let mesh = await readSTL(targetPath);
  console.log(`Initial: ${mesh.triangleCount} triangles.`);

  for (let pass = 0; pass < 4; pass++) {
    if (mesh.triangleCount <= 85000) break;
    mesh = qemDecimateMesh(mesh, 85000, 0.02 * (pass + 1));
  }
  console.log(`Decimated: ${mesh.triangleCount} triangles.`);

  await writeMeshToBinaryStl(mesh, outputPath);
  console.log(`Saved ${outputPath}`);
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
  exportQemDecimatedStl(process.argv[2], process.argv[3]).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
