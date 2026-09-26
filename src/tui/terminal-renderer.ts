// ==============================================================================
// src/tui/terminal-renderer.ts — Fixed Worker-Slot MultiBar & Non-TTY Terminal UI
// ==============================================================================

import cliProgress from 'cli-progress';
import chalk from 'chalk';
import * as path from 'path';

export interface WorkerSlotState {
  slotId: number;
  fileName: string;
  stageName: string;
  stageNum: number;
  percent: number;
  elapsedMs: number;
}

export class TerminalRenderer {
  private multibar?: cliProgress.MultiBar;
  private batchBar?: cliProgress.SingleBar;
  private workerBars: cliProgress.SingleBar[] = [];
  private totalFiles = 0;
  private completedFiles = 0;
  private failedFiles = 0;
  private maxSlots: number;
  private isTTY: boolean;

  constructor(concurrency: number, totalFiles: number) {
    this.totalFiles = totalFiles;
    const termRows = process.stdout.rows || 0;
    this.isTTY = Boolean(
      process.stdout.isTTY &&
      termRows >= 10 &&
      !process.env.CI
    );
    this.maxSlots = Math.min(totalFiles, Math.min(concurrency, Math.max(1, (termRows || 30) - 6)));

    if (this.isTTY) {
      // Hide terminal cursor
      process.stdout.write('\x1b[?25l');

      this.multibar = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          fps: 15,
          format: (options, params, payload) => {
            if (payload.isBatch) {
              const bar = options.barCompleteString?.substring(0, Math.round(params.progress * 15)) || '';
              const empty = options.barIncompleteString?.substring(0, 15 - bar.length) || '';
              return `${chalk.bold.cyan('BATCH PROGRESS')} [${chalk.green(bar)}${empty}] ${Math.round(params.progress * 100)}% | ${params.value}/${params.total} | Done: ${chalk.green(payload.done)} | Fail: ${payload.failed > 0 ? chalk.red(payload.failed) : '0'}`;
            }

            const fileShort = (payload.file || 'idle').padEnd(18).substring(0, 18);
            const stage = (payload.stage || '').padEnd(20).substring(0, 20);
            const bar = options.barCompleteString?.substring(0, Math.round(params.progress * 15)) || '';
            const empty = options.barIncompleteString?.substring(0, 15 - bar.length) || '';

            return ` ${chalk.yellow(`[W${payload.slot + 1}]`)} ${chalk.white(fileShort)} ${chalk.magenta(stage)} [${chalk.cyan(bar)}${empty}] ${Math.round(params.progress * 100).toString().padStart(3)}%`;
          }
        },
        cliProgress.Presets.shades_classic
      );

      // 1. Batch overall progress bar
      this.batchBar = this.multibar.create(totalFiles, 0, {
        isBatch: true,
        done: 0,
        failed: 0
      });

      // 2. Fixed worker slot bars
      for (let i = 0; i < this.maxSlots; i++) {
        const wBar = this.multibar.create(100, 0, {
          isBatch: false,
          slot: i,
          file: 'Ready',
          stage: 'Waiting for task'
        });
        this.workerBars.push(wBar);
      }
    } else {
      console.log(`[CONVERSION-PULSE] Processing ${totalFiles} models (non-TTY discrete mode)...`);
    }
  }

  public updateWorker(slotId: number, fileName: string, stageNum: number, stageName: string, percent: number): void {
    if (!this.isTTY) return;

    const slotIdx = slotId % this.maxSlots;
    const wBar = this.workerBars[slotIdx];
    if (wBar) {
      wBar.update(percent, {
        isBatch: false,
        slot: slotIdx,
        file: path.basename(fileName),
        stage: `[${stageNum}/7] ${stageName.replace(/^\d+_/, '')}`
      });
    }
  }

  public fileCompleted(fileName: string, success: boolean, elapsedMs: number, stepPath?: string): void {
    const timeStr = `${(elapsedMs / 1000).toFixed(2)}s`;
    const base = path.basename(fileName);

    if (success) {
      this.completedFiles++;
      const target = stepPath ? path.basename(stepPath) : 'JSON';
      if (this.isTTY && this.multibar) {
        this.multibar.log(`${chalk.green('✔')} [DONE] ${chalk.bold(base)} ➔ ${chalk.cyan(target)} (${timeStr})`);
      } else {
        console.log(`[${this.completedFiles + this.failedFiles}/${this.totalFiles}] ✔ DONE: ${base} ➔ ${target} (${timeStr})`);
      }
    } else {
      this.failedFiles++;
      if (this.isTTY && this.multibar) {
        this.multibar.log(`${chalk.red('✖')} [FAIL] ${chalk.bold(base)}`);
      } else {
        console.log(`[${this.completedFiles + this.failedFiles}/${this.totalFiles}] ✖ FAIL: ${base}`);
      }
    }

    if (this.isTTY && this.batchBar) {
      this.batchBar.update(this.completedFiles + this.failedFiles, {
        isBatch: true,
        done: this.completedFiles,
        failed: this.failedFiles
      });
    }
  }

  public stop(): void {
    if (this.isTTY && this.multibar) {
      this.multibar.stop();
      // Restore cursor and move cleanly down
      process.stdout.write('\x1b[?25h\n\n');
    }
  }
}
