// ==============================================================================
// src/test/test-step-analytical-solids.ts — Phase 3 STEP Analytical Solids Test Suite
// ==============================================================================

import { fitCircleLeastSquares, fitCircleFrom3Points } from '../kernel/step/analytical/least-squares-circle-fitter.js';
import { fitAnalyticProfileLoop } from '../kernel/step/analytical/profile-fitter.js';
import { computeAnalyticLoopArea, computeExtrusionNetVolume } from '../kernel/step/analytical/profile-geometry-evaluator.js';
import { extrudeAnalyticProfile } from '../kernel/step/analytical/profile-extruder.js';
import { synthesizeRevolutionFaces } from '../kernel/step/revolution/revolution-face-synthesizer.js';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { StepStreamWriter } from '../kernel/step/step-stream-writer.js';
import { RevolutionFeatureZone } from '../kernel/step/revolution/revolution-zband-analyzer.js';

function createMockStepStreamWriter(): { writer: StepStreamWriter; getContent: () => string } {
  let content = '';
  const mock = {
    content: '',
    writeLine: async (line: string) => { content += line + '\n'; },
    writeBlock: async (block: string) => { content += block; },
    flush: async () => {},
    close: async () => {}
  } as unknown as StepStreamWriter;
  return { writer: mock, getContent: () => content };
}

