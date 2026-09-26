// ==============================================================================
// src/stages/profiling/loop-mesh-tracer.ts — Fast Topological Boundary Loop Extraction
// ==============================================================================

import { Point3D, Vector3D } from '../../types/geometry.js';

export interface PlanarBoundaryLoop {
  vertexIndices: number[];
  center: Point3D;
  minRadius: number;
  maxRadius: number;
  averageRadius: number;
  roundness: number;
}

/**
 * Encodes an oriented edge (u -> v) into a 64-bit integer key without string allocations.
 */
function encodeEdge(u: number, v: number): bigint {
  return (BigInt(u) << 32n) | (BigInt(v) & 0xFFFFFFFFn);
}

/**
 * Traces oriented boundary loops from inlier triangle indices on a plane surface.
 */
export function tracePlanarLoops(
  inlierIndices: number[],
  indices: Uint32Array,
  positions: Float32Array,
  planeNormal: Vector3D,
  minVerticesInLoop = 12
): PlanarBoundaryLoop[] {
  const edgeCounts = new Map<bigint, number>();

  for (let i = 0; i < inlierIndices.length; i++) {
    const t3 = inlierIndices[i] * 3;
    const i0 = indices[t3], i1 = indices[t3 + 1], i2 = indices[t3 + 2];

    const k01 = encodeEdge(i0, i1);
    const k12 = encodeEdge(i1, i2);
    const k20 = encodeEdge(i2, i0);

    edgeCounts.set(k01, (edgeCounts.get(k01) || 0) + 1);
    edgeCounts.set(k12, (edgeCounts.get(k12) || 0) + 1);
    edgeCounts.set(k20, (edgeCounts.get(k20) || 0) + 1);
  }

  // Find boundary edges: edges that appear in only one orientation and do not have an opposite mate
  const nextEdge = new Map<number, number>();
  for (const [key, count] of edgeCounts) {
    if (count !== 1) continue;
    const u = Number(key >> 32n);
    const v = Number(key & 0xFFFFFFFFn);
    const reverseKey = encodeEdge(v, u);
    if (!edgeCounts.has(reverseKey)) {
      nextEdge.set(u, v);
    }
  }

  const visited = new Set<number>();
  const loops: PlanarBoundaryLoop[] = [];
  const [nx, ny, nz] = planeNormal;

  for (const startA of nextEdge.keys()) {
    if (visited.has(startA)) continue;

    const loop: number[] = [];
    let curr: number | undefined = startA;

    while (curr !== undefined && !visited.has(curr)) {
      visited.add(curr);
      loop.push(curr);
      curr = nextEdge.get(curr);
      if (curr === startA) break;
    }

    if (loop.length < minVerticesInLoop) continue;

    // Centroid
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < loop.length; k++) {
      const vi = loop[k];
      cx += positions[3 * vi];
      cy += positions[3 * vi + 1];
      cz += positions[3 * vi + 2];
    }
    cx /= loop.length;
    cy /= loop.length;
    cz /= loop.length;

    // Radial distances projected onto the plane
    let minR = Infinity, maxR = -Infinity, sumR = 0;
    for (let k = 0; k < loop.length; k++) {
      const vi = loop[k];
      const dx = positions[3 * vi] - cx;
      const dy = positions[3 * vi + 1] - cy;
      const dz = positions[3 * vi + 2] - cz;

      const pDot = dx * nx + dy * ny + dz * nz;
      const rx = dx - pDot * nx, ry = dy - pDot * ny, rz = dz - pDot * nz;
      const r = Math.sqrt(rx * rx + ry * ry + rz * rz);
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
      sumR += r;
    }

    if (maxR <= 1e-6) continue;
    const avgR = sumR / loop.length;
    const roundness = minR / maxR;

    loops.push({
      vertexIndices: loop,
      center: [cx, cy, cz],
      minRadius: minR,
      maxRadius: maxR,
      averageRadius: avgR,
      roundness
    });
  }

  return loops;
}
