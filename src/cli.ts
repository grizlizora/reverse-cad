#!/usr/bin/env node
// ==============================================================================
// src/cli.ts — Command Line Interface Entry Point
// ==============================================================================

import { PipelineOptions } from './types/worker.js';
import { runScheduler } from './orchestrator/scheduler.js';
import { runMutationSelfTest } from './rsvs/mutation-self-test.js';
import { startMcpServer } from './mcp/cad-mcp-server.js';
import chalk from 'chalk';
import * as path from 'path';

function printHelp(): void {
  console.log(`
${chalk.bold.cyan('3D STL ➔ STEP + JSON Reverse-Engineering Pipeline')}

${chalk.bold('USAGE:')}
  ./convert.sh [PATH_TO_STL_OR_DIR] [OPTIONS]

${chalk.bold('OPTIONS:')}
  -t, --threads <N>        Number of parallel worker threads (default: auto N-1)
  -q, --quality <preset>   Processing quality preset: 'high' (detailed) or 'fast' (quick)
  -o, --out-dir <path>     Output directory for results (default: ./output)
  --verify                 Enable RSVS verification gates (default: enabled)
  --no-verify              Disable RSVS verification
  --json-only              Generate semantic JSON only without STEP
  --step-only              Generate solid B-Rep STEP only without JSON
  --heatmap <mode>         Generate 3D GLB deviation heatmap: 'failed-only', 'always', 'none'
  --align-viewer           Auto-align 6 canonical views (Top/Bottom/Front/Back) for CAD viewers (default)
  --keep-orientation       Preserve original coordinates without CAD axis reorientation
  --mcp                    Run as Stdio MCP Server for AI (Cursor, Claude Desktop, Antigravity)
  --test                   Run embedded RSVS test suite and mutation tests
  -v, --verbose            Enable verbose logging
  -h, --help               Show this help message

${chalk.bold('EXAMPLES:')}
  ./convert.sh ./input/bracket.stl
  ./convert.sh ./input_models/ -o ./converted_step/ -t 8
  ./convert.sh --mcp
  ./convert.sh --test
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Check MCP server flag
  if (args.includes('--mcp')) {
    await startMcpServer();
    return;
  }

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  // Check test flag
  if (args.includes('--test')) {
    console.log(chalk.bold.cyan('\n🧪 RUNNING AUTONOMOUS RSVS MUTATION TESTS...'));
    const res = await runMutationSelfTest();
    console.log(` • Defects tested: ${res.totalDefectsTested}`);
    console.log(` • Successfully detected by gates: ${chalk.green(res.defectsDetected)}/${res.totalDefectsTested}`);
    for (const d of res.defectResults) {
      console.log(`   ${d.caught ? chalk.green('✔') : chalk.red('✖')} [${d.failingGate}] ${d.name}`);
    }
    if (res.allDefectsCaught) {
      console.log(chalk.bold.green('\n✔ ALL MUTATION DEFECTS SUCCESSFULLY CAUGHT BY RSVS. SYSTEM READY FOR PRODUCTION.\n'));
      process.exit(0);
    } else {
      console.log(chalk.bold.red('\n✖ SOME DEFECTS WERE NOT DETECTED.\n'));
      process.exit(1);
    }
  }

  let inputPath = '';
  let threads = 0;
  let quality: 'high' | 'fast' = 'high';
  let outDir = path.resolve(process.cwd(), 'output');
  let verify = true;
  let jsonOnly = false;
  let stepOnly = false;
  let heatmapMode: 'failed-only' | 'always' | 'none' = 'failed-only';
  let verbose = false;
  let alignCadViewer = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-t' || arg === '--threads') {
      threads = parseInt(args[++i], 10) || 0;
    } else if (arg === '-q' || arg === '--quality') {
      quality = args[++i] === 'fast' ? 'fast' : 'high';
    } else if (arg === '-o' || arg === '--out-dir') {
      outDir = path.resolve(process.cwd(), args[++i]);
    } else if (arg === '--verify') {
      verify = true;
    } else if (arg === '--no-verify') {
      verify = false;
    } else if (arg === '--json-only') {
      jsonOnly = true;
    } else if (arg === '--step-only') {
      stepOnly = true;
    } else if (arg === '--heatmap') {
      const mode = args[++i];
      if (mode === 'always' || mode === 'none' || mode === 'failed-only') {
        heatmapMode = mode;
      }
    } else if (arg === '--keep-orientation' || arg === '--no-align-viewer') {
      alignCadViewer = false;
    } else if (arg === '--align-viewer') {
      alignCadViewer = true;
    } else if (arg === '-v' || arg === '--verbose') {
      verbose = true;
    } else if (!arg.startsWith('-')) {
      inputPath = path.resolve(process.cwd(), arg);
    }
  }

  if (!inputPath) {
    console.error(chalk.red('Error: No input file or directory containing STL models specified.'));
    printHelp();
    process.exit(1);
  }

  const options: PipelineOptions = {
    threads,
    quality,
    outDir,
    verify,
    jsonOnly,
    stepOnly,
    heatmapMode,
    verbose,
    alignCadViewer
  };

  try {
    await runScheduler(inputPath, options);
    process.exit(0);
  } catch (err: any) {
    console.error(chalk.red(`\nPipeline execution error: ${err.message}`));
    if (verbose) console.error(err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
