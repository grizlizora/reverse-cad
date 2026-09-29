// ==============================================================================
// src/test/test-watertight-solid-hole.ts — Watertight B-Rep Cube with Hole Test
// ==============================================================================

import * as path from 'path';
import * as fs from 'fs';
import { StepStreamWriter } from '../kernel/step/step-stream-writer.js';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { StepFaceEmitter } from '../kernel/step/step-face-emitter.js';
import { writeStepHeader, writeGeometricContext } from '../kernel/step/step-meta-builder.js';
import { writeStepFooter } from '../kernel/step/step-brep-builder.js';
import { formatStepFloat } from '../kernel/step/step-orthonormal-basis.js';
import { StepTopologyLinter } from '../kernel/step/step-topology-linter.js';
import { StepBrepValidator } from '../kernel/step/step-brep-validator.js';
import { withTempDir } from './temp-dir-guard.js';

async function generateCubeHoleStep(outputPath: string): Promise<void> {
  const writer = new StepStreamWriter(outputPath);
  const allocator = new StepIdAllocator(10);

  await writeStepHeader(writer, 'CubeHole', 'Test', 'Antigravity', '20260928T050000');
  const ctx = await writeGeometricContext(writer, allocator);

  const N = 12; // 12-sided polygon hole
  const pointIds: string[] = [];
  let ptCount = 0;

  async function addPt(x: number, y: number, z: number): Promise<number> {
    const id = allocator.nextId();
    await writer.writeLine(`${id} = CARTESIAN_POINT('', (${formatStepFloat(x)}, ${formatStepFloat(y)}, ${formatStepFloat(z)}));`);
    pointIds.push(id);
    return ptCount++;
  }

  // Box 40x40x20
  const t0 = await addPt(0, 0, 20), t1 = await addPt(40, 0, 20);
  const t2 = await addPt(40, 40, 20), t3 = await addPt(0, 40, 20);
  const b0 = await addPt(0, 0, 0), b1 = await addPt(40, 0, 0);
  const b2 = await addPt(40, 40, 0), b3 = await addPt(0, 40, 0);

  const topHole: number[] = [];
  for (let i = 0; i < N; i++) {
    const angle = -(2 * Math.PI * i) / N;
    topHole.push(await addPt(20 + 8 * Math.cos(angle), 20 + 8 * Math.sin(angle), 20));
  }

  const botHole: number[] = [];
  for (let i = 0; i < N; i++) {
    const angle = (2 * Math.PI * i) / N;
    botHole.push(await addPt(20 + 8 * Math.cos(angle), 20 + 8 * Math.sin(angle), 0));
  }

  async function makePlane(ox: number, oy: number, oz: number, nx: number, ny: number, nz: number): Promise<string> {
    const pId = allocator.nextId(), zId = allocator.nextId(), xId = allocator.nextId();
    const plId = allocator.nextId(), sId = allocator.nextId();
    const xx = Math.abs(nz) > 0.9 ? 1 : -ny;
    const xy = Math.abs(nz) > 0.9 ? 0 : nx;
    const xz = 0;
    const block =
      `${pId} = CARTESIAN_POINT('', (${formatStepFloat(ox)}, ${formatStepFloat(oy)}, ${formatStepFloat(oz)}));\n` +
      `${zId} = DIRECTION('', (${formatStepFloat(nx)}, ${formatStepFloat(ny)}, ${formatStepFloat(nz)}));\n` +
      `${xId} = DIRECTION('', (${formatStepFloat(xx)}, ${formatStepFloat(xy)}, ${formatStepFloat(xz)}));\n` +
      `${plId} = AXIS2_PLACEMENT_3D('', ${pId}, ${zId}, ${xId});\n` +
      `${sId} = PLANE('', ${plId});\n`;
    await writer.writeBlock(block);
    return sId;
  }

  const pTop = await makePlane(20, 20, 20, 0, 0, 1);
  const pBot = await makePlane(20, 20, 0, 0, 0, -1);
  const pFront = await makePlane(20, 0, 10, 0, -1, 0);
  const pBack = await makePlane(20, 40, 10, 0, 1, 0);
  const pLeft = await makePlane(0, 20, 10, -1, 0, 0);
  const pRight = await makePlane(40, 20, 10, 1, 0, 0);

  const emitter = new StepFaceEmitter(writer, allocator, pointIds);
  const faces: string[] = [];

  faces.push(await emitter.emitJordanFace({ outerLoop: [t0, t1, t2, t3], holeLoops: [topHole], surfaceId: pTop, sameSense: true }));
  faces.push(await emitter.emitJordanFace({ outerLoop: [b0, b3, b2, b1], holeLoops: [botHole], surfaceId: pBot, sameSense: true }));
  faces.push(await emitter.emitQuadFace(t1, t0, b0, b1, pFront, true));
  faces.push(await emitter.emitQuadFace(t3, t2, b2, b3, pBack, true));
  faces.push(await emitter.emitQuadFace(t0, t3, b3, b0, pLeft, true));
  faces.push(await emitter.emitQuadFace(t2, t1, b1, b2, pRight, true));

  const cylPt = allocator.nextId(), cylZ = allocator.nextId(), cylX = allocator.nextId();
  const cylPlace = allocator.nextId(), sCylinder = allocator.nextId();
  await writer.writeBlock(
    `${cylPt} = CARTESIAN_POINT('', (20.00000, 20.00000, 0.00000));\n` +
    `${cylZ} = DIRECTION('', (0.00000, 0.00000, 1.00000));\n` +
    `${cylX} = DIRECTION('', (1.00000, 0.00000, 0.00000));\n` +
    `${cylPlace} = AXIS2_PLACEMENT_3D('', ${cylPt}, ${cylZ}, ${cylX});\n` +
    `${sCylinder} = CYLINDRICAL_SURFACE('', ${cylPlace}, 8.00000);\n`
  );

  for (let i = 0; i < N; i++) {
    const tCurr = topHole[i], tNext = topHole[(i + 1) % N];
    const bCurr = botHole[(N - i) % N], bNext = botHole[(N - (i + 1)) % N];
    faces.push(await emitter.emitQuadFace(tNext, tCurr, bCurr, bNext, sCylinder, false));
  }

  const shellId = await emitter.emitClosedShell(faces);
  const brepRes = await emitter.emitSolidBrep('CubeHoleBody', shellId);
  await emitter.flush();

  const shapeRepId = allocator.nextId();
  const sdrId = allocator.nextId(), pdsId = allocator.nextId(), pdId = allocator.nextId();
  const pdfId = allocator.nextId(), prodId = allocator.nextId(), appCtxId = allocator.nextId();
  const pContextId = allocator.nextId(), mechCtxId = allocator.nextId(), apId = allocator.nextId();

  await writer.writeBlock(
    `${shapeRepId} = ADVANCED_BREP_SHAPE_REPRESENTATION('CubeHole_Assembly', (${ctx.idAxisPlacement}, ${brepRes.brepId}), ${ctx.idContext});\n` +
    `${sdrId} = SHAPE_DEFINITION_REPRESENTATION(${pdsId}, ${shapeRepId});\n` +
    `${pdsId} = PRODUCT_DEFINITION_SHAPE('CubeHole_Shape', '', ${pdId});\n` +
    `${pdId} = PRODUCT_DEFINITION('CubeHole_PD', '', ${pdfId}, ${pContextId});\n` +
    `${pdfId} = PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('CubeHole_PDF', '', ${prodId}, .NOT_KNOWN.);\n` +
    `${prodId} = PRODUCT('CubeHole', 'CubeHole', '', (${mechCtxId}));\n` +
    `${appCtxId} = APPLICATION_CONTEXT('mechanical design');\n` +
    `${pContextId} = PRODUCT_DEFINITION_CONTEXT('part definition', ${appCtxId}, 'design');\n` +
    `${mechCtxId} = MECHANICAL_CONTEXT('mechanical', ${appCtxId}, 'mechanical design');\n` +
    `${apId} = APPLICATION_PROTOCOL_DEFINITION('international standard', 'automotive_design', 2000, ${appCtxId});\n`
  );

  await writeStepFooter(writer);
}

