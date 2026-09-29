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
    console.log(chalk.bold.cyan('  ⚙️  НАЛАШТУВАННЯ ВИХІДНИХ ФАЙЛІВ ДЛЯ КОНВЕРТАЦІЇ'));
    console.log(chalk.bold.cyan('========================================================================'));
    console.log(`  1) 🌟 ${chalk.bold('Стандартний CAD-пакет')} (.step + інженерне резюме .json + аудит RSVS) [Enter]`);
    console.log(`  2) 🧊 ${chalk.bold('Тільки 3D-солід')} (тільки .step — мінімальний розмір файлу)`);
    console.log(`  3) 🔬 ${chalk.bold('Повний інженерний аудит')} (все + 3D теплова карта .glb + топологія)`);
    console.log(`  4) 🛠️  ${chalk.bold('Кастомний вибір')} (вибрати файли окремо вручну)`);

    const ans = (await question(chalk.yellow('\nОберіть варіант [1-4] (за замовчуванням 1): '))).trim();

    if (ans === '2') {
      return { step: true, summary: false, topology: false, report: false, heatmap: false };
    }
    if (ans === '3') {
      return { step: true, summary: true, topology: true, report: true, heatmap: true };
    }
    if (ans === '4') {
      console.log(chalk.cyan('\nВкажіть потрібні файли [y/n]:'));
      const qStep = (await question(' • 3D CAD-модель (.step)? [Y/n]: ')).trim().toLowerCase();
      const qSum = (await question(' • Інженерне резюме елементів (.summary.json)? [Y/n]: ')).trim().toLowerCase();
      const qTop = (await question(' • Глибока топологічна B-Rep карта (.topology.json)? [y/N]: ')).trim().toLowerCase();
      const qRep = (await question(' • Звіт верифікації точності RSVS (.verification_report.json)? [Y/n]: ')).trim().toLowerCase();
      const qHeat = (await question(' • 3D-теплова карта відхилень (.heatmap.glb)? [y/N]: ')).trim().toLowerCase();
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
