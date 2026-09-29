// ==============================================================================
// src/cli/cli-args.ts — CLI Argument Parser, Validator & Help Formatter
// ==============================================================================

import { PipelineOptions, EmitTargets } from '../types/worker.js';
import chalk from 'chalk';
import * as path from 'path';

export interface ParsedCliArgs {
  mode: 'help' | 'mcp' | 'test' | 'run';
  inputPath: string;
  interactive: boolean;
  skipInteractive: boolean;
  hasExplicitEmit: boolean;
  options: PipelineOptions;
}

export function parseEmitString(emitStr: string = ''): EmitTargets {
  const parts = emitStr.toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
  if (parts.includes('all')) {
    return { step: true, summary: true, topology: true, report: true, heatmap: true };
  }
  if (parts.length === 1 && (parts[0] === 'step' || parts[0] === 'minimal' || parts[0] === 'step-only')) {
    return { step: true, summary: false, topology: false, report: false, heatmap: false };
  }
  if (parts.includes('standard') || parts.includes('default')) {
    return { step: true, summary: true, topology: false, report: true, heatmap: false };
  }
  return {
    step: parts.includes('step') || parts.includes('cad') || parts.includes('3d'),
    summary: parts.includes('summary') || parts.includes('json') || parts.includes('features'),
    topology: parts.includes('topology') || parts.includes('mesh'),
    report: parts.includes('report') || parts.includes('rsvs') || parts.includes('verify'),
    heatmap: parts.includes('heatmap') || parts.includes('glb')
  };
}

function requireNext(args: string[], i: number, flag: string): string {
  const val = args[i + 1];
  if (val === undefined || val.startsWith('-')) throw new Error(`Missing value for CLI option '${flag}'.`);
  return val;
}

function defaultOptions(cwd: string): PipelineOptions {
  return {
    threads: 0, quality: 'high', outDir: path.resolve(cwd, 'output'),
    verify: true, jsonOnly: false, stepOnly: false, heatmapMode: 'failed-only', verbose: false
  };
}

export function parseCliArgs(args: string[], cwd: string = process.cwd()): ParsedCliArgs {
  if (args.includes('--mcp')) {
    return { mode: 'mcp', inputPath: '', interactive: false, skipInteractive: true, hasExplicitEmit: false, options: defaultOptions(cwd) };
  }
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    return { mode: 'help', inputPath: '', interactive: false, skipInteractive: true, hasExplicitEmit: false, options: defaultOptions(cwd) };
  }
  if (args.includes('--test') || args.includes('--self-test')) {
    return { mode: 'test', inputPath: '', interactive: false, skipInteractive: true, hasExplicitEmit: false, options: defaultOptions(cwd) };
  }

  let inputPath = '', threads = 0, quality: 'high' | 'fast' = 'high';
  let outDir = path.resolve(cwd, 'output'), verify = true, jsonOnly = false, stepOnly = false;
  let heatmapMode: 'failed-only' | 'always' | 'none' = 'failed-only', verbose = false, alignCadViewer = false;
  let representationMode: 'brep' | 'tessellated' | 'auto' = 'auto';
  let threadMode: 'physical' | 'semantic' | 'auto' = 'auto';
  let material: string | undefined, interactive = false, skipInteractive = false;
  let emitTargets: EmitTargets | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-t' || arg === '--threads') {
      const parsed = parseInt(requireNext(args, i++, arg), 10);
      if (Number.isNaN(parsed) || parsed < 0) throw new Error(`Invalid thread count for '${arg}': must be a non-negative integer.`);
      threads = parsed;
    } else if (arg === '-q' || arg === '--quality') {
      quality = requireNext(args, i++, arg) === 'fast' ? 'fast' : 'high';
    } else if (arg === '-o' || arg === '--out-dir') {
      outDir = path.resolve(cwd, requireNext(args, i++, arg));
    } else if (arg === '-i' || arg === '--interactive') {
      interactive = true;
    } else if (arg === '-y' || arg === '--yes' || arg === '--default' || arg === '--non-interactive') {
      skipInteractive = true;
    } else if (arg === '--emit') {
      emitTargets = parseEmitString(requireNext(args, i++, arg));
    } else if (arg === '-m' || arg === '--material') {
      material = requireNext(args, i++, arg);
    } else if (arg === '--verify') {
      verify = true;
    } else if (arg === '--no-verify') {
      verify = false;
    } else if (arg === '--json-only') {
      jsonOnly = true;
      emitTargets = { step: false, summary: true, topology: true, report: true, heatmap: false };
    } else if (arg === '--step-only') {
      stepOnly = true;
      emitTargets = { step: true, summary: false, topology: false, report: false, heatmap: false };
    } else if (arg === '--representation') {
      const mode = requireNext(args, i++, arg);
      if (mode === 'brep' || mode === 'tessellated' || mode === 'auto') representationMode = mode;
      else throw new Error(`Invalid representation mode '${mode}'. Expected: 'auto', 'brep', 'tessellated'.`);
    } else if (arg === '--thread-mode') {
      const mode = requireNext(args, i++, arg);
      if (mode === 'physical' || mode === 'semantic' || mode === 'auto') threadMode = mode;
      else throw new Error(`Invalid thread mode '${mode}'. Expected: 'auto', 'physical', 'semantic'.`);
    } else if (arg === '--heatmap') {
      const mode = requireNext(args, i++, arg);
      if (mode === 'always' || mode === 'none' || mode === 'failed-only') heatmapMode = mode;
      else throw new Error(`Invalid heatmap mode '${mode}'. Expected: 'failed-only', 'always', 'none'.`);
    } else if (arg === '--keep-orientation' || arg === '--no-align-viewer') {
      alignCadViewer = false;
    } else if (arg === '--align-viewer') {
      alignCadViewer = true;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      inputPath = path.resolve(cwd, arg);
    }
  }

  return {
    mode: 'run', inputPath, interactive, skipInteractive,
    hasExplicitEmit: emitTargets !== undefined || jsonOnly || stepOnly,
    options: {
      threads, quality, outDir, verify, jsonOnly, stepOnly,
      heatmapMode, verbose, alignCadViewer, representationMode,
      threadMode, material, emitTargets
    }
  };
}

