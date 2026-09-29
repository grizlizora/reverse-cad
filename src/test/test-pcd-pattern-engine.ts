// ==============================================================================
// src/test/test-pcd-pattern-engine.ts — PCD Pattern Engine & Bolt Circle Tests
// ==============================================================================

import { normalizeHole } from '../capabilities/pcd-hole-normalizer.js';
import {
  clusterNormalizedHoles,
  type PCDClusteringOptions
} from '../capabilities/pcd-circle-clusterer.js';
import { Vector3D } from '../types/geometry.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`[AssertionFailed] ${msg}`);
}

export async function runPcdPatternEngineTests(): Promise<boolean> {
  console.log('[TEST] Running PCD Pattern Engine & Bolt Circle Verification...');

  // 1. Test normalizeHole & unit vector enforcement
  const rawHole = {
    id: 'h1',
    diameter: 6.0,
    depth: 12.0,
    position: [10, 20, 30],
    direction: [0, 0, 5.0] // Non-unit direction
  };
  const norm = normalizeHole(rawHole);
  assert(norm.id === 'h1', 'Hole ID preserved');
  assert(norm.diameter === 6.0, 'Diameter preserved');
  assert(norm.depth === 12.0, 'Depth preserved');
  assert(norm.direction[2] === 1.0, 'Direction normalized to unit length');
  console.log('  ✔ normalizeHole: unit vector normalization & property mapping: PASSED');

  // 2. Synthesize 6-hole Bolt Circle on XY plane (PCD = 100 mm, R = 50 mm)
  const pcdRadius = 50.0;
  const numHoles = 6;
  const testHoles: any[] = [];
  for (let i = 0; i < numHoles; i++) {
    const angleRad = (i * 2 * Math.PI) / numHoles;
    testHoles.push({
      id: `flange_hole_${i}`,
      diameterMm: 8.0,
      depthMm: 20.0,
      axisOrigin: [
        Math.cos(angleRad) * pcdRadius,
        Math.sin(angleRad) * pcdRadius,
        0.0
      ],
      axisDirection: [0, 0, 1]
    });
  }

  // Add 2 stray holes with different parameters (should not cluster into the PCD)
  testHoles.push({
    id: 'stray_1',
    diameterMm: 12.0, // Different diameter
    depthMm: 20.0,
    axisOrigin: [0, 0, 0],
    axisDirection: [0, 0, 1]
  });
  testHoles.push({
    id: 'stray_2',
    diameterMm: 8.0,
    depthMm: 35.0, // Different depth
    axisOrigin: [100, 100, 0],
    axisDirection: [0, 0, 1]
  });

  const { individualHoles, clusters } = clusterNormalizedHoles(testHoles, { minHoleCount: 4 });
  assert(clusters.length === 1, `Expected 1 bolt circle cluster, got ${clusters.length}`);
  const c0 = clusters[0];
  assert(c0.type === 'circular_bolt_circle', `Cluster type must be circular_bolt_circle, got ${c0.type}`);
  assert(c0.count === 6, `Cluster count must be 6, got ${c0.count}`);
  assert(Math.abs((c0.pitchCircleDiameterMm ?? 0) - 100.0) < 0.1, `PCD must be ~100 mm, got ${c0.pitchCircleDiameterMm}`);
  assert(c0.isEquispaced === true, 'Holes must be equispaced');
  assert(Math.abs((c0.angularStepDeg ?? 0) - 60.0) < 0.5, `Angular step must be ~60 deg, got ${c0.angularStepDeg}`);
  assert(individualHoles.length === 2, `Expected 2 unclustered holes, got ${individualHoles.length}`);
  console.log('  ✔ clusterNormalizedHoles: 6-hole PCD flange detection (100mm dia, 60° step): PASSED');

  // 3. Test arbitrary diagonal orientation: [1/sqrt(3), 1/sqrt(3), 1/sqrt(3)]
  const invSqrt3 = 1.0 / Math.sqrt(3.0);
  const diagNormal: Vector3D = [invSqrt3, invSqrt3, invSqrt3];
  const u: Vector3D = [-1.0 / Math.sqrt(2), 1.0 / Math.sqrt(2), 0];
  const w: Vector3D = [-1.0 / Math.sqrt(6), -1.0 / Math.sqrt(6), 2.0 / Math.sqrt(6)];

  const diagHoles: any[] = [];
  const diagR = 30.0;
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const px = Math.cos(angle) * diagR * u[0] + Math.sin(angle) * diagR * w[0];
    const py = Math.cos(angle) * diagR * u[1] + Math.sin(angle) * diagR * w[1];
    const pz = Math.cos(angle) * diagR * u[2] + Math.sin(angle) * diagR * w[2];
    diagHoles.push({
      id: `diag_${i}`,
      diameter: 5.0,
      depth: 10.0,
      position: [px, py, pz],
      direction: diagNormal
    });
  }

  const diagResult = clusterNormalizedHoles(diagHoles, { minHoleCount: 4 });
  assert(diagResult.clusters.length === 1, 'Diagonal 4-hole pattern must be clustered');
  assert(diagResult.clusters[0].type === 'circular_bolt_circle', 'Diagonal pattern must be bolt circle');
  assert(Math.abs((diagResult.clusters[0].pitchCircleDiameterMm ?? 0) - 60.0) < 0.2, 'Diagonal PCD must be ~60 mm');
  assert(diagResult.clusters[0].angularStepDeg === 90.0, 'Angular step must be 90°');
  console.log('  ✔ clusterNormalizedHoles: diagonal 3D plane PCD orientation: PASSED');

  // 4. Test non-circular cluster fallback: linear array of 4 holes
  const linearHoles: any[] = [];
  for (let i = 0; i < 4; i++) {
    linearHoles.push({
      id: `linear_${i}`,
      diameter: 4.0,
      depth: 8.0,
      position: [i * 20.0, 0, 0],
      direction: [0, 0, 1]
    });
  }
  const linearResult = clusterNormalizedHoles(linearHoles, { minHoleCount: 4 });
  assert(linearResult.clusters.length === 1, 'Linear holes should form 1 cluster');
  assert(linearResult.clusters[0].type === 'repeated_hole_cluster', 'Linear holes must fallback to repeated_hole_cluster');
  console.log('  ✔ clusterNormalizedHoles: linear cluster fallback to repeated_hole_cluster: PASSED');

  console.log('[PASS] All Phase 3 PCD Pattern Engine tests completed successfully.\n');
  return true;
}

const isDirect = process.argv[1] && (
  process.argv[1].endsWith('test-pcd-pattern-engine.ts') ||
  process.argv[1].endsWith('test-pcd-pattern-engine.js')
);

if (isDirect) {
  runPcdPatternEngineTests().then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('PCD Pattern Engine test failed:', err);
    process.exit(1);
  });
}
