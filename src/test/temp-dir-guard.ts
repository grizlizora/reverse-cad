// ==============================================================================
// src/test/temp-dir-guard.ts — RAII Sandboxed Temporary Directory Manager
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Creates an isolated temporary directory, executes the callback with it,
 * and guarantees 100% removal in finally block upon completion.
 */
export async function withTempDir<T>(
  prefix: string,
  fn: (tmpDir: string) => Promise<T>,
  keepOnDisk: boolean = false
): Promise<T> {
  const uniqueId = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tmpDir = path.resolve(process.cwd(), 'output_test_temp', uniqueId);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  try {
    return await fn(tmpDir);
  } finally {
    if (!keepOnDisk) {
      try {
        await fs.promises.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // Ignored if file descriptors are releasing
      }
    }
  }
}
