// ==============================================================================
// src/stages/profiling/fillet-chamfer-classifier.ts — Fillet & Chamfer Classifier
// ==============================================================================

import { RawMesh, SurfacePrimitive, CylinderSurface, PlaneSurface } from '../../types/geometry.js';
import { computeMeshGeometryBuffers } from '../../math/index.js';

export interface CADChamfer {
  id: string;
  widthMm: number;
  angleDeg: number;
  areaMm2: number;
}

export interface CADFillet {
  id: string;
  radiusMm: number;
  lengthMm: number;
  areaMm2: number;
}

export interface BlendSurfacesResult {
  fillets: CADFillet[];
  chamfers: CADChamfer[];
}

/**
 * Classifies transitional blend surfaces: circular arc fillets and 45° planar chamfers.
 */
export function classifyBlendSurfaces(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[]
): BlendSurfacesResult {
  const fillets: CADFillet[] = [];
  let filletCounter = 0;

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    if (s.type === 'cylinder') {
      const c = s as CylinderSurface;
      if (c.subType === 'fillet' || (c.angularSpanRad !== undefined && c.angularSpanRad <= (140 * Math.PI / 180))) {
        fillets.push({
          id: `fillet_${++filletCounter}`,
          radiusMm: parseFloat(c.radius.toFixed(2)),
          lengthMm: parseFloat(c.height.toFixed(2)),
          areaMm2: parseFloat(c.area.toFixed(2))
        });
      }
    }
  }

  const chamfers: CADChamfer[] = [];
  let chamferCounter = 0;

  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const s = surfaces[sIdx];
    if (s.type === 'plane') {
      const p = s as PlaneSurface;
      const absNx = Math.abs(p.normal[0]);
      const absNy = Math.abs(p.normal[1]);
      const absNz = Math.abs(p.normal[2]);
      const sorted = [absNx, absNy, absNz].sort((a, b) => b - a);
      const is45 = Math.abs(sorted[0] - sorted[1]) < 0.20 && sorted[0] > 0.50 && sorted[0] < 0.88;
      if (is45) {
        chamfers.push({
          id: `chamfer_${++chamferCounter}`,
          widthMm: parseFloat((Math.sqrt(Math.max(1, p.area)) * 0.35).toFixed(2)),
          angleDeg: 45.0,
          areaMm2: parseFloat(p.area.toFixed(2))
        });
      }
    }
  }

  // Fallback: If chamfers were not segmented into isolated planes, calculate 45° chamfer facet bands from mesh
  if (chamfers.length === 0) {
    let chamfer45Area = 0;
    const numTris = mesh.triangleCount;
    const { normals, areas } = computeMeshGeometryBuffers(mesh.positions, mesh.indices, numTris);
    for (let t = 0; t < numTris; t++) {
      const t3 = t * 3;
      const nx = Math.abs(normals[t3]), ny = Math.abs(normals[t3 + 1]), nz = Math.abs(normals[t3 + 2]);
      const sorted = [nx, ny, nz].sort((a, b) => b - a);
      if (Math.abs(sorted[0] - sorted[1]) < 0.15 && sorted[0] > 0.55 && sorted[0] < 0.85 && sorted[2] < 0.25) {
        chamfer45Area += areas[t];
      }
    }
    if (chamfer45Area > 10.0) {
      chamfers.push({
        id: `chamfer_perimeter_45`,
        widthMm: 1.0,
        angleDeg: 45.0,
        areaMm2: parseFloat(chamfer45Area.toFixed(2))
      });
    }
  }

  return { fillets, chamfers };
}
