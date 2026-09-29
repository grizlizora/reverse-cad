// ==============================================================================
// src/test/test-step-brep-submodules.ts — In-Memory B-Rep Validation Submodule Tests
// ==============================================================================

import {
  StepStreamingLexer,
  SpatialVertexIndexer,
  FaceGeometryEvaluator
} from '../kernel/step/step-brep-validator.js';
import chalk from 'chalk';

export async function runBrepValidatorSubmoduleTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n--- [UNIT] StepBrepValidator Submodules (In-Memory) ---'));
  let passedCount = 0;
  let totalTests = 0;

  function assertCondition(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ${chalk.green('✔')} ${name}`);
      passedCount++;
    } else {
      console.log(`  ${chalk.red('✖')} ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // 1. StepStreamingLexer: Zero-allocation scanner & comment/quote safety
  try {
    const lexStepSample = `ISO-10303-21;
DATA;
/* Block comment with ; semicolon inside */
#10 = CARTESIAN_POINT('name;with;semicolons', (1.0, 2.0, 3.0));
#20 = VERTEX_POINT('escaped''quote;test', #10);
ENDSEC;
END-ISO-10303-21;`;

    const lexedEntities: Array<[string, string]> = [];
    StepStreamingLexer.scanStatements(lexStepSample, (id, rhs) => {
      lexedEntities.push([id, rhs]);
    });

    const isLexerValid =
      lexedEntities.length === 2 &&
      lexedEntities[0][0] === '#10' &&
      lexedEntities[1][0] === '#20';
    assertCondition('StepStreamingLexer: Zero-copy scanning & comment/string semicolon safety', isLexerValid);
  } catch (err: unknown) {
    assertCondition('StepStreamingLexer execution', false, String(err));
  }

  // 2. SpatialVertexIndexer: 27-cell neighborhood boundary quantization protection
  try {
    const indexer = new SpatialVertexIndexer(1e-4);
    // 0.00004999 and 0.00005001 straddle the 0.5*tol rounding boundary (distance = 2e-8 << 1e-4)
    const k1 = indexer.resolveVertexKey({ x: 0.00004999, y: 1.0, z: 2.0 });
    const k2 = indexer.resolveVertexKey({ x: 0.00005001, y: 1.0, z: 2.0 });
    assertCondition(
      'SpatialVertexIndexer: 27-cell neighborhood boundary quantization guard',
      k1 === k2,
      `Key mismatch: ${k1} vs ${k2}`
    );
  } catch (err: unknown) {
    assertCondition('SpatialVertexIndexer execution', false, String(err));
  }

  // 3. FaceGeometryEvaluator: 3D Polygon area evaluation with hole loop subtraction
  try {
    const outerSquare = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 0, y: 10, z: 0 }
    ];
    const innerHoleSquare = [
      { x: 2, y: 2, z: 0 },
      { x: 4, y: 2, z: 0 },
      { x: 4, y: 4, z: 0 },
      { x: 2, y: 4, z: 0 }
    ];
    const evalWithHole = FaceGeometryEvaluator.evaluatePolygon(
      '#999',
      outerSquare,
      { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 }, dimensions: { x: 10, y: 10, z: 10 } },
      [innerHoleSquare],
      true
    );
    const hasPoly = evalWithHole.polygon !== undefined;
    const isAreaAccurate = hasPoly && Math.abs(evalWithHole.polygon!.area - 96.0) < 1e-6;
    assertCondition(
      'FaceGeometryEvaluator: Net area with inner hole loop subtraction (100 - 4 = 96.0 mm²)',
      isAreaAccurate,
      `Got area: ${evalWithHole.polygon?.area}`
    );
  } catch (err: unknown) {
    assertCondition('FaceGeometryEvaluator execution', false, String(err));
  }

  return passedCount === totalTests;
}

if (process.argv[1]?.includes('test-step-brep-submodules')) {
  runBrepValidatorSubmoduleTests().then(success => {
    if (!success) process.exit(1);
  });
}
