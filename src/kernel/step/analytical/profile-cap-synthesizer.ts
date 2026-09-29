// ==============================================================================
// src/kernel/step/analytical/profile-cap-synthesizer.ts — Planar Top/Bottom Cap Synthesizer
// Generates topologically closed B-Rep caps with outer boundaries and inner hole bounds.
// ==============================================================================

import { StepStreamWriter } from '../step-stream-writer.js';
import { StepIdAllocator } from '../step-id-allocator.js';
import { formatStepFloat } from '../step-orthonormal-basis.js';
import { AnalyticLoop2D } from './profile-loop-snapper.js';

interface CapContext {
  writer: StepStreamWriter;
  allocator: StepIdAllocator;
  buffer: string;
}

async function flushIfLarge(ctx: CapContext): Promise<void> {
  if (ctx.buffer.length > 32768) {
    await ctx.writer.writeBlock(ctx.buffer);
    ctx.buffer = '';
  }
}

/**
 * Builds an EDGE_LOOP or POLY_LOOP boundary for a given loop at specific Z height.
 */
async function buildCapBoundary(
  ctx: CapContext,
  loop: AnalyticLoop2D,
  z: number,
  reverseOrientation: boolean,
  isOuter: boolean
): Promise<string> {
  const segments = loop.segments;
  const n = segments.length;
  const dirZUp = ctx.allocator.nextId();
  ctx.buffer += `${dirZUp} = DIRECTION('', (0., 0., 1.));\n`;
  const dirXBase = ctx.allocator.nextId();
  ctx.buffer += `${dirXBase} = DIRECTION('', (1., 0., 0.));\n`;

  // Pre-allocate continuous vertices to ensure 100% vertex sharing in EDGE_LOOP
  const vertexIds: string[] = new Array(n);
  const ptStartIds: string[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const idx = reverseOrientation ? (n - 1 - i) : i;
    const seg = segments[idx];
    const pStart = reverseOrientation
      ? (seg.type === 'line' ? seg.end : seg.endPoint)
      : (seg.type === 'line' ? seg.start : seg.startPoint);

    const ptStart = ctx.allocator.nextId();
    ctx.buffer += `${ptStart} = CARTESIAN_POINT('', (${formatStepFloat(pStart[0])}, ${formatStepFloat(pStart[1])}, ${formatStepFloat(z)}));\n`;
    ptStartIds[i] = ptStart;

    const vStart = ctx.allocator.nextId();
    ctx.buffer += `${vStart} = VERTEX_POINT('', ${ptStart});\n`;
    vertexIds[i] = vStart;
  }

  const orientedEdgeIds: string[] = [];

  for (let i = 0; i < n; i++) {
    const idx = reverseOrientation ? (n - 1 - i) : i;
    const seg = segments[idx];

    let pStart = seg.type === 'line' ? seg.start : seg.startPoint;
    let pEnd = seg.type === 'line' ? seg.end : seg.endPoint;
    if (reverseOrientation) {
      const tmp = pStart; pStart = pEnd; pEnd = tmp;
    }

    const vStart = vertexIds[i];
    const vEnd = vertexIds[(i + 1) % n];
    const ptStart = ptStartIds[i];

    let edgeCurveId: string;
    if (seg.type === 'line') {
      const dx = pEnd[0] - pStart[0], dy = pEnd[1] - pStart[1];
      const len = Math.hypot(dx, dy);
      const dirVec = ctx.allocator.nextId();
      ctx.buffer += `${dirVec} = DIRECTION('', (${formatStepFloat(dx / len)}, ${formatStepFloat(dy / len)}, 0.));\n`;
      const vecGeom = ctx.allocator.nextId();
      ctx.buffer += `${vecGeom} = VECTOR('', ${dirVec}, ${formatStepFloat(len)});\n`;
      const lineGeom = ctx.allocator.nextId();
      ctx.buffer += `${lineGeom} = LINE('', ${ptStart}, ${vecGeom});\n`;
      edgeCurveId = ctx.allocator.nextId();
      ctx.buffer += `${edgeCurveId} = EDGE_CURVE('', ${vStart}, ${vEnd}, ${lineGeom}, .T.);\n`;
    } else {
      const ptCenter = ctx.allocator.nextId();
      ctx.buffer += `${ptCenter} = CARTESIAN_POINT('', (${formatStepFloat(seg.center[0])}, ${formatStepFloat(seg.center[1])}, ${formatStepFloat(z)}));\n`;
      const circleAxis = ctx.allocator.nextId();
      ctx.buffer += `${circleAxis} = AXIS2_PLACEMENT_3D('', ${ptCenter}, ${dirZUp}, ${dirXBase});\n`;
      const circleId = ctx.allocator.nextId();
      ctx.buffer += `${circleId} = CIRCLE('', ${circleAxis}, ${formatStepFloat(seg.radius)});\n`;
      edgeCurveId = ctx.allocator.nextId();
      const circleSense = reverseOrientation ? '.F.' : '.T.';
      ctx.buffer += `${edgeCurveId} = EDGE_CURVE('', ${vStart}, ${vEnd}, ${circleId}, ${circleSense});\n`;
    }

    const oe = ctx.allocator.nextId();
    ctx.buffer += `${oe} = ORIENTED_EDGE('', *, *, ${edgeCurveId}, .T.);\n`;
    orientedEdgeIds.push(oe);

    await flushIfLarge(ctx);
  }

  const loopId = ctx.allocator.nextId();
  ctx.buffer += `${loopId} = EDGE_LOOP('', (${orientedEdgeIds.join(', ')}));\n`;

  const boundId = ctx.allocator.nextId();
  const boundType = isOuter ? 'FACE_OUTER_BOUND' : 'FACE_BOUND';
  ctx.buffer += `${boundId} = ${boundType}('', ${loopId}, .T.);\n`;

  return boundId;
}

