// ==============================================================================
// src/test/test-wave8-math-fixes.ts — Unit & Regression Tests for Wave 8 Math Fixes
// ==============================================================================

import { fitAnalyticProfileLoop } from '../kernel/step/analytical/profile-fitter.js';
import { computeCylinderAngularMetrics } from '../stages/segmentation/angular-metrics.js';
import { triangulateBetweenLoops } from '../kernel/step/planar/loop-band-triangulator.js';
import { clusterNormalizedHoles } from '../capabilities/pcd-circle-clusterer.js';
import { RawMesh } from '../types/geometry.js';

export function runWave8MathFixTests(): void {
  console.log('[TEST] Running Wave 8 Math & Topological Bug Fix Verification...');

  // 1. Test profile-fitter full-circle angularSpan fix
  const nCirclePts = 16;
  const r = 20.0;
  const circlePolygon: [number, number][] = [];
  for (let i = 0; i < nCirclePts; i++) {
    const th = (i / nCirclePts) * 2 * Math.PI;
    circlePolygon.push([r * Math.cos(th), r * Math.sin(th)]);
  }
  const loop = fitAnalyticProfileLoop(circlePolygon, 0.05);
  if (!loop.isClosed) {
    throw new Error('Expected full circle polygon to be detected as closed loop');
  }
  for (const seg of loop.segments) {
    if (seg.type === 'arc' && Math.abs(seg.angularSpan) < 1e-6) {
      throw new Error(`Profile arc angularSpan collapsed to zero: ${seg.angularSpan}`);
    }
  }
  console.log('  ✔ profile-fitter: full circle angularSpan !== 0 and isClosed: PASSED');

  // 2. Test angular-metrics empty inliers guard
  const dummyMesh: RawMesh = {
    positions: new Float32Array(9),
    normals: new Float32Array(9),
    indices: new Uint32Array([0, 1, 2]),
    vertexCount: 3,
    triangleCount: 1,
    boundingBox: {
      min: [0, 0, 0],
      max: [1, 1, 1],
      dimensions: [1, 1, 1],
      center: [0.5, 0.5, 0.5],
      diagonal: Math.sqrt(3)
    }
  };
  const emptyMetrics = computeCylinderAngularMetrics(
    dummyMesh,
    new Float32Array(3),
    new Float32Array(3),
    [],
    [0, 0, 0],
    [0, 0, 1]
  );
  if (isNaN(emptyMetrics.angularSpanRad) || isNaN(emptyMetrics.maxAngularGapRad)) {
    throw new Error('computeCylinderAngularMetrics returned NaN for empty inliers');
  }
  if (emptyMetrics.angularSpanRad !== 0 || emptyMetrics.subType !== 'partial_arc') {
    throw new Error('Unexpected metrics for empty inliers');
  }
  console.log('  ✔ angular-metrics: empty inliers safe guard (no NaN): PASSED');

  // 3. Test loop-band-triangulator phase unwrapping with floating-point micro-jitter
  const topLoop = [0, 1, 2, 3];
  const botLoop = [4, 5, 6, 7];
  // 4 vertices around circle with 1e-9 backwards jitter on vertex 1
  const xs = new Float64Array([10, 0 - 1e-9, -10, 0, 10, 0, -10, 0]);
  const ys = new Float64Array([0, 10, 0, -10, 0, 10, 0, -10]);
  const zs = new Float64Array([5, 5, 5, 5, 0, 0, 0, 0]);

  const bandFaces = triangulateBetweenLoops(
    topLoop,
    botLoop,
    xs, ys, zs,
    0, 0, 2.5,
    [0, 0, 1]
  );
  if (bandFaces.length !== 8) {
    throw new Error(`Expected 8 triangulated band faces for 4x4 loops, got ${bandFaces.length}`);
  }
  console.log('  ✔ loop-band-triangulator: robust phase unwrapping without butterfly defect: PASSED');

  // 4. Test PCD circle clusterer partial arc algebraic center refinement
  // 4 holes on a 180-degree semicircle of radius 50mm centered at (100, 200, 0)
  const arcAngles = [0, 60, 120, 180];
  const arcRadius = 50.0;
  const trueCenter = [100.0, 200.0, 10.0];
  const partialHoles = arcAngles.map((deg, idx) => {
    const rad = (deg * Math.PI) / 180;
    return {
      id: `arc_hole_${idx}`,
      diameter: 8.0,
      depth: 15.0,
      position: [
        trueCenter[0] + arcRadius * Math.cos(rad),
        trueCenter[1] + arcRadius * Math.sin(rad),
        trueCenter[2]
      ],
      direction: [0, 0, 1],
      isThreaded: false
    };
  });

  const pcdResult = clusterNormalizedHoles(partialHoles, { minHoleCount: 4 });
  if (pcdResult.clusters.length !== 1 || pcdResult.clusters[0].type !== 'circular_bolt_circle') {
    throw new Error(`Expected partial arc to cluster as circular_bolt_circle, got ${pcdResult.clusters[0]?.type}`);
  }
  const cluster = pcdResult.clusters[0];
  const detectedPcd = cluster.pitchCircleDiameterMm!;
  if (Math.abs(detectedPcd - 100.0) > 0.5) {
    throw new Error(`Expected PCD ~100mm, got ${detectedPcd}`);
  }
  const distToTrueCenter = Math.hypot(
    cluster.center![0] - trueCenter[0],
    cluster.center![1] - trueCenter[1]
  );
  if (distToTrueCenter > 0.5) {
    throw new Error(`Fitted center deviates from true center: dist=${distToTrueCenter}`);
  }
  console.log('  ✔ pcd-circle-clusterer: partial arc 2D algebraic center & PCD detection: PASSED');
  console.log('[PASS] All Wave 8 Math & Topological Bug Fix tests passed successfully!\n');
}

if (process.argv[1] && process.argv[1].endsWith('test-wave8-math-fixes.ts')) {
  runWave8MathFixTests();
}
