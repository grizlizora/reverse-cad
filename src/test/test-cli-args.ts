// ==============================================================================
// src/test/test-cli-args.ts — Unit Tests for CLI Argument Parser & Options
// ==============================================================================

import { parseCliArgs, parseEmitString } from '../cli/cli-args.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runCliArgsTests(): Promise<boolean> {
  console.log('[TEST] Running CLI Argument Parser & Option tests...');

  // 1. Help & MCP modes
  const helpRes = parseCliArgs(['--help']);
  assert(helpRes.mode === 'help', 'Expected mode === "help"');

  const mcpRes = parseCliArgs(['--mcp']);
  assert(mcpRes.mode === 'mcp', 'Expected mode === "mcp"');

  const testRes = parseCliArgs(['--test']);
  assert(testRes.mode === 'test', 'Expected mode === "test"');

  // 2. Full Run Arguments
  const runRes = parseCliArgs([
    './input/model.stl',
    '-t', '4',
    '-q', 'fast',
    '-o', './custom_out',
    '--emit', 'step,summary,report',
    '-m', 'aluminum',
    '--representation', 'brep',
    '--thread-mode', 'semantic',
    '--heatmap', 'always',
    '--align-viewer',
    '-v'
  ]);

  assert(runRes.mode === 'run', 'Expected mode === "run"');
  assert(runRes.inputPath.endsWith('model.stl'), 'Expected inputPath to end with model.stl');
  assert(runRes.options.threads === 4, `Expected threads === 4, got ${runRes.options.threads}`);
  assert(runRes.options.quality === 'fast', 'Expected quality === fast');
  assert(runRes.options.outDir.endsWith('custom_out'), 'Expected outDir custom_out');
  assert(runRes.options.material === 'aluminum', 'Expected material === aluminum');
  assert(runRes.options.representationMode === 'brep', 'Expected brep representationMode');
  assert(runRes.options.threadMode === 'semantic', 'Expected semantic threadMode');
  assert(runRes.options.heatmapMode === 'always', 'Expected heatmapMode === always');
  assert(runRes.options.alignCadViewer === true, 'Expected alignCadViewer === true');
  assert(runRes.options.verbose === true, 'Expected verbose === true');
  assert(runRes.options.emitTargets?.step === true, 'Expected emit step');
  assert(runRes.options.emitTargets?.summary === true, 'Expected emit summary');
  assert(runRes.options.emitTargets?.report === true, 'Expected emit report');
  assert(runRes.options.emitTargets?.topology === false, 'Expected no emit topology');

  // 3. parseEmitString presets
  const emitAll = parseEmitString('all');
  assert(emitAll.step && emitAll.summary && emitAll.topology && emitAll.report && emitAll.heatmap, 'all emit failed');

  const emitStep = parseEmitString('step');
  assert(emitStep.step && !emitStep.summary && !emitStep.topology && !emitStep.report && !emitStep.heatmap, 'step-only emit failed');

  const emitStd = parseEmitString('standard');
  assert(emitStd.step && emitStd.summary && !emitStd.topology && emitStd.report && !emitStd.heatmap, 'standard emit failed');

  // 4. Missing value validation
  let caughtMissing = false;
  try {
    parseCliArgs(['./model.stl', '--threads']);
  } catch (err: any) {
    if (err.message.includes("Missing value for CLI option '--threads'")) caughtMissing = true;
  }
  assert(caughtMissing, 'Expected missing value error for --threads');

  // 5. Invalid numeric value validation
  let caughtInvalid = false;
  try {
    parseCliArgs(['./model.stl', '--threads', '-5']);
  } catch (err: any) {
    caughtInvalid = true;
  }
  assert(caughtInvalid, 'Expected invalid thread count error for --threads -5');

  console.log('  ✔ CLI Argument Parser & Flags: PASSED (Help, MCP, Test, Options, Presets, Error Guards)');
  return true;
}

if (process.argv[1]?.includes('test-cli-args')) {
  runCliArgsTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