export async function runWatertightSolidTest(targetPath?: string): Promise<string> {
  if (targetPath) {
    await generateCubeHoleStep(targetPath);
    return targetPath;
  }
  return withTempDir('cube_hole_run', async (tmpDir) => {
    const outPath = path.join(tmpDir, 'test_cube_with_hole.step');
    await generateCubeHoleStep(outPath);
    const content = await fs.promises.readFile(outPath, 'utf-8');
    const linter = new StepTopologyLinter();
    const lintRep = linter.parseAndLintStep(content);
    if (lintRep.invertedOrientationCount > 0) {
      throw new Error(`Topology lint error: ${lintRep.invertedOrientationCount} inverted normals`);
    }
    return outPath;
  });
}

export async function runWatertightSolidHoleTests(): Promise<boolean> {
  console.log('[TEST] Running Watertight B-Rep Cube with Hole Verification...');
  return withTempDir('watertight_cube_hole_test', async (tmpDir) => {
    const stepPath = path.join(tmpDir, 'test_cube_with_hole.step');
    await generateCubeHoleStep(stepPath);

    const content = await fs.promises.readFile(stepPath, 'utf-8');
    const linter = new StepTopologyLinter();
    const lintRep = linter.parseAndLintStep(content);
    if (lintRep.invertedOrientationCount > 0) {
      throw new Error(`Topology lint error: ${lintRep.invertedOrientationCount} inverted normals`);
    }

    const validator = new StepBrepValidator();
    const valRep = validator.validate(stepPath);
    if (!valRep.isWatertight || !valRep.is2Manifold) {
      throw new Error(`B-Rep not watertight: openEdges=${valRep.openEdgesCount}, nonManifold=${valRep.nonManifoldEdgesCount}`);
    }

    console.log(`  ✔ Watertight Solid Cube with Hole: PASSED (Faces=${valRep.facesCount}, OpenEdges=0, NonManifold=0)`);
    return true;
  });
}

if (process.argv[1] && (
  process.argv[1].endsWith('test-watertight-solid-hole.ts') ||
  process.argv[1].endsWith('test-watertight-solid-hole.js')
)) {
  runWatertightSolidHoleTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