/**
 * Synthesizes top and bottom capping ADVANCED_FACE entities with proper outer & hole bounds.
 */
export async function synthesizeProfileCaps(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  outerLoop: AnalyticLoop2D,
  holeLoops: AnalyticLoop2D[],
  zBottom: number,
  zTop: number
): Promise<{ bottomFaceId: string; topFaceId: string }> {
  const ctx: CapContext = { writer, allocator, buffer: '' };

  // Bottom cap (Normal = [0, 0, -1])
  const ptBotOrig = allocator.nextId();
  ctx.buffer += `${ptBotOrig} = CARTESIAN_POINT('', (0., 0., ${formatStepFloat(zBottom)}));\n`;
  const dirDown = allocator.nextId();
  ctx.buffer += `${dirDown} = DIRECTION('', (0., 0., -1.));\n`;
  const dirX = allocator.nextId();
  ctx.buffer += `${dirX} = DIRECTION('', (1., 0., 0.));\n`;
  const axisBot = allocator.nextId();
  ctx.buffer += `${axisBot} = AXIS2_PLACEMENT_3D('', ${ptBotOrig}, ${dirDown}, ${dirX});\n`;
  const planeBot = allocator.nextId();
  ctx.buffer += `${planeBot} = PLANE('', ${axisBot});\n`;

  const botOuterBound = await buildCapBoundary(ctx, outerLoop, zBottom, true, true);
  const botBounds = [botOuterBound];
  for (let h = 0; h < holeLoops.length; h++) {
    const holeBound = await buildCapBoundary(ctx, holeLoops[h], zBottom, false, false);
    botBounds.push(holeBound);
  }
  const bottomFaceId = allocator.nextId();
  ctx.buffer += `${bottomFaceId} = ADVANCED_FACE('', (${botBounds.join(', ')}), ${planeBot}, .T.);\n`;

  // Top cap (Normal = [0, 0, 1])
  const ptTopOrig = allocator.nextId();
  ctx.buffer += `${ptTopOrig} = CARTESIAN_POINT('', (0., 0., ${formatStepFloat(zTop)}));\n`;
  const dirUp = allocator.nextId();
  ctx.buffer += `${dirUp} = DIRECTION('', (0., 0., 1.));\n`;
  const axisTop = allocator.nextId();
  ctx.buffer += `${axisTop} = AXIS2_PLACEMENT_3D('', ${ptTopOrig}, ${dirUp}, ${dirX});\n`;
  const planeTop = allocator.nextId();
  ctx.buffer += `${planeTop} = PLANE('', ${axisTop});\n`;

  const topOuterBound = await buildCapBoundary(ctx, outerLoop, zTop, false, true);
  const topBounds = [topOuterBound];
  for (let h = 0; h < holeLoops.length; h++) {
    const holeBound = await buildCapBoundary(ctx, holeLoops[h], zTop, true, false);
    topBounds.push(holeBound);
  }
  const topFaceId = allocator.nextId();
  ctx.buffer += `${topFaceId} = ADVANCED_FACE('', (${topBounds.join(', ')}), ${planeTop}, .T.);\n`;

  if (ctx.buffer.length > 0) {
    await writer.writeBlock(ctx.buffer);
  }

  return { bottomFaceId, topFaceId };
}
