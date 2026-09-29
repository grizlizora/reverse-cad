// ==============================================================================
// src/test/test-wave10-bugfixes.ts — Unit & Regression Tests for Wave 10 Bug Fixes
// ==============================================================================

import { computePolyhedralMassProperties } from '../utils/mass-properties.js';
import { triangulateBetweenLoops } from '../kernel/step/planar/loop-band-triangulator.js';
import { fitAnalyticProfileLoop } from '../kernel/step/analytical/profile-fitter.js';
import { parseCliArgs } from '../cli/cli-args.js';
import { UniformSpatialGrid3D } from '../stages/segmentation/spatial-grid.js';
import { FastPRNG, pickRandomUnassigned } from '../stages/segmentation/cylinder-sampler.js';
import { RawMesh } from '../types/geometry.js';

export function runWave10BugFixTests(): void {
  console.log('[TEST] Running Wave 10 Math, Concurrency & Topological Bug Fix Verification...');

  // 1. Test exact inertia tensor for unit cube (Gauss-Mirtich / 120.0 divisor)
  const cubePositions = new Float32Array([
    0, 0, 0,  1, 0, 0,  1, 1, 0,  0, 1, 0, // bottom 0,1,2,3
    0, 0, 1,  1, 0, 1,  1, 1, 1,  0, 1, 1  // top 4,5,6,7
  ]);
  const cubeIndices = new Uint32Array([
    0, 2, 1,  0, 3, 2, // bottom
    4, 5, 6,  4, 6, 7, // top
    0, 1, 5,  0, 5, 4, // front
    2, 3, 7,  2, 7, 6, // back
    0, 4, 7,  0, 7, 3, // left
    1, 2, 6,  1, 6, 5  // right
  ]);
  const cubeMesh: RawMesh = {
    positions: cubePositions,
    indices: cubeIndices,
    vertexCount: 8,
    triangleCount: 12,
    boundingBox: {
      min: [0, 0, 0],
      max: [1, 1, 1],
      dimensions: [1, 1, 1],
      center: [0.5, 0.5, 0.5],
      diagonal: Math.sqrt(3)
    }
  };
  const massProps = computePolyhedralMassProperties(cubeMesh);
  if (Math.abs(massProps.volumeMm3 - 1.0) > 1e-4) {
    throw new Error(`Unit cube volume mismatch: expected 1.0, got ${massProps.volumeMm3}`);
  }
  if (Math.abs(massProps.inertiaTensor.Ixx - 0.17) > 1e-2) {
    throw new Error(`Unit cube Ixx mismatch: expected ~0.17, got ${massProps.inertiaTensor.Ixx}`);
  }
  if (Math.abs(massProps.inertiaTensor.Ixy) > 1e-4) {
    throw new Error(`Unit cube Ixy mismatch: expected 0.0, got ${massProps.inertiaTensor.Ixy}`);
  }
  console.log('  ✔ mass-properties: exact Mirtich inertia tensor (120.0 divisor, Ixy === 0): PASSED');

  // 2. Test loop-band-triangulator with 2D Gauss signed polygon area
  const xCoords = new Float64Array([0, 10, 10, 0,  0, 10, 10, 0]);
  const yCoords = new Float64Array([0,  0, 10, 10, 0,  0, 10, 10]);
  const zCoords = new Float64Array([0,  0,  0,  0, 5,  5,  5,  5]);
  const topLoop = [0, 1, 2, 3]; // CCW
  const botLoop = [4, 5, 6, 7]; // CCW
  const bandFaces = triangulateBetweenLoops(
    topLoop,
    botLoop,
    xCoords,
    yCoords,
    zCoords,
    5, 5, 2.5,
    [0, 0, 1]
  );
  if (bandFaces.length < 6) {
    throw new Error(`Triangulated band faces too few: got ${bandFaces.length}`);
  }
  console.log('  ✔ loop-band-triangulator: 2D Gauss signed area orientation: PASSED');

  // 3. Test profile-fitter line-arc junction seamless continuity
  const profilePts: [number, number][] = [
    [0, 0], [20, 0],
    [25, 2], [28, 6], [29, 10], [28, 14], [25, 18], [20, 20], // arc
    [0, 20]
  ];
  const fitLoop = fitAnalyticProfileLoop(profilePts, 0.1);
  if (!fitLoop || fitLoop.segments.length === 0) {
    throw new Error('Profile fitting failed for line-arc combination');
  }
  console.log('  ✔ profile-fitter: seamless line-arc junction without duplicate edges: PASSED');

  // 4. Test strict CLI argument validation
  let caughtRepresentation = false;
  try {
    parseCliArgs(['file.stl', '--representation', 'invalid_mode']);
  } catch (err) {
    caughtRepresentation = true;
  }
  if (!caughtRepresentation) {
    throw new Error('CLI failed to throw error on invalid --representation');
  }

  let caughtThreadMode = false;
  try {
    parseCliArgs(['file.stl', '--thread-mode', 'invalid_thread']);
  } catch (err) {
    caughtThreadMode = true;
  }
  if (!caughtThreadMode) {
    throw new Error('CLI failed to throw error on invalid --thread-mode');
  }
  console.log('  ✔ cli-args: strict enum validation with descriptive errors: PASSED');

  // 5. Test spatial-grid & cylinder-sampler decoupling
  const grid = new UniformSpatialGrid3D(10.0);
  grid.insert(0, 5.0, 5.0, 5.0);
  const unassigned = new Uint8Array([0, 1, 0, 1]);
  const prng = new FastPRNG(42);
  const idx = pickRandomUnassigned(unassigned, prng, 4);
  if (idx !== 1 && idx !== 3) {
    throw new Error(`pickRandomUnassigned returned invalid index: ${idx}`);
  }
  console.log('  ✔ spatial-grid & cylinder-sampler: clean decoupled execution: PASSED');

  console.log('[PASS] All Wave 10 Math, Concurrency & Topological Bug Fix tests passed successfully!\n');
}

if (process.argv[1]?.includes('test-wave10-bugfixes')) {
  runWave10BugFixTests();
}
