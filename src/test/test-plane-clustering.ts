// ==============================================================================
// src/test/test-plane-clustering.ts — Planar Clustering & Spatial Hash Verification
// ==============================================================================

import {
  computeNormalSpatialHash,
  decodeNormalSpatialHash,
  buildPlaneCandidates,
  PlanarClusterContext
} from '../stages/segmentation/plane-bucket-builder.js';
import { extractPlanesWithThreshold } from '../stages/segmentation/plane-inlier-extractor.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`[AssertionFailed] ${msg}`);
}

export async function runPlaneClusteringTests(): Promise<boolean> {
  console.log('[TEST] Running Planar Clustering & 50-bit Spatial Hash Verification...');

  // 1. Test Bijective 50-bit Spatial Hash & Reversibility
  const testCases = [
    { nx: 0, ny: 0, nz: 1, d: 0 },
    { nx: 1, ny: 0, nz: 0, d: 25.4 },
    { nx: 0, ny: -1, nz: 0, d: -100.8 },
    { nx: 0.707, ny: 0.707, nz: 0, d: 42.6 },
    { nx: -0.577, ny: -0.577, nz: -0.577, d: -350.2 }
  ];

  for (const tc of testCases) {
    const qnx = Math.abs(tc.nx) < 1e-4 ? 0 : Math.round(tc.nx * 20) / 20;
    const qny = Math.abs(tc.ny) < 1e-4 ? 0 : Math.round(tc.ny * 20) / 20;
    const qnz = Math.abs(tc.nz) < 1e-4 ? 0 : Math.round(tc.nz * 20) / 20;
    const qd = Math.round(tc.d * 5) / 5;

    const hash = computeNormalSpatialHash(qnx, qny, qnz, qd);
    assert(Number.isSafeInteger(hash), `Hash ${hash} must be a safe JS integer`);

    const decodedKey = decodeNormalSpatialHash(hash);
    const expectedKey = `${qnx.toFixed(2)},${qny.toFixed(2)},${qnz.toFixed(2)}:${qd.toFixed(2)}`;
    assert(decodedKey === expectedKey, `Decoded key '${decodedKey}' must match expected '${expectedKey}'`);
  }
  console.log('  ✔ Bijective 50-bit normal spatial hash & reversibility: PASSED');

  // 2. Synthesize PlanarClusterContext with two distinct orthogonal planes
  // Plane A: Normal (0, 0, 1) at Z = 10, 100 triangles, Area = 100
  // Plane B: Normal (1, 0, 0) at X = 50, 50 triangles, Area = 50
  const numTrisA = 100;
  const numTrisB = 50;
  const totalTriangles = numTrisA + numTrisB;

  const normals = new Float32Array(totalTriangles * 3);
  const centroids = new Float32Array(totalTriangles * 3);
  const areas = new Float32Array(totalTriangles);
  const unassigned = new Uint8Array(totalTriangles);
  unassigned.fill(1);

  // Plane A
  for (let i = 0; i < numTrisA; i++) {
    const t3 = i * 3;
    normals[t3] = 0; normals[t3 + 1] = 0; normals[t3 + 2] = 1;
    centroids[t3] = (i % 10) * 2;
    centroids[t3 + 1] = Math.floor(i / 10) * 2;
    centroids[t3 + 2] = 10.0;
    areas[i] = 1.0;
  }

  // Plane B
  for (let i = 0; i < numTrisB; i++) {
    const idx = numTrisA + i;
    const t3 = idx * 3;
    normals[t3] = 1; normals[t3 + 1] = 0; normals[t3 + 2] = 0;
    centroids[t3] = 50.0;
    centroids[t3 + 1] = (i % 10) * 2;
    centroids[t3 + 2] = Math.floor(i / 10) * 2;
    areas[idx] = 1.0;
  }

  const ctx: PlanarClusterContext = {
    normals,
    centroids,
    areas,
    totalTriangles,
    totalMeshArea: 150.0,
    distTol: 0.05,
    cosAngleTol: Math.cos((5 * Math.PI) / 180),
    unassigned
  };

  // 3. Test buildPlaneCandidates
  const candidates = buildPlaneCandidates(ctx);
  assert(candidates.length === 2, `Expected 2 candidate planes, got ${candidates.length}`);
  assert(candidates[0].area >= candidates[1].area, 'Candidates must be sorted by descending area');
  assert(candidates[0].tris.length === numTrisA, `Candidate 0 must have ${numTrisA} triangles`);
  assert(candidates[1].tris.length === numTrisB, `Candidate 1 must have ${numTrisB} triangles`);
  console.log('  ✔ buildPlaneCandidates: accurately grouped 150 triangles into 2 sorted buckets: PASSED');

  // 4. Test extractPlanesWithThreshold
  let idCounter = 1;
  const idGen = () => `plane_${idCounter++}`;
  const extraction = extractPlanesWithThreshold(candidates, ctx, 10.0, idGen);

  assert(extraction.planes.length === 2, `Expected 2 extracted planes, got ${extraction.planes.length}`);
  assert(extraction.inliersExtracted === 150, `Expected 150 inliers extracted, got ${extraction.inliersExtracted}`);

  // Verify Plane 1 (Plane A)
  const plane1 = extraction.planes[0];
  assert(Math.abs(plane1.normal[2] - 1.0) < 1e-4, 'Plane 1 normal must be +Z');
  assert(Math.abs(plane1.origin[2] - 10.0) < 1e-4, 'Plane 1 Z-origin must be ~10.0');
  assert(plane1.area === 100.0, `Plane 1 area must be 100, got ${plane1.area}`);

  // Verify Plane 2 (Plane B)
  const plane2 = extraction.planes[1];
  assert(Math.abs(plane2.normal[0] - 1.0) < 1e-4, 'Plane 2 normal must be +X');
  assert(Math.abs(plane2.origin[0] - 50.0) < 1e-4, 'Plane 2 X-origin must be ~50.0');
  assert(plane2.area === 50.0, `Plane 2 area must be 50, got ${plane2.area}`);

  // Verify unassigned mask
  let remainingUnassigned = 0;
  for (let t = 0; t < totalTriangles; t++) {
    if (unassigned[t] === 1) remainingUnassigned++;
  }
  assert(remainingUnassigned === 0, 'All triangles should be assigned to planes');
  console.log('  ✔ extractPlanesWithThreshold: inlier extraction, plane parameters & mask: PASSED');

  console.log('[PASS] All Phase 2 Planar Clustering tests completed successfully.\n');
  return true;
}

const isDirect = process.argv[1] && (
  process.argv[1].endsWith('test-plane-clustering.ts') ||
  process.argv[1].endsWith('test-plane-clustering.js')
);

if (isDirect) {
  runPlaneClusteringTests().then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('Planar Clustering test failed:', err);
    process.exit(1);
  });
}
