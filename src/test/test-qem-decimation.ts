// ==============================================================================
// src/test/test-qem-decimation.ts — Phase 3 QEM Decimation & Flat CSR Unit Tests
// ==============================================================================

import {
  buildMeshCSR,
  FlatVertexIncidence,
  QEMCollapseQueue,
  QEMEdgeCandidate,
  computeScaleInvariantTolerances,
  computeDatumPlaneVertices,
  computeVertexQuadrics,
  evaluateQuadricEdgeCost,
  decimateMesh
} from '../stages/decimation/index.js';
import { generatePrismaticM6Model } from '../rsvs/procedural-benchmarks.js';
import { sanitizeTopology } from '../stages/stage3-sanitize.js';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function runTests() {
  console.log('[TEST] Running Phase 3 QEM Decimation & FlatVertexIncidence tests...');

  // 1. Test QEMCollapseQueue Float64 precision & zero-allocation popInto
  const queue = new QEMCollapseQueue(16);
  queue.pushValues(10, 20, 1e-12);
  queue.pushValues(30, 40, 1e-15); // Smaller than Float32 precision!
  queue.pushValues(50, 60, 1e-9);

  const out: QEMEdgeCandidate = { vA: 0, vB: 0, cost: 0 };
  assert(queue.popInto(out) === true, 'Expected popInto to return true');
  assert(out.vA === 30 && out.vB === 40 && out.cost === 1e-15, `Expected 1e-15 min cost, got ${out.cost}`);
  assert(queue.popInto(out) === true && out.vA === 10 && out.cost === 1e-12, 'Expected 1e-12 second');
  assert(queue.popInto(out) === true && out.vA === 50 && out.cost === 1e-9, 'Expected 1e-9 third');
  assert(queue.popInto(out) === false, 'Expected empty queue to return false');
  console.log('  ✔ QEMCollapseQueue (Float64 precision & zero-alloc popInto): PASSED');

  // 2. Test FlatVertexIncidence O(1) merge & traversal
  const mesh = generatePrismaticM6Model();
  const csr = buildMeshCSR(mesh);
  const incidence = new FlatVertexIncidence(mesh.vertexCount, csr);

  const countIncident = (v: number): number[] => {
    const res: number[] = [];
    let node = incidence.head[v];
    while (node !== -1) {
      res.push(incidence.vTris[node]);
      node = incidence.next[node];
    }
    return res;
  };

  const list0Before = countIncident(0);
  const list1Before = countIncident(1);
  assert(list0Before.length > 0 && list1Before.length > 0, 'Expected incident triangles on v0 and v1');

  incidence.merge(0, 1);
  const list0After = countIncident(0);
  const list1After = countIncident(1);
  assert(list0After.length === list0Before.length + list1Before.length, 'Expected merged list length to equal sum');
  assert(list1After.length === 0, 'Expected removed vertex list to be empty after merge');
  console.log('  ✔ FlatVertexIncidence (O(1) pointer splice & traversal): PASSED');

  // 3. Test Quadric Matrix & Datum Locks
  const tol = computeScaleInvariantTolerances(mesh.positions);
  assert(tol.bboxDiag > 40 && tol.scaleRatio > 0, 'Expected valid bboxDiag and scaleRatio');
  const datumLocks = computeDatumPlaneVertices(mesh.positions, mesh.vertexCount, tol.minZ, tol.maxZ, tol.datumTol);
  let lockedDatumCount = 0;
  for (let i = 0; i < datumLocks.length; i++) if (datumLocks[i]) lockedDatumCount++;
  assert(lockedDatumCount > 0, 'Expected datum cap vertices to be locked');

  const Q = computeVertexQuadrics(mesh, csr.faceNormals);
  assert(Q.length === mesh.vertexCount * 10, 'Expected 10 Float64 quadric coefficients per vertex');
  const selfCost = evaluateQuadricEdgeCost(Q, mesh.positions, 0, 0, 0);
  assert(Math.abs(selfCost) < 1e-6, `Expected near-zero self-quadric cost on vertex 0, got ${selfCost}`);
  console.log('  ✔ Quadric Matrix Assembly & Scale-Invariant Datum Locks: PASSED');

  // 4. Test Full Decimation Watertight Integrity
  const decimated = decimateMesh(mesh, { maxTrianglesThreshold: 120 });
  const sanitized = sanitizeTopology(decimated);
  assert(sanitized.isWatertight === true, 'Expected decimated mesh to remain 100% watertight');
  assert(sanitized.openEdgesCount === 0, `Expected 0 open edges, got ${sanitized.openEdgesCount}`);
  console.log(`  ✔ Watertight QEM Decimation Integrity: PASSED (Watertight=${sanitized.isWatertight}, OpenEdges=${sanitized.openEdgesCount})`);

  console.log('\n[PASS] All Phase 3 QEM Decimation tests completed successfully.');
}

runTests();
