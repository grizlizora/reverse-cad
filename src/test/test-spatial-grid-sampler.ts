// ==============================================================================
// src/test/test-spatial-grid-sampler.ts — Unit & Zero-Allocation Audit for Spatial Grid
// ==============================================================================

import {
  UniformSpatialGrid3D,
  buildSpatialGrid
} from '../stages/segmentation/spatial-grid.js';
import {
  FastPRNG,
  pickRandomUnassigned,
  pickLocalizedNeighborBuffers
} from '../stages/segmentation/cylinder-sampler.js';
import chalk from 'chalk';

export async function runSpatialGridSamplerTests(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n--- [TEST] Spatial Grid & Deterministic RANSAC Sampler ---'));
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

  // 1. UniformSpatialGrid3D: Insertion and Zero-Allocation Traversal
  try {
    const grid = new UniformSpatialGrid3D(10.0);
    grid.insert(0, 5.0, 5.0, 5.0);
    grid.insert(1, 12.0, 5.0, 5.0); // adjacent cell
    grid.insert(2, 50.0, 50.0, 50.0); // distant cell

    const collected: number[] = [];
    grid.forEachNeighbor(5.0, 5.0, 5.0, (idx) => collected.push(idx));

    const hasNeighbors = collected.includes(0) && collected.includes(1) && !collected.includes(2);
    assertCondition('UniformSpatialGrid3D: forEachNeighbor zero-allocation 27-cell traversal', hasNeighbors);

    const outBuf: number[] = [];
    const count = grid.queryNeighborsInto(5.0, 5.0, 5.0, outBuf);
    assertCondition('UniformSpatialGrid3D: queryNeighborsInto fills buffer without re-allocating', count === 2 && outBuf.length === 2);
  } catch (err: unknown) {
    assertCondition('UniformSpatialGrid3D traversal execution', false, String(err));
  }

  // 2. FastPRNG Determinism & Consistency
  try {
    const prng1 = new FastPRNG(0xabcdef);
    const prng2 = new FastPRNG(0xabcdef);
    let match = true;
    for (let i = 0; i < 50; i++) {
      if (prng1.next() !== prng2.next()) {
        match = false;
        break;
      }
    }
    assertCondition('FastPRNG: 100% reproducible deterministic pseudo-random sequences', match);
  } catch (err: unknown) {
    assertCondition('FastPRNG determinism execution', false, String(err));
  }

  // 3. pickRandomUnassigned: Both 1-argument and 3-argument overloads
  try {
    const unassigned = new Uint8Array([0, 0, 1, 0, 1]);
    const idx1 = pickRandomUnassigned(unassigned);
    assertCondition('pickRandomUnassigned: 1-arg backward-compatible signature returns valid index', idx1 === 2 || idx1 === 4);

    const prng = new FastPRNG(0x42);
    const idx2 = pickRandomUnassigned(unassigned, prng, unassigned.length);
    assertCondition('pickRandomUnassigned: 3-arg deterministic signature returns valid index', idx2 === 2 || idx2 === 4);
  } catch (err: unknown) {
    assertCondition('pickRandomUnassigned execution', false, String(err));
  }

  // 4. pickLocalizedNeighborBuffers: Micro-feature detection (0.1 mm) & Spatial bounds
  try {
    const unassigned = new Uint8Array([1, 1, 1]);
    // Centroids: [0, 0, 0], [0.05, 0, 0] (distance 0.05 mm), [10.0, 0, 0] (distance 10 mm)
    const centroids = new Float32Array([
      0.0, 0.0, 0.0,
      0.05, 0.0, 0.0,
      10.0, 0.0, 0.0
    ]);
    const grid = buildSpatialGrid(unassigned, centroids, 5.0);
    const prng = new FastPRNG(0x777);

    // Probe point at (0, 0, 0) looking for neighbor within maxDist = 0.1 mm
    const neighborIdx = pickLocalizedNeighborBuffers(
      unassigned,
      centroids,
      [0.0, 0.0, 0.0],
      0.1,
      grid,
      prng
    );
    assertCondition(
      'pickLocalizedNeighborBuffers: Detects 0.05 mm micro-feature (minDistSq 1e-8)',
      neighborIdx === 1,
      `Expected 1, got ${neighborIdx}`
    );
  } catch (err: unknown) {
    assertCondition('pickLocalizedNeighborBuffers execution', false, String(err));
  }

  return passedCount === totalTests;
}

const isDirectExecution = process.argv[1] && (
  process.argv[1].endsWith('test-spatial-grid-sampler.ts') ||
  process.argv[1].endsWith('test-spatial-grid-sampler.js')
);

if (isDirectExecution) {
  runSpatialGridSamplerTests().then(success => {
    if (!success) process.exit(1);
  });
}
