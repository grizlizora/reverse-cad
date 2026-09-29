// ==============================================================================
// src/tui/terminal-formatter.ts — Zero-GC ANSI Terminal Formatter & Stage Cache
// ==============================================================================

import chalk from 'chalk';

const STAGE_NAME_MAP: Record<string, string> = {
  '1_read': 'read',
  '2_decimate': 'decimate',
  '3_sanitize': 'sanitize',
  '4_segmentation': 'segmentation',
  '5_profiling': 'profiling',
  '6_brep_step': 'brep_step',
  '7_export_json': 'export_json'
};

export const UI_TOKENS = {
  BATCH_TITLE: chalk.bold.cyan('BATCH PROGRESS'),
  ICON_DONE: chalk.green('✔'),
  ICON_FAIL: chalk.red('✖'),
  ICON_ACTIVE: chalk.cyan('➜'),
  TEXT_DONE_PADDED: chalk.green('DONE'.padEnd(20)),
  TEXT_FAIL_PADDED: chalk.red('FAILED'.padEnd(20))
};

export class TerminalFormatter {
  private static stageCache = new Map<string, string>();
  private static baseNameCache = new Map<string, string>();

  public static formatStage(stageNum: number, rawStageName: string): string {
    const key = `${stageNum}:${rawStageName}`;
    let formatted = this.stageCache.get(key);
    if (!formatted) {
      const clean = STAGE_NAME_MAP[rawStageName] ||
        (rawStageName.charCodeAt(1) === 95 ? rawStageName.slice(2) : rawStageName.replace(/^\d+_/, ''));
      formatted = `[${stageNum}/7] ${clean}`.padEnd(20).substring(0, 20);
      this.stageCache.set(key, formatted);
    }
    return formatted;
  }

  public static getFastBasename(filePath: string): string {
    let name = this.baseNameCache.get(filePath);
    if (!name) {
      const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
      name = idx === -1 ? filePath : filePath.slice(idx + 1);
      this.baseNameCache.set(filePath, name);
    }
    return name;
  }

  public static renderBar(progress: number, width = 15, completeChar = '=', incompleteChar = ' '): { bar: string; empty: string } {
    const filledLen = Math.max(0, Math.min(width, Math.round(progress * width)));
    return {
      bar: completeChar.repeat(filledLen),
      empty: incompleteChar.repeat(width - filledLen)
    };
  }
}
