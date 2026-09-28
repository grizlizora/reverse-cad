// ==============================================================================
// src/kernel/step/revolution/revolution-face-synthesizer.ts — Analytical Revolution Face Synthesizer
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from '../step-orthonormal-basis.js';
import { RevolutionFeatureZone } from './revolution-zband-analyzer.js';
import { Point3D, Vector3D, RawMesh } from '../../../types/geometry.js';

export interface RevolutionFaceResult {
  faceIds: string[];
  handledTriangles: Set<number>;
}

/**
 * Synthesizes analytical B-Rep faces for cylinders and cones.
 * Splits full 360-degree revolutions into two 180-degree semi-cylinders (u in [0, pi] and [pi, 2*pi]),
 * strictly adhering to ISO 10303-42 to prevent periodic seam collapse and black spot shading defects.
 */
export async function synthesizeRevolutionFaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  zones: RevolutionFeatureZone[],
  mesh?: RawMesh,
  surfaceToStepId?: Map<string, string>
): Promise<RevolutionFaceResult> {
  const faceIds: string[] = [];
  const handledTriangles = new Set<number>();

  if (!zones || zones.length === 0) {
    return { faceIds, handledTriangles };
  }

  let buffer = '';
  const positions = mesh?.positions;
  const indices = mesh?.indices;

  for (let zIdx = 0; zIdx < zones.length; zIdx++) {
    const zone = zones[zIdx];
    if (zone.type !== 'cylinder' || !zone.bands || zone.bands.length === 0) {
      continue;
    }

    const O = zone.axisOrigin;
    const D = zone.axisDirection;
    const lenD = Math.hypot(D[0], D[1], D[2]);
    if (lenD < 1e-6) continue;
    const dirNorm: Vector3D = [D[0] / lenD, D[1] / lenD, D[2] / lenD];

    const basis = computeOrthonormalBasis(dirNorm);
    const Z = basis.dirZ;
    const X = basis.dirX;
    const R = zone.radius;
    if (R <= 1e-4) continue;

    // Check or create CYLINDRICAL_SURFACE
    let cylSurfaceStepId = surfaceToStepId?.get(zone.surfaceId);
    if (!cylSurfaceStepId) {
      const ptOriginId = allocator.nextId();
      buffer += `${ptOriginId} = CARTESIAN_POINT('', (${formatStepFloat(O[0])}, ${formatStepFloat(O[1])}, ${formatStepFloat(O[2])}));\n`;
      const dirZId = allocator.nextId();
      buffer += `${dirZId} = DIRECTION('', (${formatStepFloat(Z[0])}, ${formatStepFloat(Z[1])}, ${formatStepFloat(Z[2])}));\n`;
      const dirXId = allocator.nextId();
      buffer += `${dirXId} = DIRECTION('', (${formatStepFloat(X[0])}, ${formatStepFloat(X[1])}, ${formatStepFloat(X[2])}));\n`;
      const axPlacement = allocator.nextId();
      buffer += `${axPlacement} = AXIS2_PLACEMENT_3D('', ${ptOriginId}, ${dirZId}, ${dirXId});\n`;
      cylSurfaceStepId = allocator.nextId();
      buffer += `${cylSurfaceStepId} = CYLINDRICAL_SURFACE('${zone.surfaceId}', ${axPlacement}, ${formatStepFloat(R)});\n`;
      if (surfaceToStepId) {
        surfaceToStepId.set(zone.surfaceId, cylSurfaceStepId);
      }
    }

    for (let bIdx = 0; bIdx < zone.bands.length; bIdx++) {
      const band = zone.bands[bIdx];
      if (band.isObstacleZone) {
        // Keep inlier triangles for high-fidelity fallback around obstacles
        continue;
      }

      const z0 = band.zMin;
      const z1 = band.zMax;
      const h = z1 - z0;
      if (h < 0.05) continue;

      // Centers of bottom and top circular cross-sections
      const C0: Point3D = [O[0] + z0 * Z[0], O[1] + z0 * Z[1], O[2] + z0 * Z[2]];
      const C1: Point3D = [O[0] + z1 * Z[0], O[1] + z1 * Z[1], O[2] + z1 * Z[2]];

      // 4 boundary seam vertices
      const P00: Point3D = [C0[0] + R * X[0], C0[1] + R * X[1], C0[2] + R * X[2]];
      const PPi0: Point3D = [C0[0] - R * X[0], C0[1] - R * X[1], C0[2] - R * X[2]];
      const P01: Point3D = [C1[0] + R * X[0], C1[1] + R * X[1], C1[2] + R * X[2]];
      const PPi1: Point3D = [C1[0] - R * X[0], C1[1] - R * X[1], C1[2] - R * X[2]];

      const cp00 = allocator.nextId();
      buffer += `${cp00} = CARTESIAN_POINT('', (${formatStepFloat(P00[0])}, ${formatStepFloat(P00[1])}, ${formatStepFloat(P00[2])}));\n`;
      const vp00 = allocator.nextId();
      buffer += `${vp00} = VERTEX_POINT('', ${cp00});\n`;

      const cpPi0 = allocator.nextId();
      buffer += `${cpPi0} = CARTESIAN_POINT('', (${formatStepFloat(PPi0[0])}, ${formatStepFloat(PPi0[1])}, ${formatStepFloat(PPi0[2])}));\n`;
      const vpPi0 = allocator.nextId();
      buffer += `${vpPi0} = VERTEX_POINT('', ${cpPi0});\n`;

      const cp01 = allocator.nextId();
      buffer += `${cp01} = CARTESIAN_POINT('', (${formatStepFloat(P01[0])}, ${formatStepFloat(P01[1])}, ${formatStepFloat(P01[2])}));\n`;
      const vp01 = allocator.nextId();
      buffer += `${vp01} = VERTEX_POINT('', ${cp01});\n`;

      const cpPi1 = allocator.nextId();
      buffer += `${cpPi1} = CARTESIAN_POINT('', (${formatStepFloat(PPi1[0])}, ${formatStepFloat(PPi1[1])}, ${formatStepFloat(PPi1[2])}));\n`;
      const vpPi1 = allocator.nextId();
      buffer += `${vpPi1} = VERTEX_POINT('', ${cpPi1});\n`;

      // Directions
      const dirZ = allocator.nextId();
      buffer += `${dirZ} = DIRECTION('', (${formatStepFloat(Z[0])}, ${formatStepFloat(Z[1])}, ${formatStepFloat(Z[2])}));\n`;
      const dirX = allocator.nextId();
      buffer += `${dirX} = DIRECTION('', (${formatStepFloat(X[0])}, ${formatStepFloat(X[1])}, ${formatStepFloat(X[2])}));\n`;
      const dirNegX = allocator.nextId();
      buffer += `${dirNegX} = DIRECTION('', (${formatStepFloat(-X[0])}, ${formatStepFloat(-X[1])}, ${formatStepFloat(-X[2])}));\n`;

      // Bottom semi-circles
      const cpC0 = allocator.nextId();
      buffer += `${cpC0} = CARTESIAN_POINT('', (${formatStepFloat(C0[0])}, ${formatStepFloat(C0[1])}, ${formatStepFloat(C0[2])}));\n`;
      const axBot1 = allocator.nextId();
      buffer += `${axBot1} = AXIS2_PLACEMENT_3D('', ${cpC0}, ${dirZ}, ${dirX});\n`;
      const circBot1 = allocator.nextId();
      buffer += `${circBot1} = CIRCLE('', ${axBot1}, ${formatStepFloat(R)});\n`;
      const eBot1 = allocator.nextId();
      buffer += `${eBot1} = EDGE_CURVE('', ${vp00}, ${vpPi0}, ${circBot1}, .T.);\n`;

      const axBot2 = allocator.nextId();
      buffer += `${axBot2} = AXIS2_PLACEMENT_3D('', ${cpC0}, ${dirZ}, ${dirNegX});\n`;
      const circBot2 = allocator.nextId();
      buffer += `${circBot2} = CIRCLE('', ${axBot2}, ${formatStepFloat(R)});\n`;
      const eBot2 = allocator.nextId();
      buffer += `${eBot2} = EDGE_CURVE('', ${vpPi0}, ${vp00}, ${circBot2}, .T.);\n`;

      // Top semi-circles
      const cpC1 = allocator.nextId();
      buffer += `${cpC1} = CARTESIAN_POINT('', (${formatStepFloat(C1[0])}, ${formatStepFloat(C1[1])}, ${formatStepFloat(C1[2])}));\n`;
      const axTop1 = allocator.nextId();
      buffer += `${axTop1} = AXIS2_PLACEMENT_3D('', ${cpC1}, ${dirZ}, ${dirX});\n`;
      const circTop1 = allocator.nextId();
      buffer += `${circTop1} = CIRCLE('', ${axTop1}, ${formatStepFloat(R)});\n`;
      const eTop1 = allocator.nextId();
      buffer += `${eTop1} = EDGE_CURVE('', ${vp01}, ${vpPi1}, ${circTop1}, .T.);\n`;

      const axTop2 = allocator.nextId();
      buffer += `${axTop2} = AXIS2_PLACEMENT_3D('', ${cpC1}, ${dirZ}, ${dirNegX});\n`;
      const circTop2 = allocator.nextId();
      buffer += `${circTop2} = CIRCLE('', ${axTop2}, ${formatStepFloat(R)});\n`;
      const eTop2 = allocator.nextId();
      buffer += `${eTop2} = EDGE_CURVE('', ${vpPi1}, ${vp01}, ${circTop2}, .T.);\n`;

      // Seam Lines along Z
      const vecZ = allocator.nextId();
      buffer += `${vecZ} = VECTOR('', ${dirZ}, 1.);\n`;
      const line1 = allocator.nextId();
      buffer += `${line1} = LINE('', ${cp00}, ${vecZ});\n`;
      const eSeam1 = allocator.nextId();
      buffer += `${eSeam1} = EDGE_CURVE('', ${vp00}, ${vp01}, ${line1}, .T.);\n`;

      const line2 = allocator.nextId();
      buffer += `${line2} = LINE('', ${cpPi0}, ${vecZ});\n`;
      const eSeam2 = allocator.nextId();
      buffer += `${eSeam2} = EDGE_CURVE('', ${vpPi0}, ${vpPi1}, ${line2}, .T.);\n`;

      // Semi-Cylinder Face 1 (u in [0, pi])
      const oeBot1 = allocator.nextId();
      buffer += `${oeBot1} = ORIENTED_EDGE('', *, *, ${eBot1}, .T.);\n`;
      const oeSeam2_1 = allocator.nextId();
      buffer += `${oeSeam2_1} = ORIENTED_EDGE('', *, *, ${eSeam2}, .T.);\n`;
      const oeTop1 = allocator.nextId();
      buffer += `${oeTop1} = ORIENTED_EDGE('', *, *, ${eTop1}, .F.);\n`;
      const oeSeam1_1 = allocator.nextId();
      buffer += `${oeSeam1_1} = ORIENTED_EDGE('', *, *, ${eSeam1}, .F.);\n`;

      const loop1 = allocator.nextId();
      buffer += `${loop1} = EDGE_LOOP('', (${oeBot1}, ${oeSeam2_1}, ${oeTop1}, ${oeSeam1_1}));\n`;
      const bound1 = allocator.nextId();
      buffer += `${bound1} = FACE_OUTER_BOUND('', ${loop1}, .T.);\n`;
      const face1 = allocator.nextId();
      buffer += `${face1} = ADVANCED_FACE('', (${bound1}), ${cylSurfaceStepId}, .T.);\n`;
      faceIds.push(face1);

      // Semi-Cylinder Face 2 (u in [pi, 2*pi])
      const oeBot2 = allocator.nextId();
      buffer += `${oeBot2} = ORIENTED_EDGE('', *, *, ${eBot2}, .T.);\n`;
      const oeSeam1_2 = allocator.nextId();
      buffer += `${oeSeam1_2} = ORIENTED_EDGE('', *, *, ${eSeam1}, .T.);\n`;
      const oeTop2 = allocator.nextId();
      buffer += `${oeTop2} = ORIENTED_EDGE('', *, *, ${eTop2}, .F.);\n`;
      const oeSeam2_2 = allocator.nextId();
      buffer += `${oeSeam2_2} = ORIENTED_EDGE('', *, *, ${eSeam2}, .F.);\n`;

      const loop2 = allocator.nextId();
      buffer += `${loop2} = EDGE_LOOP('', (${oeBot2}, ${oeSeam1_2}, ${oeTop2}, ${oeSeam2_2}));\n`;
      const bound2 = allocator.nextId();
      buffer += `${bound2} = FACE_OUTER_BOUND('', ${loop2}, .T.);\n`;
      const face2 = allocator.nextId();
      buffer += `${face2} = ADVANCED_FACE('', (${bound2}), ${cylSurfaceStepId}, .T.);\n`;
      faceIds.push(face2);

      // Mark triangles in this band as handled
      if (positions && indices) {
        for (const t of zone.inlierTriangles) {
          const t3 = t * 3;
          let inBand = true;
          for (let j = 0; j < 3; j++) {
            const v = indices[t3 + j];
            const pz = positions[v * 3 + 2];
            if (pz < z0 - 0.1 || pz > z1 + 0.1) {
              inBand = false;
              break;
            }
          }
          if (inBand) {
            handledTriangles.add(t);
          }
        }
      } else {
        for (const t of zone.inlierTriangles) {
          handledTriangles.add(t);
        }
      }
    }
  }

  if (buffer.length > 0) {
    await writer.writeBlock(buffer);
  }

  return {
    faceIds,
    handledTriangles
  };
}
