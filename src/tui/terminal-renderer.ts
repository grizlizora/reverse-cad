// ==============================================================================
// src/tui/terminal-renderer.ts — Hardened Non-Blocking Terminal MultiBar UI
// ==============================================================================

import cliProgress from 'cli-progress';
import chalk from 'chalk';
import { TerminalTtyGuard } from './terminal-tty-guard.js';
import { TerminalFormatter, UI_TOKENS } from './terminal-formatter.js';

export class TerminalRenderer {
  private multibar?: cliProgress.MultiBar;
  private batchBar?: cliProgress.SingleBar;
  private workerBars: cliProgress.SingleBar[] = [];
  private fileBars = new Map<string, cliProgress.SingleBar>();
  private totalFiles = 0;
  private completedFiles = 0;
  private failedFiles = 0;
  private maxSlots: number;
  private isTTY: boolean;
  private mode: 'PER_FILE' | 'WORKER_SLOTS';

  constructor(concurrency: number, totalFiles: number, discoveredFiles: string[] = []) {
    this.totalFiles = totalFiles;
    this.isTTY = TerminalTtyGuard.isInteractiveTTY();
    const termRows = process.stdout.rows || 30;
    const maxDisplayableRows = Math.max(5, termRows - 8);

    if (discoveredFiles.length > 0 && discoveredFiles.length <= maxDisplayableRows) {
      this.mode = 'PER_FILE';
      this.maxSlots = discoveredFiles.length;
    } else {
      this.mode = 'WORKER_SLOTS';
      this.maxSlots = Math.min(totalFiles, Math.min(concurrency, maxDisplayableRows));
    }

    if (this.isTTY) {
      TerminalTtyGuard.hideCursor();

      this.multibar = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          fps: 15,
          format: (options, params, payload) => {
            const { bar, empty } = TerminalFormatter.renderBar(params.progress, 15);
            if (payload.isBatch) {
              return `${UI_TOKENS.BATCH_TITLE} [${chalk.green(bar)}${empty}] ${Math.round(params.progress * 100)}% | ${params.value}/${params.total} | Done: ${chalk.green(payload.done)} | Fail: ${payload.failed > 0 ? chalk.red(payload.failed) : '0'}`;
            }

            const prefix = payload.index ? chalk.yellow(`[${payload.index}/${payload.total}]`) : chalk.yellow(`[W${payload.slot + 1}]`);
            const fileShort = (payload.file || 'idle').padEnd(20).substring(0, 20);
            const stage = payload.stage || '';
            const pct = Math.round(params.progress * 100).toString().padStart(3);

            if (payload.status === 'DONE') {
              return ` ${UI_TOKENS.ICON_DONE} ${prefix} ${chalk.white(fileShort)} ${UI_TOKENS.TEXT_DONE_PADDED} [${chalk.green(bar)}] 100% ${chalk.gray(payload.timeStr || '')}`;
            }
            if (payload.status === 'FAIL') {
              return ` ${UI_TOKENS.ICON_FAIL} ${prefix} ${chalk.white(fileShort)} ${UI_TOKENS.TEXT_FAIL_PADDED} [${chalk.red(bar)}] ${pct}%`;
            }
            return ` ${UI_TOKENS.ICON_ACTIVE} ${prefix} ${chalk.white(fileShort)} ${chalk.magenta(stage)} [${chalk.cyan(bar)}${empty}] ${pct}%`;
          }
        },
        cliProgress.Presets.shades_classic
      );

      this.batchBar = this.multibar.create(totalFiles, 0, { isBatch: true, done: 0, failed: 0 });

      if (this.mode === 'PER_FILE') {
        discoveredFiles.forEach((fPath, i) => {
          const base = TerminalFormatter.getFastBasename(fPath);
          const bar = this.multibar!.create(100, 0, { isBatch: false, index: i + 1, total: discoveredFiles.length, file: base, stage: 'Queued...', status: 'WAIT' });
          this.fileBars.set(fPath, bar);
          this.fileBars.set(base, bar);
          this.workerBars.push(bar);
        });
      } else {
        for (let i = 0; i < this.maxSlots; i++) {
          this.workerBars.push(this.multibar.create(100, 0, { isBatch: false, slot: i, file: 'Ready', stage: 'Waiting for task', status: 'WAIT' }));
        }
      }
    } else {
      console.log(`[CONVERSION-PULSE] Processing ${totalFiles} models (non-TTY discrete mode)...`);
    }
  }

  public updateWorker(slotId: number, fileName: string, stageNum: number, stageName: string, percent: number): void {
    if (!this.isTTY) return;
    const stage = TerminalFormatter.formatStage(stageNum, stageName);
    const base = TerminalFormatter.getFastBasename(fileName);

    if (this.mode === 'PER_FILE') {
      const bar = this.fileBars.get(fileName) || this.fileBars.get(base);
      bar?.update(percent, { stage, status: 'ACTIVE' });
    } else {
      const slotIdx = slotId % this.maxSlots;
      this.workerBars[slotIdx]?.update(percent, { slot: slotIdx, file: base, stage, status: 'ACTIVE' });
    }
  }

  public fileCompleted(fileName: string, success: boolean, elapsedMs: number, stepPath?: string): void {
    success ? this.completedFiles++ : this.failedFiles++;
    const base = TerminalFormatter.getFastBasename(fileName);
    const timeStr = `(${(elapsedMs * 0.001).toFixed(2)}s)`;

    if (this.mode === 'PER_FILE') {
      const bar = this.fileBars.get(fileName) || this.fileBars.get(base);
      bar?.update(100, { stage: success ? 'DONE' : 'FAILED', status: success ? 'DONE' : 'FAIL', timeStr });
    } else {
      const target = stepPath ? TerminalFormatter.getFastBasename(stepPath) : 'JSON';
      const icon = success ? UI_TOKENS.ICON_DONE : UI_TOKENS.ICON_FAIL;
      if (this.isTTY && this.multibar) {
        this.multibar.log(`${icon} [${this.completedFiles + this.failedFiles}/${this.totalFiles}] ${chalk.bold(base)} ➔ ${chalk.cyan(target)} ${timeStr}\n`);
      } else {
        console.log(`[${this.completedFiles + this.failedFiles}/${this.totalFiles}] ${success ? '✔ DONE' : '✖ FAIL'}: ${base} ➔ ${target} ${timeStr}`);
      }
    }

    if (this.isTTY && this.batchBar) {
      this.batchBar.update(this.completedFiles + this.failedFiles, { isBatch: true, done: this.completedFiles, failed: this.failedFiles });
    }
  }

  public stop(): void {
    if (this.isTTY && this.multibar) {
      this.multibar.stop();
    }
    TerminalTtyGuard.restoreCursor();
  }
}
