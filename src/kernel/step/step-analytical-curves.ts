// ==============================================================================
// src/kernel/step/step-analytical-curves.ts — STEP Analytical Curves & Revolution B-Rep
// ==============================================================================

import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, computeOrthonormalBasis } from './step-orthonormal-basis.js';
import { Point3D, Vector3D } from '../../types/geometry.js';

export interface CircleEdgeResult {
  edgeCurveId: string;
  vertexPointId: string;
  pointCoordId: string;
  buffer: string;
}

export interface SeamLineResult {
  edgeCurveId: string;
  buffer: string;
}

export interface RevolutionFaceResult {
  faceId: string;
  buffer: string;
}

/**
 * Creates an ISO 10303-42 CIRCLE and a closed EDGE_CURVE referencing a single VERTEX_POINT.
 */
export function createCircleEdgeCurve(
  allocator: StepIdAllocator,
  center: Point3D,
  axisZ: Vector3D,
  axisX: Vector3D,
  radius: number
): CircleEdgeResult {
  let buffer = '';

  const centerPtId = allocator.nextId();
  buffer += `${centerPtId} = CARTESIAN_POINT('', (${formatStepFloat(center[0])}, ${formatStepFloat(center[1])}, ${formatStepFloat(center[2])}));\n`;

  const dirZId = allocator.nextId();
  buffer += `${dirZId} = DIRECTION('', (${formatStepFloat(axisZ[0])}, ${formatStepFloat(axisZ[1])}, ${formatStepFloat(axisZ[2])}));\n`;

  const dirXId = allocator.nextId();
  buffer += `${dirXId} = DIRECTION('', (${formatStepFloat(axisX[0])}, ${formatStepFloat(axisX[1])}, ${formatStepFloat(axisX[2])}));\n`;

  const axisPlaceId = allocator.nextId();
  buffer += `${axisPlaceId} = AXIS2_PLACEMENT_3D('', ${centerPtId}, ${dirZId}, ${dirXId});\n`;

  const circleId = allocator.nextId();
  buffer += `${circleId} = CIRCLE('', ${axisPlaceId}, ${formatStepFloat(radius)});\n`;

  // Seam vertex point lying on the circle along axisX
  const seamX = center[0] + radius * axisX[0];
  const seamY = center[1] + radius * axisX[1];
  const seamZ = center[2] + radius * axisX[2];

  const pointCoordId = allocator.nextId();
  buffer += `${pointCoordId} = CARTESIAN_POINT('', (${formatStepFloat(seamX)}, ${formatStepFloat(seamY)}, ${formatStepFloat(seamZ)}));\n`;

  const vertexPointId = allocator.nextId();
  buffer += `${vertexPointId} = VERTEX_POINT('', ${pointCoordId});\n`;

  const edgeCurveId = allocator.nextId();
  buffer += `${edgeCurveId} = EDGE_CURVE('', ${vertexPointId}, ${vertexPointId}, ${circleId}, .T.);\n`;

  return { edgeCurveId, vertexPointId, pointCoordId, buffer };
}

/**
 * Creates an ISO 10303-42 LINE and an EDGE_CURVE connecting two seam vertices.
 */
export function createSeamLineEdgeCurve(
  allocator: StepIdAllocator,
  startVertexId: string,
  startCoord: Point3D,
  endVertexId: string,
  endCoord: Point3D
): SeamLineResult {
  let buffer = '';

  const ptStartId = allocator.nextId();
  buffer += `${ptStartId} = CARTESIAN_POINT('', (${formatStepFloat(startCoord[0])}, ${formatStepFloat(startCoord[1])}, ${formatStepFloat(startCoord[2])}));\n`;

  const vx = endCoord[0] - startCoord[0];
  const vy = endCoord[1] - startCoord[1];
  const vz = endCoord[2] - startCoord[2];
  const len = Math.hypot(vx, vy, vz);
  const nx = len > 1e-12 ? vx / len : 0;
  const ny = len > 1e-12 ? vy / len : 0;
  const nz = len > 1e-12 ? vz / len : 1;

  const dirId = allocator.nextId();
  buffer += `${dirId} = DIRECTION('', (${formatStepFloat(nx)}, ${formatStepFloat(ny)}, ${formatStepFloat(nz)}));\n`;

  const vecId = allocator.nextId();
  buffer += `${vecId} = VECTOR('', ${dirId}, 1.);\n`;

  const lineId = allocator.nextId();
  buffer += `${lineId} = LINE('', ${ptStartId}, ${vecId});\n`;

  const edgeCurveId = allocator.nextId();
  buffer += `${edgeCurveId} = EDGE_CURVE('', ${startVertexId}, ${endVertexId}, ${lineId}, .T.);\n`;

  return { edgeCurveId, buffer };
}

/**
 * Creates an ISO 10303-42 ADVANCED_FACE for a revolution surface bounded by top and bottom circles and a seam line.
 */
export function createRevolutionAdvancedFace(
  allocator: StepIdAllocator,
  surfaceId: string,
  topEdgeCurveId: string,
  bottomEdgeCurveId: string,
  seamEdgeCurveId: string,
  isHole: boolean = true
): RevolutionFaceResult {
  let buffer = '';

  const oeTop = allocator.nextId();
  buffer += `${oeTop} = ORIENTED_EDGE('', *, *, ${topEdgeCurveId}, .F.);\n`;

  const oeSeam1 = allocator.nextId();
  buffer += `${oeSeam1} = ORIENTED_EDGE('', *, *, ${seamEdgeCurveId}, .F.);\n`;

  const oeBottom = allocator.nextId();
  buffer += `${oeBottom} = ORIENTED_EDGE('', *, *, ${bottomEdgeCurveId}, .T.);\n`;

  const oeSeam2 = allocator.nextId();
  buffer += `${oeSeam2} = ORIENTED_EDGE('', *, *, ${seamEdgeCurveId}, .T.);\n`;

  const edgeLoopId = allocator.nextId();
  buffer += `${edgeLoopId} = EDGE_LOOP('', (${oeTop}, ${oeSeam1}, ${oeBottom}, ${oeSeam2}));\n`;

  const faceBoundId = allocator.nextId();
  buffer += `${faceBoundId} = FACE_BOUND('', ${edgeLoopId}, .T.);\n`;

  const sameSense = isHole ? '.F.' : '.T.';
  const faceId = allocator.nextId();
  buffer += `${faceId} = ADVANCED_FACE('', (${faceBoundId}), ${surfaceId}, ${sameSense});\n`;

  return { faceId, buffer };
}
