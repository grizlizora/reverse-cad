import assert from 'node:assert';
import { StepFaceEmitter } from '../kernel/step/step-face-emitter.js';
import { StepSolidBrepEmitter } from '../kernel/step/step-solid-brep-emitter.js';
import { StepIdAllocator } from '../kernel/step/step-id-allocator.js';
import { StepStreamWriter } from '../kernel/step/step-stream-writer.js';
import {
  computeAnalyticalCoverageRatio,
  writeTessellatedShapeAP242
} from '../kernel/step/step-tessellated-emitter.js';
import {
  streamCoordinatesList,
  streamTriangulatedFace
} from '../kernel/step/step-tessellated-packer.js';
import { prepareStepSolidBodies } from '../kernel/step/step-body-preparation.js';
import { executeShellSemanticPrepass } from '../kernel/step/step-shell-prepass.js';
import type { RawMesh, SurfacePrimitive, PlaneSurface } from '../types/geometry.js';

console.log('\n======================================================');
console.log('  PHASE 5: STEP AP242 KERNEL & EMITTERS VERIFICATION');
console.log('======================================================\n');

class MockStepStreamWriter {
  public output: string[] = [];
  public async writeLine(line: string): Promise<void> {
    this.output.push(line + '\n');
  }
  public async writeBlock(block: string): Promise<void> {
    this.output.push(block);
  }
  public async flush(): Promise<void> {}
  public async close(): Promise<void> {}
}

function createMockWriter(): { writer: StepStreamWriter; output: string[] } {
  const mock = new MockStepStreamWriter();
  return { writer: mock as unknown as StepStreamWriter, output: mock.output };
}

// 1. StepSolidBrepEmitter Test
const { writer: solidWriter, output: solidOut } = createMockWriter();
const allocator = new StepIdAllocator(100);
const solidEmitter = new StepSolidBrepEmitter(solidWriter, allocator);

const shellId = await solidEmitter.emitClosedShell(['#10', '#11', '#12']);
assert(shellId.startsWith('#'));
assert(solidOut.some(s => s.includes("CLOSED_SHELL('', (\n#10, #11, #12));")));

const solid = await solidEmitter.emitSolidBrep('TEST_BODY', shellId, '#50');
assert.strictEqual(solid.styledItemId, '#102');
assert(solidOut.some(s => s.includes("MANIFOLD_SOLID_BREP('TEST_BODY', #100);")));
assert(solidOut.some(s => s.includes("STYLED_ITEM('', (#50), #101);")));

await solidEmitter.emitBrepWithVoids('CAVITY_BODY', '#100', ['#200']);
assert(solidOut.some(s => s.includes("BREP_WITH_VOIDS('CAVITY_BODY', #100, (#103));")));
console.log('  ✔ StepSolidBrepEmitter (shells, solids, voids & styles): PASSED');

// 2. StepFaceEmitter delegation test
const { writer: faceWriter, output: faceOut } = createMockWriter();
const faceAlloc = new StepIdAllocator(300);
const faceEmitter = new StepFaceEmitter(faceWriter, faceAlloc, ['#1', '#2', '#3', '#4']);

const triFaceId = await faceEmitter.emitTriangleFace(0, 1, 2, '#99', true);
const quadFaceId = await faceEmitter.emitQuadFace(0, 1, 2, 3, '#99', false);
const jordanFaceId = await faceEmitter.emitJordanFace({
  outerLoop: [0, 1, 2],
  holeLoops: [],
  surfaceId: '#99',
  sameSense: true
});
await faceEmitter.flush();

assert(triFaceId.startsWith('#'));
assert(quadFaceId.startsWith('#'));
assert(jordanFaceId.startsWith('#'));
assert(faceOut.some(s => s.includes("POLY_LOOP('', (#1, #2, #3));")));
assert(faceOut.some(s => s.includes("POLY_LOOP('', (#1, #2, #3, #4));")));
console.log('  ✔ StepFaceEmitter (tri, quad, jordan face emission & buffer flush): PASSED');

// 3. Tessellated Packer & Emitter Test
const { writer: tessWriter, output: tessOut } = createMockWriter();
const tessAlloc = new StepIdAllocator(500);
const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]);
const indices = new Uint32Array([0, 1, 2]);

const coordListId = await streamCoordinatesList(tessWriter, tessAlloc, positions, 3);
assert(coordListId.startsWith('#'));
assert(tessOut.some(s => s.includes("COORDINATES_LIST('', 3, (")));

const triFaceId2 = await streamTriangulatedFace(tessWriter, tessAlloc, coordListId, indices, undefined, 1);
assert(triFaceId2.startsWith('#'));
assert(tessOut.join('').includes("TRIANGULATED_FACE('', #500, (\n(1, 2, 3)));"));
console.log('  ✔ StepTessellatedPacker (coordinates list & triangulated face streaming): PASSED');

// 4. Analytical Coverage Ratio
const surfaces: SurfacePrimitive[] = [
  {
    id: 'surf_1',
    type: 'plane',
    normal: [0, 0, 1],
    origin: [0, 0, 0],
    area: 50,
    meanResidual: 0.001,
    inlierIndices: [0],
  } as PlaneSurface
];
const eta = computeAnalyticalCoverageRatio(surfaces, 2);
assert.strictEqual(eta, 0.5);
console.log('  ✔ computeAnalyticalCoverageRatio: PASSED');

// 5. Tessellated Shape High-Scale AP242 emission
const mockMesh: RawMesh = {
  positions,
  indices,
  vertexCount: 3,
  triangleCount: 1,
  boundingBox: { min: [0, 0, 0], max: [10, 10, 0], dimensions: [10, 10, 0], center: [5, 5, 0], diagonal: 14.14 }
};
const report = await writeTessellatedShapeAP242(tessWriter, tessAlloc, mockMesh, 'ORGANIC_PART');
assert.strictEqual(report.totalVertices, 3);
assert.strictEqual(report.totalTriangles, 1);
console.log('  ✔ writeTessellatedShapeAP242 report generation: PASSED');

// 6. Shell Semantic Prepass & Body Preparation
const prep = prepareStepSolidBodies(mockMesh, surfaces, { threadMode: 'semantic' });
assert.strictEqual(prep.targetShells.length, 1);
assert.strictEqual(prep.stepVerticesX.length, 3);
assert.strictEqual(prep.usedVertices.length, 3);

const prepassResult = executeShellSemanticPrepass(surfaces, prep.targetShells, mockMesh, prep.stepVerticesX, prep.stepVerticesY, prep.stepVerticesZ);
assert(prepassResult.absorbedTris instanceof Uint8Array);
assert(prepassResult.precomputedShells instanceof Map);
console.log('  ✔ Shell Semantic Prepass & Solid Body Preparation: PASSED');

console.log('\n======================================================');
console.log('  ✔ ALL PHASE 5 STEP AP242 KERNEL TESTS PASSED (100%)');
console.log('======================================================\n');
