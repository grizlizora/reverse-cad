// ==============================================================================
// src/test/test-stitch-holes.ts — Phase 4 Planar Topology & Through-Hole Stitcher Tests
// ==============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  computeSignedArea2D,
  isPolygonSimple2D,
  isPointInPolygon2D,
  isLoopContainedInOuter2D,
  assignHolesToEnclosingOuters
} from '../kernel/geometry/index.js';
import {
  clusterCoplanarTriangles,
  identifyAndAbsorbThroughHoles
} from '../kernel/step/planar/index.js';
import { TopologyEdgeIndexer } from '../kernel/step/topology-edge-indexer.js';
import { generatePrismaticM6Model } from '../rsvs/procedural-benchmarks.js';
import { segmentSurfaces } from '../stages/stage4-segmentation.js';
import { profileFeatures } from '../stages/stage5-profiling.js';
import { sanitizeTopology } from '../stages/stage3-sanitize.js';
import { exportBRepStep } from '../stages/stage6-brep-step.js';
import { StepBrepValidator } from '../kernel/step/step-brep-validator.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function runStitchHolesTests(): Promise<void> {
  console.log('[TEST] Running Phase 4 Planar Topology & Hole Stitching tests...');

  // 1. Test Non-Convex C-Shaped Hole Containment (where arithmetic centroid lies OUTSIDE the hole!)
  // Outer plate: [0,0] -> [20,0] -> [20,20] -> [0,20]
  const outerPlate: [number, number][] = [
    [0, 0], [20, 0], [20, 20], [0, 20]
  ];
  // C-shaped slot inside outerPlate, wrapping around (10, 10)
  const cHole: [number, number][] = [
    [2, 2], [18, 2], [18, 5], [5, 5], [5, 15], [18, 15], [18, 18], [2, 18]
  ];
  assert(isPolygonSimple2D(cHole) === true, 'Expected C-shaped hole to be simple Jordan curve');

  // Verify that arithmetic centroid of cHole actually lies OUTSIDE cHole (in the middle of the C-bay)
  let cx = 0, cy = 0;
  for (const [x, y] of cHole) { cx += x; cy += y; }
  cx /= cHole.length; cy /= cHole.length;
  assert(isPointInPolygon2D(cx, cy, cHole) === false, 'Expected C-hole centroid to lie outside C-hole itself');
  // Yet our boundary-point containment predicate succeeds!
  assert(isLoopContainedInOuter2D(cHole, outerPlate) === true, 'Expected C-hole to be contained in outerPlate');
  console.log('  ✔ Non-Convex C-Shaped Hole Containment (Edge-Midpoint Predicate): PASSED');

  // 2. Test Containment Forest DAG for Nested Islands (O1 -> H1 -> O2 -> H2)
  const makeSquare = (halfSize: number, ccw: boolean): [number, number][] => {
    const pts: [number, number][] = [
      [-halfSize, -halfSize],
      [halfSize, -halfSize],
      [halfSize, halfSize],
      [-halfSize, halfSize]
    ];
    return ccw ? pts : pts.reverse();
  };

  const O1 = { coords2D: makeSquare(50, true), area: computeSignedArea2D(makeSquare(50, true)), id: 'O1' };
  const O2 = { coords2D: makeSquare(20, true), area: computeSignedArea2D(makeSquare(20, true)), id: 'O2' };
  const H1 = { coords2D: makeSquare(30, false), area: computeSignedArea2D(makeSquare(30, false)), id: 'H1' };
  const H2 = { coords2D: makeSquare(5, false), area: computeSignedArea2D(makeSquare(5, false)), id: 'H2' };

  const assignment = assignHolesToEnclosingOuters([O1, O2], [H1, H2]);
  const holesOfO1 = assignment.get(0)!;
  const holesOfO2 = assignment.get(1)!;

  assert(holesOfO1.length === 1 && holesOfO1[0].id === 'H1', `Expected O1 to only own H1, got ${holesOfO1.map(h => h.id)}`);
  assert(holesOfO2.length === 1 && holesOfO2[0].id === 'H2', `Expected O2 to only own H2, got ${holesOfO2.map(h => h.id)}`);
  console.log('  ✔ Containment Forest DAG (Nested Island Hole De-duplication): PASSED');

  // 3. Test Through-Hole Identification & Watertight B-Rep Synthesis on Prismatic_M6
  const rawMesh = generatePrismaticM6Model();
  const san = sanitizeTopology(rawMesh);
  const mesh = san.cleanedMesh;
  const surfaces = segmentSurfaces(mesh);
  const prof = profileFeatures(mesh, surfaces, san.shells);

  const triIndices = Array.from({ length: mesh.triangleCount }, (_, i) => i);
  const edgeIndexer = new TopologyEdgeIndexer(mesh.indices, triIndices);

  const stepVerticesX = new Float64Array(mesh.vertexCount);
  const stepVerticesY = new Float64Array(mesh.vertexCount);
  const stepVerticesZ = new Float64Array(mesh.vertexCount);
  for (let i = 0; i < mesh.vertexCount; i++) {
    stepVerticesX[i] = mesh.positions[i * 3];
    stepVerticesY[i] = mesh.positions[i * 3 + 1];
    stepVerticesZ[i] = mesh.positions[i * 3 + 2];
  }

  const triangleToSurfaceId = new Map<number, string>();
  const triangleSameSense = new Uint8Array(mesh.triangleCount).fill(1);
  for (const s of surfaces) {
    if (s.inlierIndices) {
      for (const t of s.inlierIndices) {
        triangleToSurfaceId.set(t, s.id);
      }
    }
  }

  const clusters = clusterCoplanarTriangles(
    triIndices,
    mesh.indices,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ,
    triangleToSurfaceId,
    triangleSameSense,
    edgeIndexer
  );

  const mergedTris = new Uint8Array(mesh.triangleCount);
  const matchedHoles = identifyAndAbsorbThroughHoles(
    clusters,
    mesh,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ,
    edgeIndexer,
    mergedTris
  );

  assert(matchedHoles.length === 1, `Expected 1 matched through-hole in Prismatic_M6, got ${matchedHoles.length}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stitch-hole-test-'));
  try {
    const stepRes = await exportBRepStep(mesh, surfaces, prof.threads, tmpDir, 'test_m6_stitched', san.shells);
    const validator = new StepBrepValidator();
    const report = validator.validate(stepRes.stepFilePath);
    assert(report.isWatertight === true, `Expected stitched STEP to be watertight, openEdges=${report.openEdgesCount}`);
    assert(report.is2Manifold === true, `Expected stitched STEP to be 2-manifold, nonManifold=${report.nonManifoldEdgesCount}`);
    console.log(`  ✔ Through-Hole Stitching & Watertight B-Rep Validation: PASSED (MatchedHoles=${matchedHoles.length}, Faces=${report.facesCount})`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('\n[PASS] All Phase 4 Planar Topology & Through-Hole Stitching tests completed successfully.');
}

const isMain =
  (import.meta as any).main === true ||
  (process.argv[1] && process.argv[1].includes('test-stitch-holes'));

if (isMain) {
  runStitchHolesTests().catch(err => {
    console.error('[FAIL] Phase 4 test failed:', err);
    process.exit(1);
  });
}
