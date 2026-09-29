// ==============================================================================
// src/cli/cli-wizard.ts — Interactive Terminal Wizard for Output Format Selection
// ==============================================================================

import { EmitTargets } from '../types/worker.js';
import chalk from 'chalk';
import * as readline from 'readline';

export async function promptInteractiveEmit(): Promise<EmitTargets> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const question = (query: string): Promise<string> =>
    new Promise(resolve => rl.question(query, resolve));

  try {
    console.log(chalk.bold.cyan('\n========================================================================'));
    console.log(chalk.bold.cyan('  ⚙️  OUTPUT FORMAT CONFIGURATION'));
    console.log(chalk.bold.cyan('========================================================================'));
    console.log(`  1) 🌟 ${chalk.bold('Standard CAD Package')} (.step + engineering .json + RSVS audit) [Enter]`);
    console.log(`  2) 🧊 ${chalk.bold('Solid 3D Only')} (.step only — minimal file size)`);
    console.log(`  3) 🔬 ${chalk.bold('Full Engineering Audit')} (all outputs + 3D heatmap .glb + topology)`);
    console.log(`  4) 🛠️  ${chalk.bold('Custom Selection')} (manually choose output targets)`);

    const ans = (await question(chalk.yellow('\nSelect option [1-4] (default 1): '))).trim();

    if (ans === '2') {
      return { step: true, summary: false, topology: false, report: false, heatmap: false };
    }
    if (ans === '3') {
      return { step: true, summary: true, topology: true, report: true, heatmap: true };
    }
    if (ans === '4') {
      console.log(chalk.cyan('\nSelect required output targets [y/n]:'));
      const qStep = (await question(' • 3D CAD model (.step)? [Y/n]: ')).trim().toLowerCase();
      const qSum = (await question(' • Engineering features summary (.summary.json)? [Y/n]: ')).trim().toLowerCase();
      const qTop = (await question(' • Deep B-Rep topology graph (.topology.json)? [y/N]: ')).trim().toLowerCase();
      const qRep = (await question(' • RSVS quality verification report (.verification_report.json)? [Y/n]: ')).trim().toLowerCase();
      const qHeat = (await question(' • 3D deviation heatmap (.heatmap.glb)? [y/N]: ')).trim().toLowerCase();
      return {
        step: qStep !== 'n' && qStep !== 'no',
        summary: qSum !== 'n' && qSum !== 'no',
        topology: qTop === 'y' || qTop === 'yes',
        report: qRep !== 'n' && qRep !== 'no',
        heatmap: qHeat === 'y' || qHeat === 'yes'
      };
    }
    return { step: true, summary: true, topology: false, report: true, heatmap: false };
  } finally {
    rl.close();
  }
}
