// ==============================================================================
// src/kernel/step/analytical/profile-lateral-extruder.ts — Lateral Wall Extruder
// Extrudes straight lines into PLANE faces and circular arcs into CYLINDRICAL_SURFACE faces.
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat } from '../step-orthonormal-basis.js';
import { AnalyticLoop2D } from './profile-loop-snapper.js';

export async function extrudeLateralFaces(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  loop: AnalyticLoop2D,
  zBottom: number,
  zTop: number,
  isHole: boolean = false
): Promise<string[]> {
  const faceIds: string[] = [];
  let buffer = '';

  const flushBuffer = async () => {
    if (buffer.length > 32768) {
      await writer.writeBlock(buffer);
      buffer = '';
    }
  };

  const emitPoint = (x: number, y: number, z: number): string => {
    const id = allocator.nextId();
    buffer += `${id} = CARTESIAN_POINT('', (${formatStepFloat(x)}, ${formatStepFloat(y)}, ${formatStepFloat(z)}));\n`;
    return id;
  };

  const emitDirection = (dx: number, dy: number, dz: number): string => {
    const id = allocator.nextId();
    buffer += `${id} = DIRECTION('', (${formatStepFloat(dx)}, ${formatStepFloat(dy)}, ${formatStepFloat(dz)}));\n`;
    return id;
  };

  const dirZUp = emitDirection(0, 0, 1);
  const dirZDown = emitDirection(0, 0, -1);
  const dirXBase = emitDirection(1, 0, 0);

  for (let i = 0; i < loop.segments.length; i++) {
    const seg = loop.segments[i];

    if (seg.type === 'line') {
      const p0 = isHole ? seg.end : seg.start;
      const p1 = isHole ? seg.start : seg.end;

      const pt0Bot = emitPoint(p0[0], p0[1], zBottom);
      const pt1Bot = emitPoint(p1[0], p1[1], zBottom);
      const pt1Top = emitPoint(p1[0], p1[1], zTop);
      const pt0Top = emitPoint(p0[0], p0[1], zTop);

      const polyLoopId = allocator.nextId();
      buffer += `${polyLoopId} = POLY_LOOP('', (${pt0Bot}, ${pt1Bot}, ${pt1Top}, ${pt0Top}));\n`;

      const faceBoundId = allocator.nextId();
      buffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${polyLoopId}, .T.);\n`;

      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const len = Math.hypot(dx, dy);
      const nx = -dy / len, ny = dx / len;

      const ptOrig = emitPoint(p0[0], p0[1], zBottom);
      const dirNorm = emitDirection(nx, ny, 0);
      const dirU = emitDirection(dx / len, dy / len, 0);
      const axisPlace = allocator.nextId();
      buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptOrig}, ${dirNorm}, ${dirU});\n`;

      const planeId = allocator.nextId();
      buffer += `${planeId} = PLANE('', ${axisPlace});\n`;

      const faceId = allocator.nextId();
      buffer += `${faceId} = ADVANCED_FACE('', (${faceBoundId}), ${planeId}, .T.);\n`;
      faceIds.push(faceId);

    } else if (seg.type === 'arc') {
      const { center, radius } = seg;
      const ptAxis = emitPoint(center[0], center[1], zBottom);
      const axisPlace = allocator.nextId();
      buffer += `${axisPlace} = AXIS2_PLACEMENT_3D('', ${ptAxis}, ${dirZUp}, ${dirXBase});\n`;

      const cylSurfId = allocator.nextId();
      buffer += `${cylSurfId} = CYLINDRICAL_SURFACE('', ${axisPlace}, ${formatStepFloat(radius)});\n`;

      const p0 = isHole ? seg.endPoint : seg.startPoint;
      const p1 = isHole ? seg.startPoint : seg.endPoint;

      const pt0Bot = emitPoint(p0[0], p0[1], zBottom);
      const pt1Bot = emitPoint(p1[0], p1[1], zBottom);
      const pt1Top = emitPoint(p1[0], p1[1], zTop);
      const pt0Top = emitPoint(p0[0], p0[1], zTop);

      const v0Bot = allocator.nextId(); buffer += `${v0Bot} = VERTEX_POINT('', ${pt0Bot});\n`;
      const v1Bot = allocator.nextId(); buffer += `${v1Bot} = VERTEX_POINT('', ${pt1Bot});\n`;
      const v1Top = allocator.nextId(); buffer += `${v1Top} = VERTEX_POINT('', ${pt1Top});\n`;
      const v0Top = allocator.nextId(); buffer += `${v0Top} = VERTEX_POINT('', ${pt0Top});\n`;

      const circleBotAxis = allocator.nextId();
      buffer += `${circleBotAxis} = AXIS2_PLACEMENT_3D('', ${ptAxis}, ${dirZUp}, ${dirXBase});\n`;
      const circleBotId = allocator.nextId();
      buffer += `${circleBotId} = CIRCLE('', ${circleBotAxis}, ${formatStepFloat(radius)});\n`;
      const edgeBot = allocator.nextId();
      buffer += `${edgeBot} = EDGE_CURVE('', ${v0Bot}, ${v1Bot}, ${circleBotId}, .T.);\n`;

      const lineRightDir = allocator.nextId();
      buffer += `${lineRightDir} = VECTOR('', ${dirZUp}, 1.);\n`;
      const lineRightGeom = allocator.nextId();
      buffer += `${lineRightGeom} = LINE('', ${pt1Bot}, ${lineRightDir});\n`;
      const edgeRight = allocator.nextId();
      buffer += `${edgeRight} = EDGE_CURVE('', ${v1Bot}, ${v1Top}, ${lineRightGeom}, .T.);\n`;

      const ptTopAxis = emitPoint(center[0], center[1], zTop);
      const circleTopAxis = allocator.nextId();
      buffer += `${circleTopAxis} = AXIS2_PLACEMENT_3D('', ${ptTopAxis}, ${dirZUp}, ${dirXBase});\n`;
      const circleTopId = allocator.nextId();
      buffer += `${circleTopId} = CIRCLE('', ${circleTopAxis}, ${formatStepFloat(radius)});\n`;
      const edgeTop = allocator.nextId();
      buffer += `${edgeTop} = EDGE_CURVE('', ${v1Top}, ${v0Top}, ${circleTopId}, .T.);\n`;

      const lineLeftDir = allocator.nextId();
      buffer += `${lineLeftDir} = VECTOR('', ${dirZDown}, 1.);\n`;
      const lineLeftGeom = allocator.nextId();
      buffer += `${lineLeftGeom} = LINE('', ${pt0Top}, ${lineLeftDir});\n`;
      const edgeLeft = allocator.nextId();
      buffer += `${edgeLeft} = EDGE_CURVE('', ${v0Top}, ${v0Bot}, ${lineLeftGeom}, .T.);\n`;

      const oe1 = allocator.nextId(); buffer += `${oe1} = ORIENTED_EDGE('', *, *, ${edgeBot}, .T.);\n`;
      const oe2 = allocator.nextId(); buffer += `${oe2} = ORIENTED_EDGE('', *, *, ${edgeRight}, .T.);\n`;
      const oe3 = allocator.nextId(); buffer += `${oe3} = ORIENTED_EDGE('', *, *, ${edgeTop}, .T.);\n`;
      const oe4 = allocator.nextId(); buffer += `${oe4} = ORIENTED_EDGE('', *, *, ${edgeLeft}, .T.);\n`;

      const edgeLoopId = allocator.nextId();
      buffer += `${edgeLoopId} = EDGE_LOOP('', (${oe1}, ${oe2}, ${oe3}, ${oe4}));\n`;
      const faceBoundId = allocator.nextId();
      buffer += `${faceBoundId} = FACE_OUTER_BOUND('', ${edgeLoopId}, .T.);\n`;

      const faceId = allocator.nextId();
      const senseStr = isHole ? '.F.' : '.T.';
      buffer += `${faceId} = ADVANCED_FACE('', (${faceBoundId}), ${cylSurfId}, ${senseStr});\n`;
      faceIds.push(faceId);
    }

    await flushBuffer();
  }

  if (buffer.length > 0) {
    await writer.writeBlock(buffer);
  }

  return faceIds;
}
