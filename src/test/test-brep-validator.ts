// ==============================================================================
// src/test/test-brep-validator.ts — Unified Facade Runner for B-Rep Validator Tests
// ==============================================================================

import { runBrepValidatorSubmoduleTests } from './test-step-brep-submodules.js';
import { runBrepValidatorSolidTests } from './test-brep-validator-solid.js';
import chalk from 'chalk';

export async function runBrepValidatorTests(): Promise<boolean> {
  console.log(chalk.bold.magenta('\n======================================================'));
  console.log(chalk.bold.magenta('  STEP B-REP VALIDATOR & TOPOLOGY VERIFICATION SUITE'));
  console.log(chalk.bold.magenta('======================================================'));

  const submodulesOk = await runBrepValidatorSubmoduleTests();
  const solidOk = await runBrepValidatorSolidTests();
  const allPassed = submodulesOk && solidOk;

  console.log(chalk.bold[allPassed ? 'green' : 'red'](
    `\n  B-Rep Validation Overall Result: ${allPassed ? 'ALL TESTS PASSED' : 'TESTS FAILED'}\n`
  ));

  return allPassed;
}

// Direct CLI invocation guard (compatible with Node.js and Bun)
const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('test-brep-validator.ts') ||
  process.argv[1].endsWith('test-brep-validator.js')
);

if (isDirectExecution) {
  runBrepValidatorTests().then(success => {
    if (!success) process.exit(1);
  });
}
