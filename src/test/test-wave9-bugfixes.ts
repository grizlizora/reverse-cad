// ==============================================================================
// src/test/test-wave9-bugfixes.ts — Wave 9 Critical Micro-Bug & Singularity Fix Tests
// ==============================================================================

import { projectPointToAnalyticalSurface } from '../rsvs/surface-projections.js';
import { CylinderSurface, ConeSurface, TorusSurface } from '../types/geometry.js';
import { QEMCollapseQueue } from '../stages/decimation/qem-collapse-queue.js';
import { StepEntityExtractor } from '../kernel/step/validation/parser/step-entity-extractor.js';
import { StepParsedModel } from '../kernel/step/validation/types.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`[AssertionFailed] ${msg}`);
}

export function runWave9BugFixTests(): void {
  console.log('[TEST] Running Wave 9 Micro-Bug & Singularity Fix Verification...');

  // 1. Surface Projections: Axis Collinear Singularity Fix
  const cylX: CylinderSurface = {
    id: 'cyl1',
    inlierIndices: [],
    area: 100,
    meanResidual: 0.001,
    isInternal: false,
    type: 'cylinder',
    axisOrigin: [0, 0, 0],
    axisDirection: [1, 0, 0], // Axis along X
    radius: 10,
    height: 50
  };
  // Point directly on cylinder axis:
  const resCyl = projectPointToAnalyticalSurface([5, 0, 0], cylX);
  assert(Math.abs(resCyl.projectedPoint[0] - 5) < 1e-9, 'Cylinder projX must match axis coordinate');
  const radDist = Math.hypot(resCyl.projectedPoint[1], resCyl.projectedPoint[2]);
  assert(Math.abs(radDist - 10) < 1e-9, `Cylinder radial distance must be 10, got: ${radDist}`);
  assert(Math.abs(resCyl.distance - 10) < 1e-9, `Distance from axis to cylinder must be 10, got: ${resCyl.distance}`);

  // Point on cone axis:
  const coneZ: ConeSurface = {
    id: 'cone1',
    inlierIndices: [],
    area: 100,
    meanResidual: 0.001,
    isInternal: false,
    height: 50,
    type: 'cone',
    apex: [0, 0, 0],
    axisDirection: [0, 0, 1],
    halfAngleRad: Math.PI / 4 // 45°
  };
  const resCone = projectPointToAnalyticalSurface([0, 0, 10], coneZ);
  assert(Math.abs(resCone.distance - 10 * Math.SQRT1_2) < 1e-6, 'Distance to 45° cone from axis point must be exact');

  // Point on torus axis:
  const torZ: TorusSurface = {
    id: 'tor1',
    inlierIndices: [],
    area: 100,
    meanResidual: 0.001,
    type: 'torus',
    center: [0, 0, 0],
    axisDirection: [0, 0, 1],
    majorRadius: 20,
    minorRadius: 5
  };
  const resTor = projectPointToAnalyticalSurface([0, 0, 0], torZ);
  assert(Math.abs(resTor.distance - 15) < 1e-9, 'Distance from torus center to inner tube must be 15');
  console.log('  ✔ surface-projections: cylinder/cone/torus axis singularity resolved: PASSED');

  // 2. QEM Collapse Queue: NaN / Infinity Heap Shield
  const queue = new QEMCollapseQueue(16);
  queue.pushValues(0, 1, 0.5);
  queue.pushValues(1, 2, NaN); // Must be rejected
  queue.pushValues(2, 3, Infinity); // Must be rejected
  queue.pushValues(3, 4, -Infinity); // Must be rejected
  queue.push({ vA: 4, vB: 5, cost: NaN }); // Must be rejected
  queue.pushValues(5, 6, 0.1);

  assert(queue.size === 2, `Queue size must be 2 after rejecting non-finite costs, got: ${queue.size}`);
  const top = queue.pop();
  assert(top !== undefined && top.cost === 0.1, 'Min-heap top must be 0.1');
  const second = queue.pop();
  assert(second !== undefined && second.cost === 0.5, 'Second element must be 0.5');
  console.log('  ✔ qem-collapse-queue: NaN & Infinity rejection guard: PASSED');

  // 3. Step Entity Extractor: Zero-Allocation Point Resolution
  const extractor = new StepEntityExtractor();
  const mockModel: StepParsedModel = {
    points: new Map([
      ['#10', { id: '#10', x: 1.5, y: 2.5, z: 3.5 }]
    ]),
    vertexPoints: new Map([['#20', '#10']]),
    edgeCurves: new Map(),
    orientedEdges: new Map(),
    loops: new Map(),
    faces: [],
    faceById: new Map(),
    faceBoundToLoop: new Map(),
    closedShellEntities: [],
    openShellEntities: [],
    manifoldSolidEntities: [],
    brepWithVoidsEntities: []
  };

  const p1 = extractor.resolvePoint(mockModel, '#10');
  const p2 = extractor.resolvePoint(mockModel, '#10');
  assert(p1 !== null && p1 === p2, 'resolvePoint must return direct object reference (Zero-GC)');

  const pRef1 = extractor.resolvePoint(mockModel, '#20');
  const pRef2 = extractor.resolvePoint(mockModel, '#20');
  assert(pRef1 !== null && pRef1 === pRef2 && pRef1 === p1, 'resolvePoint via VERTEX_POINT must return direct reference');
  console.log('  ✔ step-entity-extractor: Zero-Allocation point resolution: PASSED');

  console.log('[PASS] All Wave 9 Micro-Bug & Singularity Fix tests passed successfully!\n');
}

const isDirect = process.argv[1] && (
  process.argv[1].endsWith('test-wave9-bugfixes.ts') ||
  process.argv[1].endsWith('test-wave9-bugfixes.js')
);

if (isDirect) {
  try {
    runWave9BugFixTests();
  } catch (err) {
    console.error('Wave 9 Bugfix Tests Failed:', err);
    process.exit(1);
  }
}
