// ==============================================================================
// src/test/test-crease-preservation.ts — Crease & Dihedral Angle Decimation Test
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import { decimateMesh, buildMeshCSR } from '../stages/decimation/index.js';
import { computeHausdorffParallel } from '../rsvs/hausdorff-parallel.js';
import { generateChamferCreaseModel } from '../rsvs/procedural-benchmarks.js';

export { generateChamferCreaseModel, generateChamferCreaseModel as generateChamferCreaseBenchmark };

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`[AssertionFailed] ${msg}`);
}

/**
 * Counts edges with dihedral angles matching 90° (dot ≈ 0) and 45° (dot ≈ 0.707).
 */
export function countDihedralCreaseEdges(mesh: RawMesh): { count90: number; count45: number } {
  const csr = buildMeshCSR(mesh);
  let count90 = 0;
  let count45 = 0;

  for (const faces of csr.edgeToFaces.values()) {
    if (faces.length !== 2) continue;
    const f0 = faces[0] * 3;
    const f1 = faces[1] * 3;
    const dot =
      csr.faceNormals[f0] * csr.faceNormals[f1] +
      csr.faceNormals[f0 + 1] * csr.faceNormals[f1 + 1] +
      csr.faceNormals[f0 + 2] * csr.faceNormals[f1 + 2];

    if (Math.abs(dot) <= 0.12) count90++;
    else if (Math.abs(dot - Math.SQRT1_2) <= 0.12) count45++;
  }
  return { count90, count45 };
}

/**
 * Executes crease preservation verification on in-memory mesh.
 */
export async function runCreasePreservationTests(): Promise<boolean> {
  console.log('[TEST] Crease Preservation Decimation Test (In-Memory)...');
  const origMesh = generateChamferCreaseModel();
  const initCounts = countDihedralCreaseEdges(origMesh);
  assert(initCounts.count90 > 0, 'Initial model must have 90° edges');
  assert(initCounts.count45 > 0, 'Initial model must have 45° chamfer edges');

  // Decimate heavily to 20%
  const decimated = decimateMesh(origMesh, {
    targetReductionRatio: 0.20,
    maxTrianglesThreshold: 60,
    featureAngleDeg: 12.0,
    enableCoplanarPrepass: true
  });

  assert(decimated.triangleCount < origMesh.triangleCount, 'Decimation must reduce triangle count');
  const decCounts = countDihedralCreaseEdges(decimated);
  assert(decCounts.count90 > 0, 'Decimated mesh must preserve 90° sharp edges');
  assert(decCounts.count45 > 0, 'Decimated mesh must preserve 45° chamfer edges');

  const hRes = computeHausdorffParallel(decimated, [], 2000, origMesh);
  assert(hRes.hausdorff99Mm <= 0.15, `Hausdorff 99% must be <= 0.15 mm, got: ${hRes.hausdorff99Mm}`);

  console.log(`  ✔ Initial triangles: ${origMesh.triangleCount}, Decimated: ${decimated.triangleCount}`);
  console.log(`  ✔ Preserved 90° edges: ${decCounts.count90}, 45° edges: ${decCounts.count45}`);
  console.log(`  ✔ Hausdorff 99%: ${hRes.hausdorff99Mm.toFixed(4)} mm, Hmax: ${hRes.hausdorffMaxMm.toFixed(4)} mm`);
  console.log('  ✔ Crease Preservation Test PASSED');
  return true;
}

const isDirect = process.argv[1] && (
  process.argv[1].endsWith('test-crease-preservation.ts') ||
  process.argv[1].endsWith('test-crease-preservation.js')
);

if (isDirect) {
  runCreasePreservationTests().then(ok => {
    if (!ok) process.exit(1);
  }).catch(err => {
    console.error('Crease Preservation Test Failed:', err);
    process.exit(1);
  });
}
