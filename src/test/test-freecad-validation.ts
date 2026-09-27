// ==============================================================================
// src/test/test-freecad-validation.ts — Automated FreeCAD B-Rep Import Validation Suite
// ==============================================================================

import {
  generatePrismaticM6Model,
  generateInternalLabyrinthModel,
  generatePrintInPlaceHingeModel,
  generateOrganicSaddleModel
} from '../rsvs/procedural-benchmarks.js';
import { processPipelineTask } from '../worker/pipeline-worker.js';
import { writeMeshToBinaryStl } from '../utils/stl-writer.js';
import { withTempDir } from './temp-dir-guard.js';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';

interface FreeCADResult {
  isNull: boolean;
  solids: number;
  faces: number;
  volume: number;
  docObjects: string[];
  error?: string;
}

function verifyStepWithFreeCAD(stepPath: string): FreeCADResult {
  const pyCode = `import FreeCAD, Part, json; doc = FreeCAD.newDocument('ValDoc'); Part.insert('${stepPath}', 'ValDoc'); shape = Part.read('${stepPath}'); print('FREECAD_JSON:' + json.dumps({'isNull': shape.isNull(), 'solids': len(shape.Solids), 'faces': len(shape.Faces), 'volume': float(shape.Volume), 'docObjects': [o.Name for o in doc.Objects]}))`;

  try {
    const rawOut = execSync(
      `/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd -c "${pyCode}"`,
      { encoding: 'utf-8', timeout: 25000 }
    );
    const jsonMatch = rawOut.match(/FREECAD_JSON:(\{.*\})/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    const errMatch = rawOut.match(/FREECAD_ERROR:(.*)/);
    return {
      isNull: true,
      solids: 0,
      faces: 0,
      volume: 0,
      docObjects: [],
      error: errMatch ? errMatch[1] : 'Unknown FreeCAD execution failure'
    };
  } catch (err: any) {
    return {
      isNull: true,
      solids: 0,
      faces: 0,
      volume: 0,
      docObjects: [],
      error: err.message
    };
  }
}

export async function runFreeCadValidation(): Promise<boolean> {
  console.log(chalk.bold.magenta('\n======================================================'));
  console.log(chalk.bold.magenta('  FREECAD OPEN CASCADE B-REP AUTOMATED VALIDATION'));
  console.log(chalk.bold.magenta('======================================================\n'));

  return withTempDir('freecad_validation', async (tmpDir) => {
    const models = [
      { name: 'Prismatic_M6', gen: generatePrismaticM6Model },
      { name: 'Internal_Labyrinth', gen: generateInternalLabyrinthModel },
      { name: 'PrintInPlace_Hinge', gen: generatePrintInPlaceHingeModel },
      { name: 'Organic_Saddle', gen: generateOrganicSaddleModel }
    ];

    let allPassed = true;

    for (const m of models) {
      const stlPath = path.join(tmpDir, `${m.name}.stl`);
      const mesh = m.gen();
      await writeMeshToBinaryStl(mesh, stlPath);

      // Run full production pipeline
      const taskResult = await processPipelineTask({
        taskId: `task_${m.name}`,
        filePath: stlPath,
        fileSizeBytes: fs.statSync(stlPath).size,
        options: {
          threads: 1,
          quality: 'high',
          outDir: tmpDir,
          verify: true,
          jsonOnly: false,
          stepOnly: false,
          heatmapMode: 'none',
          verbose: false
        }
      });

      const stepPath = path.join(tmpDir, `${m.name}.step`);
      if (!fs.existsSync(stepPath)) {
        console.log(chalk.red(`  ✖ ${m.name}: STEP file was not produced!`));
        allPassed = false;
        continue;
      }

      const res = verifyStepWithFreeCAD(stepPath);
      if (res.isNull || res.solids === 0) {
        console.log(chalk.red(`  ✖ ${m.name}: FreeCAD import FAILED. isNull=${res.isNull}, Solids=${res.solids}, Error=${res.error}`));
        allPassed = false;
      } else {
        console.log(chalk.green(`  ✔ ${m.name}: FreeCAD import PASSED! Solids=${res.solids}, Faces=${res.faces}, Volume=${res.volume.toFixed(2)} mm³, Objects=[${res.docObjects.join(', ')}]`));
      }
    }

    if (allPassed) {
      console.log(chalk.bold.green('\n======================================================'));
      console.log(chalk.bold.green('  ✔ ALL MODELS VALIDATED & CONFIRMED IN FREECAD!'));
      console.log(chalk.bold.green('======================================================\n'));
    } else {
      console.log(chalk.bold.red('\n  ✖ SOME MODELS FAILED FREECAD VALIDATION.'));
    }

    return allPassed;
  });
}

// Direct driver execution
runFreeCadValidation().then(success => {
  if (!success) process.exit(1);
}).catch(err => {
  console.error('Validation failure:', err);
  process.exit(1);
});
