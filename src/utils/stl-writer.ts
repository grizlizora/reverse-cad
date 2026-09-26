// ==============================================================================
// src/utils/stl-writer.ts — Robust Binary STL Serializer
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import * as fs from 'fs';

/**
 * Serializes a RawMesh into standard binary STL file format.
 */
export async function writeMeshToBinaryStl(mesh: RawMesh, targetPath: string): Promise<void> {
  const triangleCount = mesh.triangleCount;
  const header = Buffer.alloc(80, 'Antigravity CAD Benchmark Binary STL Export');
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32LE(triangleCount, 0);

  const triBuf = Buffer.alloc(triangleCount * 50);
  let offset = 0;

  const positions = mesh.positions;
  const indices = mesh.indices;

  for (let t = 0; t < triangleCount; t++) {
    const t3 = t * 3;
    const i0 = indices[t3] * 3;
    const i1 = indices[t3 + 1] * 3;
    const i2 = indices[t3 + 2] * 3;

    const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
    const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
    const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];

    // Compute exact face normal
    const e1x = p1x - p0x, e1y = p1y - p0y, e1z = p1z - p0z;
    const e2x = p2x - p0x, e2y = p2y - p0y, e2z = p2z - p0z;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) {
      nx /= len; ny /= len; nz /= len;
    } else {
      nx = 0; ny = 0; nz = 1;
    }

    triBuf.writeFloatLE(nx, offset);
    triBuf.writeFloatLE(ny, offset + 4);
    triBuf.writeFloatLE(nz, offset + 8);
    offset += 12;

    // Vertex 0
    triBuf.writeFloatLE(p0x, offset);
    triBuf.writeFloatLE(p0y, offset + 4);
    triBuf.writeFloatLE(p0z, offset + 8);
    offset += 12;

    // Vertex 1
    triBuf.writeFloatLE(p1x, offset);
    triBuf.writeFloatLE(p1y, offset + 4);
    triBuf.writeFloatLE(p1z, offset + 8);
    offset += 12;

    // Vertex 2
    triBuf.writeFloatLE(p2x, offset);
    triBuf.writeFloatLE(p2y, offset + 4);
    triBuf.writeFloatLE(p2z, offset + 8);
    offset += 12;

    // Attribute byte count (uint16 = 0)
    triBuf.writeUInt16LE(0, offset);
    offset += 2;
  }

  const fd = await fs.promises.open(targetPath, 'w');
  try {
    await fd.write(header);
    await fd.write(countBuf);
    await fd.write(triBuf);
  } finally {
    await fd.close();
  }
}
