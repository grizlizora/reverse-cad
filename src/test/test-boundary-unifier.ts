// ==============================================================================
// src/test/test-boundary-unifier.ts — Unit Tests for B-Rep Boundary Unifier (Phase 2)
// ==============================================================================

import { extractUnifiedCoplanarBoundary } from '../stages/profiling/stage5-boundary-unifier.js';
import chalk from 'chalk';

export async function runBoundaryUnifierTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  PHASE 2: BOUNDARY UNIFIER & FEATURE PROTECTION TESTS'));
  console.log(chalk.bold.cyan('======================================================\n'));

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

  // TEST 1: Plate with Central Square Hole (8 triangles -> 1 unified face, 0 internal lines)
  {
    // Outer square: (0,0), (100,0), (100,100), (0,100)
    // Inner hole: (40,40), (60,40), (60,60), (40,60)
    const pos = new Float32Array([
      // Outer 4 vertices: 0, 1, 2, 3
      0, 0, 0,     100, 0, 0,     100, 100, 0,     0, 100, 0,
      // Inner 4 vertices: 4, 5, 6, 7
      40, 40, 0,    60, 40, 0,     60, 60, 0,     40, 60, 0
    ]);

    // 8 triangles triangulating the plate around the hole
    const idx = new Uint32Array([
      0, 1, 4,   1, 5, 4,
      1, 2, 5,   2, 6, 5,
      2, 3, 6,   3, 7, 6,
      3, 0, 7,   0, 4, 7
    ]);
    const tris = [0, 1, 2, 3, 4, 5, 6, 7];

    const faces = extractUnifiedCoplanarBoundary(tris, idx, pos, [0, 0, 1], [0, 0, 0]);

    assertTest('Plate with hole: exactly 1 unified face extracted', faces.length === 1);
    if (faces.length === 1) {
      const face = faces[0];
      assertTest(
        'Plate with hole: outer boundary has exactly 4 vertices',
        face.outerLoop.length === 4,
        `Actual outer length: ${face.outerLoop.length}`
      );
      assertTest(
        'Plate with hole: exactly 1 inner hole loop extracted',
        face.holeLoops.length === 1,
        `Actual hole count: ${face.holeLoops.length}`
      );
      assertTest(
        'Plate with hole: inner hole has exactly 4 vertices',
        face.holeLoops.length === 1 && face.holeLoops[0].length === 4,
        `Actual hole vertices: ${face.holeLoops[0]?.length}`
      );
    }
  }

  // TEST 2: Collinear edge reduction (10 collinear facet vertices on a straight edge)
  {
    // A square where bottom edge is subdivided into 5 segments
    const pos = new Float32Array([
      0, 0, 0,
      20, 0, 0,
      40, 0, 0,
      60, 0, 0,
      80, 0, 0,
      100, 0, 0,
      100, 100, 0,
      0, 100, 0
    ]);
    // Triangulated fan from top-left (7)
    const idx = new Uint32Array([
      7, 0, 1,
      7, 1, 2,
      7, 2, 3,
      7, 3, 4,
      7, 4, 5,
      7, 5, 6
    ]);
    const tris = [0, 1, 2, 3, 4, 5];

    const faces = extractUnifiedCoplanarBoundary(tris, idx, pos, [0, 0, 1], [0, 0, 0]);

    assertTest('Collinear reduction: exactly 1 face extracted', faces.length === 1);
    if (faces.length === 1) {
      assertTest(
        'Collinear reduction: simplified from 8 vertices down to 4 corners',
        faces[0].outerLoop.length === 4,
        `Actual outer vertices: ${faces[0].outerLoop.length}`
      );
    }
  }

  // TEST 3: Pinch Point Resolution (Two triangles touching at a single vertex)
  {
    // Bow-tie: triangle 1: (0,0)-(2,0)-(1,1), triangle 2: (1,1)-(2,2)-(0,2)
    // Touching at vertex 2: (1,1)
    const pos = new Float32Array([
      0, 0, 0,    2, 0, 0,    1, 1, 0,
      2, 2, 0,    0, 2, 0
    ]);
    const idx = new Uint32Array([
      0, 1, 2,
      2, 3, 4
    ]);
    const tris = [0, 1];

    const faces = extractUnifiedCoplanarBoundary(tris, idx, pos, [0, 0, 1], [0, 0, 0]);
    assertTest(
      'Pinch point resolution: cleanly peeled into 2 separate triangular faces',
      faces.length === 2 && faces.every(f => f.outerLoop.length === 3),
      `Faces extracted: ${faces.length}`
    );
  }

  // TEST 4: Finely tessellated small circular hole (R = 0.2 mm, 64 segments) preserved under collinearTol = 1e-4
  {
    const nSeg = 64;
    const R = 0.2;
    const coords: number[] = [
      -5, -5, 0,   5, -5, 0,   5, 5, 0,   -5, 5, 0
    ];
    for (let i = 0; i < nSeg; i++) {
      const ang = (2 * Math.PI * i) / nSeg;
      coords.push(R * Math.cos(ang), R * Math.sin(ang), 0);
    }
    const pos = new Float32Array(coords);
    const triList: number[] = [];
    for (let i = 0; i < nSeg; i++) {
      const curr = 4 + i;
      const next = 4 + ((i + 1) % nSeg);
      const corner = Math.floor((i * 4) / nSeg);
      const nextCorner = Math.floor((((i + 1) % nSeg) * 4) / nSeg);
      // Fan from outer corner to CW hole edge (next -> curr in CCW outer frame means hole is CW)
      triList.push(corner, next, curr);
      if (nextCorner !== corner) {
        triList.push(corner, nextCorner, next);
      }
    }
    const idx = new Uint32Array(triList);
    const tris = Array.from({ length: idx.length / 3 }, (_, i) => i);
    const faces = extractUnifiedCoplanarBoundary(tris, idx, pos, [0, 0, 1], [0, 0, 0], 1e-4);
    assertTest(
      'Small circular hole (R=0.2mm, 64 segs): preserved without collinear erasure',
      faces.length === 1 && faces[0].holeLoops.length === 1 && faces[0].holeLoops[0].length >= 8,
      `Holes count=${faces[0]?.holeLoops.length}, hole verts=${faces[0]?.holeLoops[0]?.length}`
    );
  }

  const allPassed = passedCount === totalTests;
  console.log(chalk.bold[allPassed ? 'green' : 'red'](
    `\n  Boundary Unifier Tests Result: ${passedCount}/${totalTests} Passed\n`
  ));
  return allPassed;
}

if (process.argv[1]?.includes('test-boundary-unifier')) {
  runBoundaryUnifierTests().then(success => {
    if (!success) process.exit(1);
  });
}
