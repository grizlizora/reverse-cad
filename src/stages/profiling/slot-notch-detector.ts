// ==============================================================================
// src/stages/profiling/slot-notch-detector.ts — Transverse Slot & Notch Profiler
// ==============================================================================

import { RawMesh, MeshShell, Point3D, Vector3D } from '../../types/geometry.js';
import { CADSlot } from '../../types/features.js';

interface SlotCandidateFacet {
  c: Point3D;
  coord: number;
}

/**
 * Detects transverse slots and positioning notches (e.g. angle adjustment notches on rails)
 * using curvature and facet normal clustering along the primary axis of solid shells.
 */
export function detectPositioningSlots(mesh: RawMesh, shells: MeshShell[]): CADSlot[] {
  const detectedSlots: CADSlot[] = [];
  const solidShells = shells.filter(s => !s.isCavity && Math.abs(s.signedVolume) > 10.0);
  let slotCounter = 0;

  for (let s = 0; s < solidShells.length; s++) {
    const sh = solidShells[s];
    const dims = sh.boundingBox.dimensions;
    let longAxis = 0;
    let maxDim = dims[0];
    if (dims[1] > maxDim) {
      maxDim = dims[1];
      longAxis = 1;
    }
    if (dims[2] > maxDim) {
      maxDim = dims[2];
      longAxis = 2;
    }

    // Only inspect elongated parts (length >= 50 mm)
    if (maxDim < 50.0) continue;

    const minCoord = sh.boundingBox.min[longAxis];
    const pos = mesh.positions;
    const idx = mesh.indices;
    const tIndices = sh.triangleIndices;
    if (!tIndices || tIndices.length === 0) continue;

    const candidateFacets: SlotCandidateFacet[] = [];

    for (let k = 0; k < tIndices.length; k++) {
      const t = tIndices[k];
      const i0 = idx[3 * t];
      const i1 = idx[3 * t + 1];
      const i2 = idx[3 * t + 2];

      const x0 = pos[3 * i0], y0 = pos[3 * i0 + 1], z0 = pos[3 * i0 + 2];
      const x1 = pos[3 * i1], y1 = pos[3 * i1 + 1], z1 = pos[3 * i1 + 2];
      const x2 = pos[3 * i2], y2 = pos[3 * i2 + 1], z2 = pos[3 * i2 + 2];

      const cx = (x0 + x1 + x2) / 3;
      const cy = (y0 + y1 + y2) / 3;
      const cz = (z0 + z1 + z2) / 3;

      const c: Point3D = [cx, cy, cz];
      const rel = (c[longAxis] - minCoord) / maxDim;
      // Skip ends (15% to 85% range)
      if (rel <= 0.15 || rel >= 0.85) continue;

      const e1x = x1 - x0, e1y = y1 - y0, e1z = z1 - z0;
      const e2x = x2 - x0, e2y = y2 - y0, e2z = z2 - z0;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len < 1e-6) continue;

      const normComp = longAxis === 0 ? nx / len : longAxis === 1 ? ny / len : nz / len;
      if (Math.abs(normComp) > 0.40) {
        candidateFacets.push({ c, coord: c[longAxis] });
      }
    }

    if (candidateFacets.length < 25) continue;

    candidateFacets.sort((a, b) => a.coord - b.coord);

    const clusters: SlotCandidateFacet[][] = [];
    let curCluster: SlotCandidateFacet[] = [];
    for (let i = 0; i < candidateFacets.length; i++) {
      const f = candidateFacets[i];
      if (curCluster.length === 0 || (f.coord - curCluster[curCluster.length - 1].coord) < 3.5) {
        curCluster.push(f);
      } else {
        clusters.push(curCluster);
        curCluster = [f];
      }
    }
    if (curCluster.length > 0) {
      clusters.push(curCluster);
    }

    // Slots/notches are localized recesses (25 <= facet count <= 800, span <= 15.0 mm)
    const validClusters = clusters.filter(cl => {
      const span = cl[cl.length - 1].coord - cl[0].coord;
      return cl.length >= 25 && cl.length <= 800 && span <= 15.0;
    });

    for (let cIdx = 0; cIdx < validClusters.length; cIdx++) {
      const cl = validClusters[cIdx];
      const avgPos: Point3D = [
        parseFloat((cl.reduce((acc, f) => acc + f.c[0], 0) / cl.length).toFixed(4)),
        parseFloat((cl.reduce((acc, f) => acc + f.c[1], 0) / cl.length).toFixed(4)),
        parseFloat((cl.reduce((acc, f) => acc + f.c[2], 0) / cl.length).toFixed(4))
      ];
      const span = cl[cl.length - 1].coord - cl[0].coord;
      const dir: Vector3D = [
        longAxis === 0 ? 1 : 0,
        longAxis === 1 ? 1 : 0,
        longAxis === 2 ? 1 : 0
      ];

      detectedSlots.push({
        id: `slot_${++slotCounter}`,
        type: 'positioning_notch',
        positionMm: avgPos,
        direction: dir,
        widthMm: parseFloat(span.toFixed(4))
      });
    }
  }

  return detectedSlots;
}
