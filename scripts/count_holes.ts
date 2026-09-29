// ==============================================================================
// scripts/count_holes.ts — Pure TypeScript Thread Hole Triangles Counter
// ==============================================================================

import { readSTL } from '../src/stages/stage1-read.js';

async function main() {
  const stlPath = process.argv[2] || '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  console.log(`Reading STL mesh from ${stlPath}...`);
  const mesh = await readSTL(stlPath, { deduplicateVertices: false });
  console.log(`Total STL facets: ${mesh.triangleCount}`);

  const holes: [string, number, number, number][] = [
    ['M3', 10.0, 49.0, 3.0],
    ['M4', 20.0, 49.0, 4.0],
    ['M5', 30.0, 49.0, 5.0],
    ['M6', 40.0, 49.0, 6.0],
    ['M8', 55.0, 49.0, 8.0],
    ['M10', 72.0, 49.0, 10.0],
    ['M12', 90.0, 49.0, 12.0],
    ['M14', 110.0, 49.0, 14.0],
    ['M16', 13.0, 17.0, 16.0],
    ['M18', 35.0, 17.0, 18.0],
    ['M20', 58.0, 17.0, 20.0],
    ['M22', 83.0, 17.0, 22.0],
    ['M24', 110.0, 17.0, 24.0]
  ];

  const counts: Record<string, number> = {};
  for (const h of holes) counts[h[0]] = 0;

  const pos = mesh.positions;
  const idx = mesh.indices;

  for (let t = 0; t < mesh.triangleCount; t++) {
    const i0 = idx[t * 3] * 3;
    const i1 = idx[t * 3 + 1] * 3;
    const i2 = idx[t * 3 + 2] * 3;

    const cx = (pos[i0] + pos[i1] + pos[i2]) / 3.0;
    const cy = (pos[i0 + 1] + pos[i1 + 1] + pos[i2 + 1]) / 3.0;
    const cz = (pos[i0 + 2] + pos[i1 + 2] + pos[i2 + 2]) / 3.0;

    if (cz > 20.8) continue;

    for (const [name, hx, hy, dia] of holes) {
      const dist = Math.sqrt((cx - hx) ** 2 + (cy - hy) ** 2);
      if (dist <= dia * 0.7) {
        counts[name]++;
        break;
      }
    }
  }

  for (const [name, cnt] of Object.entries(counts)) {
    console.log(`${name}: ${cnt} triangles`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
