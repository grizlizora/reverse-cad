// ==============================================================================
// scripts/check_dihedrals.ts — Pure TypeScript Dihedral Angle Analyzer
// ==============================================================================

import { readSTL } from '../src/stages/stage1-read.js';
import { buildMeshCSR } from '../src/stages/decimation/mesh-csr.js';

async function main() {
  const stlPath = process.argv[2] || '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  console.log(`Reading STL mesh from ${stlPath}...`);
  const mesh = await readSTL(stlPath, { deduplicateVertices: true });
  console.log(`Building CSR mesh incidence for ${mesh.triangleCount} facets...`);
  const csr = buildMeshCSR(mesh);

  const pos = mesh.positions;
  const idx = mesh.indices;
  const { faceNormals, edgeToFaces } = csr;

  const dotFlank: number[] = [];
  const dotCrest: number[] = [];

  for (const faces of edgeToFaces.values()) {
    if (faces.length !== 2) continue;

    const f0 = faces[0];
    const f1 = faces[1];

    // Compute centroid of face 0
    const i0 = idx[f0 * 3] * 3;
    const i1 = idx[f0 * 3 + 1] * 3;
    const i2 = idx[f0 * 3 + 2] * 3;

    const cx = (pos[i0] + pos[i1] + pos[i2]) / 3.0;
    const cy = (pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1]) / 3.0;
    const cz = (pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / 3.0;

    // Inside M16 thread zone
    if (cx >= 5 && cx <= 23 && cy >= 6 && cy <= 26 && cz < 20.8) {
      const n0x = faceNormals[f0 * 3];
      const n0y = faceNormals[f0 * 3 + 1];
      const n0z = faceNormals[f0 * 3 + 2];

      const n1x = faceNormals[f1 * 3];
      const n1y = faceNormals[f1 * 3 + 1];
      const n1z = faceNormals[f1 * 3 + 2];

      const dot = n0x * n1x + n0y * n1y + n0z * n1z;
      if (dot < 0.8) {
        dotCrest.push(dot);
      } else {
        dotFlank.push(dot);
      }
    }
  }

  const stats = (arr: number[]) => {
    if (arr.length === 0) return { count: 0, mean: 0, min: 0, max: 0 };
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { count: arr.length, mean: +mean.toFixed(4), min: +min.toFixed(4), max: +max.toFixed(4) };
  };

  const flankStats = stats(dotFlank);
  const crestStats = stats(dotCrest);

  console.log(`Flank dots count: ${flankStats.count} mean: ${flankStats.mean} min: ${flankStats.min} max: ${flankStats.max}`);
  console.log(`Crest dots count: ${crestStats.count} mean: ${crestStats.mean} min: ${crestStats.min} max: ${crestStats.max}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
