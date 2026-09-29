// ==============================================================================
// src/test/test-step-topology-linter.ts — Unit Tests for StepTopologyLinter (Phase 0)
// ==============================================================================

import { StepTopologyLinter } from '../kernel/step/step-topology-linter.js';
import chalk from 'chalk';
import {
  CUBE_EDGES_FIXTURE,
  SYNTHETIC_AP242_STEP,
  HYBRID_SEAM_STEP
} from './fixtures/step-topology-fixtures.js';

export async function runTopologyLinterTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  PHASE 0: IN-MEMORY B-REP TOPOLOGY LINTER VERIFICATION'));
  console.log(chalk.bold.cyan('======================================================\n'));

  const linter = new StepTopologyLinter();
  let passedCount = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ${chalk.green('✔')} ${name}`);
      passedCount++;
    } else {
      console.log(`  ${chalk.red('✖')} ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  function runCase(name: string, testFn: () => void): void {
    try {
      testFn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      assertTest(`${name} execution`, false, `Unexpected error: ${msg}`);
    }
  }

  // TEST 1: Watertight Cube (V=8, E=12, F=6, chi=2)
  runCase('Watertight Cube', () => {
    linter.reset();
    for (const [eId, v1, v2] of CUBE_EDGES_FIXTURE) {
      linter.registerEdgeCurve(eId, v1, v2);
      linter.registerOrientedEdge(eId, true);
      linter.registerOrientedEdge(eId, false);
    }
    for (let f = 1; f <= 6; f++) linter.registerFace(`#F${f}`, true);
    const report = linter.evaluateReport();
    assertTest('Watertight Manifold Cube: isWatertight === true', report.isWatertight && report.boundaryEdgeCount === 0);
    assertTest('Watertight Manifold Cube: isManifold === true', report.isManifold && report.nonManifoldEdgeCount === 0);
    assertTest('Watertight Manifold Cube: Euler-Poincaré chi === 2', report.eulerCharacteristic === 2,
      `Actual chi: ${report.eulerCharacteristic}, V=${report.totalVertices}, E=${report.totalEdges}, F=${report.totalFaces}`);
  });

  // TEST 2: Open Box (Missing Lid) -> 4 Boundary Edges
  runCase('Open Box', () => {
    linter.reset();
    for (let e = 1; e <= 8; e++) {
      linter.registerEdgeCurve(`#E${e}`, `#V${e}`, `#V${e + 1}`);
      linter.registerOrientedEdge(`#E${e}`, true);
      linter.registerOrientedEdge(`#E${e}`, false);
    }
    for (let e = 9; e <= 12; e++) {
      linter.registerEdgeCurve(`#E${e}`, `#V${e}`, `#V${e + 1}`);
      linter.registerOrientedEdge(`#E${e}`, true);
    }
    for (let f = 1; f <= 5; f++) linter.registerFace(`#F${f}`, true);
    const report = linter.evaluateReport();
    assertTest('Open Box: boundaryEdgeCount === 4', report.boundaryEdgeCount === 4 && !report.isWatertight);
  });

  // TEST 3: Non-Manifold Edge (Edge shared by 3 faces)
  runCase('Non-Manifold Edge', () => {
    linter.reset();
    linter.registerEdgeCurve('#E_SHARED', '#V1', '#V2');
    linter.registerOrientedEdge('#E_SHARED', true);
    linter.registerOrientedEdge('#E_SHARED', false);
    linter.registerOrientedEdge('#E_SHARED', true);
    linter.registerFace('#F1', true);
    linter.registerFace('#F2', true);
    linter.registerFace('#F3', true);
    const report = linter.evaluateReport();
    assertTest('Non-Manifold Edge: detected nonManifoldEdgeCount === 1', report.nonManifoldEdgeCount === 1 && !report.isManifold);
  });

  // TEST 4: Inverted Face Normals (Edge shared twice with matching .T. / .T. orientations)
  runCase('Inverted Normals', () => {
    linter.reset();
    linter.registerEdgeCurve('#E_INV', '#V1', '#V2');
    linter.registerOrientedEdge('#E_INV', true);
    linter.registerOrientedEdge('#E_INV', true);
    linter.registerFace('#F1', true);
    linter.registerFace('#F2', true);
    const report = linter.evaluateReport();
    assertTest('Inverted Normals: detected invertedOrientationCount === 1', report.invertedOrientationCount === 1);
  });

  // TEST 5: STEP Text Parser with Synthetic ISO 10303-21 Content
  runCase('STEP Text Parser', () => {
    const report = linter.parseAndLintStep(SYNTHETIC_AP242_STEP);
    assertTest(
      'STEP Text Parser: parsed entities and measured < 50ms',
      report.linterDurationMs < 50 && report.totalVertices === 4,
      `Duration: ${report.linterDurationMs.toFixed(2)} ms, Vertices: ${report.totalVertices}`
    );
    assertTest(
      'STEP Text Parser: detected edge loop and advanced face',
      report.edgeLoopCount === 1 && report.advancedFaceCount === 1
    );
  });

  // TEST 6: Hybrid Seam (EDGE_CURVE + POLY_LOOP) & Inner Ring (FACE_BOUND, R=1)
  runCase('Hybrid Seam & Inner Ring', () => {
    const report = linter.parseAndLintStep(HYBRID_SEAM_STEP);
    assertTest(
      'Hybrid Seam & Inner Ring: EDGE_LOOP + POLY_LOOP matched with 0 boundary edges and R=1',
      report.boundaryEdgeCount === 0 && report.isManifold && report.eulerCharacteristic === 0,
      `boundaryEdges=${report.boundaryEdgeCount}, chi=${report.eulerCharacteristic}`
    );
  });

  const allPassed = passedCount === totalTests;
  console.log(chalk.bold[allPassed ? 'green' : 'red'](
    `\n  Linter Tests Result: ${passedCount}/${totalTests} Passed\n`
  ));
  return allPassed;
}

if (process.argv[1]?.includes('test-step-topology-linter')) {
  runTopologyLinterTests().then(success => {
    if (!success) process.exit(1);
  });
}
