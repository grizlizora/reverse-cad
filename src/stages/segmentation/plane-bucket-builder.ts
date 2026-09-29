// ==============================================================================
// src/stages/segmentation/plane-bucket-builder.ts — High-Performance Plane Bucketing
// ==============================================================================
// Bijective 50-bit normal spatial hashing (Zero-GC, no string keys in hot loops)
// ==============================================================================

export interface PlanarClusterContext {
  normals: Float32Array;
  centroids: Float32Array;
  areas: Float32Array;
  totalTriangles: number;
  totalMeshArea: number;
  distTol: number;
  cosAngleTol: number;
  unassigned: Uint8Array;
}

export interface CandidatePlane {
  key: string;
  tris: number[];
  area: number;
}

/**
 * Computes a bijective 50-bit integer hash for (snappedNormal, discretizedDistance).
 * Fits into JS 53-bit safe integer without heap allocation or string interning.
 */
export function computeNormalSpatialHash(
  qnx: number,
  qny: number,
  qnz: number,
  qd: number
): number {
  const inX = Math.round(qnx * 20) + 20;
  const inY = Math.round(qny * 20) + 20;
  const inZ = Math.round(qnz * 20) + 20;
  const inD = Math.round(qd * 5);
  const normalHash = (inX * 4096) + (inY * 64) + inZ;
  return normalHash * 4294967296 + (inD >>> 0);
}

/**
 * Decodes a 50-bit spatial hash back into a canonical plane key string.
 */
export function decodeNormalSpatialHash(key: number): string {
  const normalHash = Math.floor(key / 4294967296);
  const inZ = normalHash & 63;
  const inY = (normalHash >> 6) & 63;
  const inX = (normalHash >> 12) & 63;
  const inD = ((key % 4294967296) | 0);

  const qnx = (inX - 20) / 20;
  const qny = (inY - 20) / 20;
  const qnz = (inZ - 20) / 20;
  const qd = inD / 5;

  return `${qnx.toFixed(2)},${qny.toFixed(2)},${qnz.toFixed(2)}:${qd.toFixed(2)}`;
}

/**
 * Builds candidate planar buckets via O(N) normal + offset discretization.
 * Uses 50-bit numeric hashing to eliminate all string allocations in the hot loop.
 */
export function buildPlaneCandidates(ctx: PlanarClusterContext): CandidatePlane[] {
  const { normals, centroids, areas, totalTriangles, totalMeshArea } = ctx;
  const planeBuckets = new Map<number, number[]>();

  for (let t = 0; t < totalTriangles; t++) {
    const t3 = t * 3;
    let nx = normals[t3], ny = normals[t3 + 1], nz = normals[t3 + 2];
    const cx = centroids[t3], cy = centroids[t3 + 1], cz = centroids[t3 + 2];

    // Canonical orthogonal snapping (within ~3.6 deg)
    if (Math.abs(nx) > 0.998) { nx = Math.sign(nx); ny = 0; nz = 0; }
    else if (Math.abs(ny) > 0.998) { nx = 0; ny = Math.sign(ny); nz = 0; }
    else if (Math.abs(nz) > 0.998) { nx = 0; ny = 0; nz = Math.sign(nz); }

    const dist = nx * cx + ny * cy + nz * cz;
    const qnx = Math.abs(nx) < 1e-4 ? 0 : Math.round(nx * 20) / 20;
    const qny = Math.abs(ny) < 1e-4 ? 0 : Math.round(ny * 20) / 20;
    const qnz = Math.abs(nz) < 1e-4 ? 0 : Math.round(nz * 20) / 20;
    const qd = Math.round(dist * 5) / 5;

    const numKey = computeNormalSpatialHash(qnx, qny, qnz, qd);

    let list = planeBuckets.get(numKey);
    if (!list) {
      list = [];
      planeBuckets.set(numKey, list);
    }
    list.push(t);
  }

  const minPlaneArea = Math.min(2.0, Math.max(0.05, totalMeshArea * 0.0001));
  const candidatePlanes: CandidatePlane[] = [];

  for (const [numKey, tris] of planeBuckets.entries()) {
    let bucketArea = 0;
    for (let i = 0; i < tris.length; i++) bucketArea += areas[tris[i]];
    if (bucketArea >= minPlaneArea) {
      candidatePlanes.push({
        key: decodeNormalSpatialHash(numKey),
        tris,
        area: bucketArea
      });
    }
  }

  candidatePlanes.sort((a, b) => b.area - a.area);
  return candidatePlanes;
}