export async function runAnalyticalSolidsTests(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('  PHASE 3: STEP ANALYTICAL SOLIDS & EXTRUSION TESTS');
  console.log('======================================================\n');

  let passedCount = 0;
  let totalTests = 0;

  function assertTest(name: string, condition: boolean, detail?: string): void {
    totalTests++;
    if (condition) {
      console.log(`  ✔ ${name}`);
      passedCount++;
    } else {
      console.log(`  ✖ ${name}${detail ? ` — ${detail}` : ''}`);
    }
  }

  // 1. Kåsa least squares circle fit test with coordinate shift
  {
    const trueCx = 50.0, trueCy = -75.0, trueR = 12.5;
    const points: [number, number][] = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI; // semi-circle
      const noise = ((i % 2 === 0 ? 1 : -1) * 0.001);
      points.push([trueCx + (trueR + noise) * Math.cos(angle), trueCy + (trueR + noise) * Math.sin(angle)]);
    }
    const fit = fitCircleLeastSquares(points);
    assertTest('Kåsa circle fit: center found', fit !== null && Math.abs(fit.center[0] - trueCx) < 0.02 && Math.abs(fit.center[1] - trueCy) < 0.02);
    assertTest('Kåsa circle fit: radius found', fit !== null && Math.abs(fit.radius - trueR) < 0.02);
  }

  // 2. Profile loop fitting with mixed line and arc chords
  {
    const poly: [number, number][] = [
      [0, 0], [20, 0], [20, 10]
    ];
    // Add 8 points for an arc of R=5 from (20,10) to (10,20) with center (15,15)
    for (let k = 1; k <= 7; k++) {
      const a = (k / 8) * (Math.PI * 0.5);
      poly.push([20 - 5 * (1 - Math.cos(a)), 10 + 5 * Math.sin(a)]);
    }
    poly.push([10, 20], [0, 20]);

    const fitted = fitAnalyticProfileLoop(poly, 0.1);
    assertTest('Profile fitter: loop extracted', fitted.segments.length > 0);
    assertTest('Profile fitter: arc detected', fitted.arcCount >= 1);
  }

  // 3. Green's theorem area and net extrusion volume evaluation
  {
    const squareLoop = {
      segments: [
        { type: 'line' as const, start: [0, 0] as [number, number], end: [10, 0] as [number, number], length: 10 },
        { type: 'line' as const, start: [10, 0] as [number, number], end: [10, 10] as [number, number], length: 10 },
        { type: 'line' as const, start: [10, 10] as [number, number], end: [0, 10] as [number, number], length: 10 },
        { type: 'line' as const, start: [0, 10] as [number, number], end: [0, 0] as [number, number], length: 10 }
      ],
      isClosed: true,
      totalLength: 40,
      arcCount: 0,
      lineCount: 4
    };
    const area = computeAnalyticLoopArea(squareLoop);
    assertTest('Green theorem area: 10x10 square', Math.abs(area - 100) < 1e-4);

    const holeLoop = {
      segments: [
        { type: 'line' as const, start: [3, 3] as [number, number], end: [7, 3] as [number, number], length: 4 },
        { type: 'line' as const, start: [7, 3] as [number, number], end: [7, 7] as [number, number], length: 4 },
        { type: 'line' as const, start: [7, 7] as [number, number], end: [3, 7] as [number, number], length: 4 },
        { type: 'line' as const, start: [3, 7] as [number, number], end: [3, 3] as [number, number], length: 4 }
      ],
      isClosed: true,
      totalLength: 16,
      arcCount: 0,
      lineCount: 4
    };
    const vol = computeExtrusionNetVolume(squareLoop, [holeLoop], 5);
    // (100 - 16) * 5 = 420
    assertTest('Extrusion net volume: (100 - 16) * 5 = 420', Math.abs(vol - 420) < 1e-4);
  }

  // 4. Extruder closed shell & capping synthesis
  {
    const { writer, getContent } = createMockStepStreamWriter();
    const allocator = new StepIdAllocator(100);
    const squareLoop = {
      segments: [
        { type: 'line' as const, start: [0, 0] as [number, number], end: [10, 0] as [number, number], length: 10 },
        { type: 'line' as const, start: [10, 0] as [number, number], end: [10, 10] as [number, number], length: 10 },
        { type: 'line' as const, start: [10, 10] as [number, number], end: [0, 10] as [number, number], length: 10 },
        { type: 'line' as const, start: [0, 10] as [number, number], end: [0, 0] as [number, number], length: 10 }
      ],
      isClosed: true,
      totalLength: 40,
      arcCount: 0,
      lineCount: 4
    };
    const result = await extrudeAnalyticProfile(writer, allocator, squareLoop, 0, 10);
    assertTest('Profile extruder: closed shell emitted', getContent().includes('CLOSED_SHELL'));
    assertTest('Profile extruder: includes 4 lateral + 2 caps = 6 faces', result.faceIds.length === 6);
    assertTest('Profile extruder: exact volume = 1000', Math.abs(result.volume - 1000) < 1e-3);
  }

  // 5. Revolution cylinder and cone faces synthesizer
  {
    const { writer, getContent } = createMockStepStreamWriter();
    const allocator = new StepIdAllocator(500);
    const zones: RevolutionFeatureZone[] = [
      {
        surfaceId: 'cyl_1',
        type: 'cylinder',
        axisOrigin: [0, 0, 0],
        axisDirection: [0, 0, 1],
        radius: 10,
        isInternal: false,
        bands: [{ zMin: 0, zMax: 20, isObstacleZone: false }],
        inlierTriangles: new Set([0, 1, 2])
      },
      {
        surfaceId: 'cone_1',
        type: 'cone',
        axisOrigin: [0, 0, 30],
        axisDirection: [0, 0, 1],
        radius: 15,
        isInternal: false,
        bands: [{ zMin: 0, zMax: 10, isObstacleZone: false }],
        inlierTriangles: new Set([3, 4])
      }
    ];

    const revResult = await synthesizeRevolutionFaces(writer, allocator, zones);
    assertTest('Revolution synthesizer: 2 semi-faces for cylinder + 2 for cone = 4 faces', revResult.faceIds.length === 4);
    assertTest('Revolution synthesizer: CYLINDRICAL_SURFACE emitted', getContent().includes('CYLINDRICAL_SURFACE'));
    assertTest('Revolution synthesizer: CONICAL_SURFACE emitted', getContent().includes('CONICAL_SURFACE'));
  }

  console.log(`\n  Analytical Solids Tests Result: ${passedCount}/${totalTests} Passed\n`);
  return passedCount === totalTests;
}

// Auto-run if executed directly
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('test-step-analytical-solids')) {
  runAnalyticalSolidsTests().then(ok => {
    if (!ok) process.exit(1);
  });
}
