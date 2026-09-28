// ==============================================================================
// src/orchestrator/watchdog-guard.ts — Watchdog & Memory Circuit Breaker
// ==============================================================================

import * as os from 'os';
import * as fs from 'fs';
import * as v8 from 'v8';

export interface WatchdogOptions {
  baseTimeoutMs?: number;
  perMbFactorMs?: number;
  maxTimeoutMs?: number;
}

export class WatchdogTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WatchdogTimeoutError';
  }
}

/**
 * Monitors memory pressure and trips circuit breaker to prevent V8 heap crashes.
 * Uses V8 heap statistics (heapUsed vs heap_size_limit) to correctly handle macOS Mach virtual memory caching.
 */
export class MemoryCircuitBreaker {
  private isCircuitOpen = false;
  private circuitOpenUntil = 0;
  private consecutiveOoms = 0;

  constructor(private minFreeRamMb = 32) {}

  public checkSystemHealth(): { canExecute: boolean; reason?: string; backoffMs?: number } {
    const now = Date.now();

    if (this.isCircuitOpen) {
      if (now < this.circuitOpenUntil) {
        return {
          canExecute: false,
          reason: `Circuit Breaker OPEN due to high memory pressure. Cooling down...`,
          backoffMs: this.circuitOpenUntil - now
        };
      }
      // Half-Open reset
      this.isCircuitOpen = false;
    }

    // Check V8 Heap and External Buffer pressure
    try {
      const heapStats = v8.getHeapStatistics();
      const heapRatio = heapStats.used_heap_size / heapStats.heap_size_limit;
      const mem = process.memoryUsage();
      const externalMb = mem.external / (1024 * 1024);
      
      // If external memory (TypedArrays/ArrayBuffers) exceeds 2048 MB or heap ratio > 90%
      if (heapRatio > 0.90 || externalMb > 2048) {
        this.tripCircuit(3000);
        return {
          canExecute: false,
          reason: `Memory pressure critical (Heap: ${(heapRatio * 100).toFixed(1)}%, External: ${externalMb.toFixed(0)}MB). Cooling down...`,
          backoffMs: 3000
        };
      }
    } catch {}

    // Check critical OS free memory (handling Linux buffers/cache and macOS Darwin virtual memory)
    let freeMem = os.freemem();
    let minThreshold = this.minFreeRamMb * 1024 * 1024;
    if (process.platform === 'linux') {
      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const match = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/i);
        if (match) {
          freeMem = parseInt(match[1], 10) * 1024;
        }
      } catch {}
    } else if (process.platform === 'darwin') {
      // Darwin keeps free memory low intentionally by using it for page cache.
      minThreshold = 16 * 1024 * 1024;
    }

    if (freeMem < minThreshold) {
      this.tripCircuit(3000);
      return {
        canExecute: false,
        reason: `OS Available Memory critical (${Math.round(freeMem / 1024 / 1024)}MB). Cooling down...`,
        backoffMs: 3000
      };
    }

    return { canExecute: true };
  }

  public tripCircuit(durationMs = 5000): void {
    this.isCircuitOpen = true;
    this.circuitOpenUntil = Date.now() + durationMs;
    this.consecutiveOoms++;

    if (typeof (global as any).gc === 'function') {
      try {
        (global as any).gc();
      } catch {}
    }
  }

  public reportSuccess(): void {
    this.consecutiveOoms = Math.max(0, this.consecutiveOoms - 1);
  }

  public getRecommendedConcurrencyThrottle(baseThreads: number): number {
    if (this.consecutiveOoms >= 2) return 1; // Emergency single-thread mode
    if (this.consecutiveOoms === 1) return Math.max(1, Math.floor(baseThreads / 2));
    return baseThreads;
  }
}

/**
 * Calculates adaptive task timeout based on mesh payload size.
 */
export function calculateWatchdogTimeout(fileSizeBytes: number, opts: WatchdogOptions = {}): number {
  const base = opts.baseTimeoutMs ?? 45_000;         // 45s min baseline
  const factor = opts.perMbFactorMs ?? 2_500;       // +2.5s per MB
  const max = opts.maxTimeoutMs ?? 300_000;          // Max 5 minutes
  const sizeMb = fileSizeBytes / (1024 * 1024);

  return Math.min(max, Math.round(base + sizeMb * factor));
}

/**
 * Executes an async action bounded by an AbortController watchdog timer.
 */
export async function executeWithWatchdog<T>(
  action: (abortSignal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  taskDescription: string
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new WatchdogTimeoutError(`[WATCHDOG] Task "${taskDescription}" exceeded execution deadline (${(timeoutMs / 1000).toFixed(1)}s) and was aborted.`));
    }, timeoutMs);
    timer.unref?.();
  });

  try {
    return await Promise.race([action(controller.signal), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
