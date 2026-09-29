// ==============================================================================
// src/kernel/step/fast-brep-builder.ts — High-Throughput Modular B-Rep Synthesizer
// ==============================================================================

import { RawMesh, MeshShell } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SurfaceStepMapping } from './step-analytical-surfaces.js';
import { BRepAssemblyResult } from './step-brep-builder.js';
import { SolidBodyConfig } from './step-types.js';
import { computeShellMetrics } from './brep-mesh-metrics.js';
import { BRepReportAggregator } from './brep-report-calculator.js';
import { TopologyEdgeIndexer } from './topology-edge-indexer.js';
import { StepFaceEmitter } from './step-face-emitter.js';
import { clusterCoplanarTriangles, synthesizeThroughHoleBands } from './planar/index.js';
import { PrecomputedShellTopology } from './step-body-preparation.js';
import { synthesizeClusterFaces, emitFallbackQuadsAndTris } from './brep-cluster-face-synthesizer.js';
import {
  assignCavitiesToBodies,
  adjustMetricsForCavities,
  synthesizeBodyCavityShells
} from './brep-cavity-resolver.js';

export { emitFallbackQuadsAndTris, synthesizeClusterFaces };

/**
 * Cooperative Event Loop Yielding Controller (16ms quantum).
 * Checks system clock every 64 iterations via bitwise mask to eliminate syscall overhead.
 */
export class CooperativeYieldController {
  private lastYield: number = Date.now();
  private ticks: number = 0;
  private readonly quantumMs: number;

  constructor(quantumMs: number = 16) {
    this.quantumMs = quantumMs;
  }

  public async maybeYield(): Promise<void> {
    if ((++this.ticks & 63) !== 0) return;
    const now = Date.now();
    if (now - this.lastYield >= this.quantumMs) {
      await new Promise<void>(resolve => setImmediate(resolve));
      this.lastYield = Date.now();
    }
  }
}

/**
 * Builds multi-body topological B-Rep geometry using clean modular components,
 * zero-string integer edge indexing, and non-blocking 16ms event loop yielding.
 */
export async function buildFastMultiBodyBRep(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  targetShells: MeshShell[],
  bodyDefinitions: SolidBodyConfig[],
  bodyPresentationStyles: string[],
  surfaceMapping: SurfaceStepMapping,
  pointIds: string[],
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  cavityShells: MeshShell[] = [],
  precomputedShells?: Map<number, PrecomputedShellTopology>
): Promise<BRepAssemblyResult> {
  const solidBRepIds: string[] = [];
  const allStyledItemIds: string[] = [];
  const reportAggregator = new BRepReportAggregator();
  const emitter = new StepFaceEmitter(writer, allocator, pointIds);
  const yieldCtrl = new CooperativeYieldController(16);
  const indices = mesh.indices;

  const nonPlaneStepIds = new Set<string>();
  if (surfaceMapping.surfaces) {
    for (const s of surfaceMapping.surfaces) {
      if (s.type !== 'plane') {
        const id = surfaceMapping.surfaceToStepId.get(s.id);
        if (id) nonPlaneStepIds.add(id);
      }
    }
  }

  const cavitiesByBody = assignCavitiesToBodies(targetShells, cavityShells);

  for (let b = 0; b < targetShells.length; b++) {
    const shell = targetShells[b];
    const bDef = bodyDefinitions[b];
    const shellFaceIds: string[] = [];
    const triIndices = shell.triangleIndices;
    const assignedCavities = cavitiesByBody.get(b);

    const rawMetrics = computeShellMetrics(
      mesh, triIndices, stepVerticesX, stepVerticesY, stepVerticesZ
    );
    const metrics = adjustMetricsForCavities(
      rawMetrics, assignedCavities, mesh, stepVerticesX, stepVerticesY, stepVerticesZ
    );
    reportAggregator.addShell(metrics, bDef);

    const precomputed = precomputedShells?.get(b);
    const edgeIndexer = precomputed?.edgeIndexer ?? new TopologyEdgeIndexer(indices, triIndices);
    const clusters = precomputed?.clusters ?? clusterCoplanarTriangles(
      triIndices, indices, stepVerticesX, stepVerticesY, stepVerticesZ,
      surfaceMapping.triangleToSurfaceId, surfaceMapping.triangleSameSense, edgeIndexer
    );
    const mergedTris = precomputed?.absorbedTris
      ? new Uint8Array(precomputed.absorbedTris)
      : new Uint8Array(mesh.triangleCount);

    if (precomputed?.matchedHoles && precomputed.matchedHoles.length > 0) {
      const bandFaceIds = await synthesizeThroughHoleBands(
        precomputed.matchedHoles, stepVerticesX, stepVerticesY, stepVerticesZ,
        writer, allocator, emitter
      );
      for (let f = 0; f < bandFaceIds.length; f++) shellFaceIds.push(bandFaceIds[f]);
    }

    for (let c = 0; c < clusters.length; c++) {
      await yieldCtrl.maybeYield();
      const clusterFaceIds = await synthesizeClusterFaces(
        clusters[c], mesh, stepVerticesX, stepVerticesY, stepVerticesZ,
        edgeIndexer, mergedTris, writer, allocator, emitter, surfaceMapping, nonPlaneStepIds
      );
      for (let f = 0; f < clusterFaceIds.length; f++) shellFaceIds.push(clusterFaceIds[f]);
    }

    if (shellFaceIds.length === 0) continue;

    const closedShellId = await emitter.emitClosedShell(shellFaceIds);
    const internalCavityShellIds = await synthesizeBodyCavityShells(
      assignedCavities, indices, surfaceMapping, emitter
    );

    const res = internalCavityShellIds.length > 0
      ? await emitter.emitBrepWithVoids(bDef.name, closedShellId, internalCavityShellIds, bodyPresentationStyles[b])
      : await emitter.emitSolidBrep(bDef.name, closedShellId, bodyPresentationStyles[b]);

    solidBRepIds.push(res.brepId);
    if (res.styledItemId) allStyledItemIds.push(res.styledItemId);
  }

  await emitter.flush();

  return {
    solidBRepIds,
    allStyledItemIds,
    report: reportAggregator.buildReport()
  };
}

export const writeFastBRepSolid = buildFastMultiBodyBRep;