export function printHelp(): void {
  console.log(`
${chalk.bold.cyan('3D STL ➔ STEP + JSON Reverse-Engineering Pipeline')}

${chalk.bold('USAGE:')}
  ./convert.sh [PATH_TO_STL_OR_DIR] [OPTIONS]

${chalk.bold('OPTIONS:')}
  -t, --threads <N>        Number of parallel worker threads (default: auto N-1)
  -q, --quality <preset>   Processing quality preset: 'high' (detailed) or 'fast' (quick)
  -o, --out-dir <path>     Output directory for results (default: ./output)
  -i, --interactive        Force interactive terminal wizard to choose output files
  -y, --yes, --default     Non-interactive mode: accept default outputs without prompting
  --emit <formats>         Comma-separated outputs: 'step', 'summary', 'topology', 'report', 'heatmap', 'all', 'minimal'
  --verify                 Enable RSVS verification gates (default: enabled)
  --no-verify              Disable RSVS verification
  --json-only              Generate semantic JSON only without STEP
  --step-only              Generate solid B-Rep STEP only without JSON
  --representation <mode>  STEP representation mode: 'auto', 'brep', 'tessellated'
  --thread-mode <mode>     Thread export mode: 'auto', 'physical', 'semantic'
  -m, --material <spec>    Assign material preset: 'glass', 'steel', 'aluminum', 'pla', 'petg', 'abs',
                           or multi-material mapping: '0=steel,1=glass' / 'aluminum,glass' / 'auto'
  --heatmap <mode>         Generate 3D GLB deviation heatmap: 'failed-only', 'always', 'none'
  --align-viewer           Auto-align 6 canonical views (Top/Bottom/Front/Back) for CAD viewers (default)
  --keep-orientation       Preserve original coordinates without CAD axis reorientation
  --mcp                    Run as Stdio MCP Server for AI (Cursor, Claude Desktop, Antigravity)
  --test                   Run embedded RSVS test suite and mutation tests
  -v, --verbose            Enable verbose logging
  -h, --help               Show this help message
`);
}
