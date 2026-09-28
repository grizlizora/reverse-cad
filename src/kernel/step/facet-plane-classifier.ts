// ==============================================================================
// src/kernel/step/facet-plane-classifier.ts — High-Speed Facet Plane Classifier
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';

export interface FacetPlaneDescriptor {
  cx: number;
  cy: number;
  cz: number;
  snx: number;
  sny: number;
  snz: number;
}

export interface FacetClassificationResult {
  uniquePlanes: FacetPlaneDescriptor[];
  trianglePlaneIndices: Int32Array; // Maps triangle index -> plane index in uniquePlanes (-1 if already mapped)
  unclassifiedTriangles: number[];
}

/**
 * Classifies unassigned mesh triangles into deduplicated facet planes
 * with zero per-triangle string array retention (flat Int32Array mapping).
 */
export function classifyFacetPlanes(
  mesh: RawMesh,
  triangleToSurfaceId: Map<number, string>
): FacetClassificationResult {
  const triCount = mesh.triangleCount;
  const positions = mesh.positions;
  const indices = mesh.indices;

  const trianglePlaneIndices = new Int32Array(triCount).fill(-1);
  const unclassifiedTriangles: number[] = [];
  const uniquePlanes: FacetPlaneDescriptor[] = [];
  const keyToPlaneIdx = new Map<string, number>();

  for (let t = 0; t < triCount; t++) {
    if (triangleToSurfaceId.has(t)) continue;

    const t3 = t * 3;
    const i0 = indices[t3] * 3;
    const i1 = indices[t3 + 1] * 3;
    const i2 = indices[t3 + 2] * 3;

    const p0x = positions[i0], p0y = positions[i0 + 1], p0z = positions[i0 + 2];
    const p1x = positions[i1], p1y = positions[i1 + 1], p1z = positions[i1 + 2];
    const p2x = positions[i2], p2y = positions[i2 + 1], p2z = positions[i2 + 2];

    const cx = (p0x + p1x + p2x) / 3.0;
    const cy = (p0y + p1y + p2y) / 3.0;
    const cz = (p0z + p1z + p2z) / 3.0;

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

    let snx = nx, sny = ny, snz = nz;
    if (Math.abs(snx) > 0.9995) { snx = Math.sign(snx); sny = 0; snz = 0; }
    else if (Math.abs(sny) > 0.9995) { snx = 0; sny = Math.sign(sny); snz = 0; }
    else if (Math.abs(snz) > 0.9995) { snx = 0; sny = 0; snz = Math.sign(snz); }

    const dist = snx * cx + sny * cy + snz * cz;

    // High-precision quantization keys (step 100 for normal ~0.5 deg, step 200 for distance 0.005 mm)
    const qnx = Math.round(snx * 100);
    const qny = Math.round(sny * 100);
    const qnz = Math.round(snz * 100);
    const qdist = Math.round(dist * 200);
    const key = `${qnx}_${qny}_${qnz}:${qdist}`;

    let planeIdx = keyToPlaneIdx.get(key);
    if (planeIdx === undefined) {
      planeIdx = uniquePlanes.length;
      keyToPlaneIdx.set(key, planeIdx);
      uniquePlanes.push({ cx, cy, cz, snx, sny, snz });
    }

    trianglePlaneIndices[t] = planeIdx;
    unclassifiedTriangles.push(t);
  }

  return {
    uniquePlanes,
    trianglePlaneIndices,
    unclassifiedTriangles
  };
}
