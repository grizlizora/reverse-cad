// ==============================================================================
// src/orchestrator/resource-calculator.ts — Dynamic Resource & Memory Budgeting
// ==============================================================================

import * as os from 'os';
import { execSync } from 'child_process';

export interface SystemBudget {
  totalMemoryMb: number;
  availableCores: number;
  performanceCores: number;
  recommendedThreads: number;
  heapPerWorkerMb: number;
  isAppleSilicon: boolean;
}

export function calculateSystemBudget(requestedThreads?: number): SystemBudget {
  let totalMemBytes = os.totalmem();
  let cpuCount = os.cpus().length;
  let performanceCores = cpuCount;
  let isAppleSilicon = false;

  if (process.platform === 'darwin') {
    try {
      const memOut = execSync('sysctl -n hw.memsize', { encoding: 'utf8' }).trim();
      totalMemBytes = parseInt(memOut, 10) || totalMemBytes;

      const cpuOut = execSync('sysctl -n hw.ncpu', { encoding: 'utf8' }).trim();
      cpuCount = parseInt(cpuOut, 10) || cpuCount;

      const brandOut = execSync('sysctl -n machdep.cpu.brand_string', { encoding: 'utf8' }).trim();
      isAppleSilicon = brandOut.includes('Apple') || process.arch === 'arm64';

      if (isAppleSilicon) {
        // Query Apple Silicon P-cores (hw.perflevel0.logicalcpu)
        const pCoreOut = execSync('sysctl -n hw.perflevel0.logicalcpu', { encoding: 'utf8' }).trim();
        const pCores = parseInt(pCoreOut, 10);
        if (!isNaN(pCores) && pCores > 0) {
          performanceCores = pCores;
        }
      }
    } catch {
      // Fallback to os module
    }
  }

  const totalMemoryMb = Math.floor(totalMemBytes / (1024 * 1024));

  // On Apple Silicon, assigning workers beyond P-cores spills onto slow E-cores,
  // causing thermal throttling and straggler delays. Target P-cores count.
  const defaultThreads = isAppleSilicon
    ? Math.max(1, performanceCores)
    : Math.max(1, Math.min(16, cpuCount - 1));

  const recommendedThreads = requestedThreads && requestedThreads > 0 ? requestedThreads : defaultThreads;

  // Worker heap formula: (Total RAM * 70%) / workers, clamped between 1536 and 4096 MB
  const safeHeapTotal = totalMemoryMb * 0.7;
  const heapPerWorkerMb = Math.min(4096, Math.max(1536, Math.floor(safeHeapTotal / recommendedThreads)));

  return {
    totalMemoryMb,
    availableCores: cpuCount,
    performanceCores,
    recommendedThreads,
    heapPerWorkerMb,
    isAppleSilicon
  };
}
