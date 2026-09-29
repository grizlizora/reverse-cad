#!/usr/bin/env node
// ==============================================================================
// src/cli.ts — Command Line Interface Entry Point
// ==============================================================================

import chalk from 'chalk';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseEmitString, parseCliArgs, printHelp, type ParsedCliArgs } from './cli/cli-args.js';
import { promptInteractiveEmit } from './cli/cli-wizard.js';

export { parseEmitString, parseCliArgs, printHelp, promptInteractiveEmit };
export type { ParsedCliArgs };

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let parsed: ParsedCliArgs;
  try {
    parsed = parseCliArgs(argv);
  } catch (err: any) {
    console.error(chalk.red(`Error: ${err.message}`));
    printHelp();
    process.exit(1);
  }

  if (parsed.mode === 'mcp') {
    const { startMcpServer } = await import('./mcp/cad-mcp-server.js');
    await startMcpServer();
    return;
  }

  if (parsed.mode === 'help') {
    printHelp();
    process.exit(0);
  }

  if (parsed.mode === 'test') {
    console.log(chalk.bold.cyan('\n🧪 RUNNING AUTONOMOUS RSVS MUTATION TESTS...'));
    const { runMutationSelfTest } = await import('./rsvs/mutation-self-test.js');
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

  if (!parsed.inputPath) {
    console.error(chalk.red('Error: No input file or directory containing STL models specified.'));
    printHelp();
    process.exit(1);
  }

  const { options } = parsed;
  const isTTY = Boolean(process.stdin.isTTY && !process.env.CI && !process.env.NON_INTERACTIVE);

  if (!parsed.skipInteractive && (parsed.interactive || (!parsed.hasExplicitEmit && isTTY))) {
    options.emitTargets = await promptInteractiveEmit();
  }

  if (options.emitTargets) {
    const activeList = Object.entries(options.emitTargets)
      .filter(([_, v]) => v)
      .map(([k]) => k.toUpperCase());
    console.log(chalk.cyan(` • Selected output targets: [${activeList.join(', ')}]`));
  }

  if (options.material) {
    console.log(chalk.cyan(` • Material assignment configuration: "${options.material}"`));
  }

  try {
    const { runScheduler } = await import('./orchestrator/scheduler.js');
    await runScheduler(parsed.inputPath, options);
    process.exit(0);
  } catch (err: any) {
    console.error(chalk.red(`\nPipeline execution error: ${err.message}`));
    if (options.verbose) console.error(err);
    process.exit(1);
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    const entryBase = path.basename(process.argv[1]).replace(/\.[jt]s$/, '');
    const selfBase = path.basename(fileURLToPath(import.meta.url)).replace(/\.[jt]s$/, '');
    return entryBase === selfBase || entryBase === 'cad-reverse' || entryBase === 'reverse-cad' || entryBase === 'stl-convert';
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
