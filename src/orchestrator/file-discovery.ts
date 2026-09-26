// ==============================================================================
// src/orchestrator/file-discovery.ts — Input File Discovery & Validation
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { DWRRMeshScheduler } from './dwrr-queue.js';

export interface FileDiscoveryResult {
  totalFilesCount: number;
  isValid: boolean;
}

/**
 * Discovers STL files from input path (file or directory) and enqueues them into DWRR scheduler.
 */
export async function discoverAndEnqueueFiles(
  inputPath: string,
  scheduler: DWRRMeshScheduler
): Promise<FileDiscoveryResult> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(inputPath);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      console.error(chalk.bold.red(`\n✖ Error: Specified file or directory not found:`));
      console.error(chalk.yellow(`  ➜ "${inputPath}"`));
      console.error(chalk.gray(`  Hint: verify the path is correct and the file exists on disk.\n`));
      return { totalFilesCount: 0, isValid: false };
    }
    throw err;
  }

  let totalFilesCount = 0;

  if (stat.isDirectory()) {
    const entries = await fs.promises.readdir(inputPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.stl')) {
        const fullPath = path.join(inputPath, entry.name);
        const fStat = await fs.promises.stat(fullPath);
        scheduler.enqueue(fullPath, fStat.size);
        totalFilesCount++;
      }
    }
  } else if (stat.isFile()) {
    if (!inputPath.toLowerCase().endsWith('.stl')) {
      console.error(chalk.bold.red(`\n✖ Error: Specified file is not an .stl model:`));
      console.error(chalk.yellow(`  ➜ "${inputPath}"`));
      console.error(chalk.gray(`  The pipeline is designed for polygonal 3D STL meshes.\n`));
      return { totalFilesCount: 0, isValid: false };
    }
    scheduler.enqueue(inputPath, stat.size);
    totalFilesCount++;
  }

  if (totalFilesCount === 0) {
    console.log(chalk.yellow(`\n⚠ No STL files found at path: ${inputPath}\n`));
    return { totalFilesCount: 0, isValid: false };
  }

  return { totalFilesCount, isValid: true };
}
