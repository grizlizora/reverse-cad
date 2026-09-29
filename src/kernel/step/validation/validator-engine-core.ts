// ==============================================================================
// src/kernel/step/validation/validator-engine-core.ts — Pure In-Memory B-Rep Core
// ==============================================================================

import {
  StepParsedModel,
  HoleDefinition,
  PlanarFaceInfo
} from './types.js';
import { StepEntityExtractor } from './parser/step-entity-extractor.js';
import { BoundingBoxCalculator } from './geometry/bounding-box.js';
import { HalfEdgeGraphBuilder } from './topology/half-edge-graph.js';
import { ShellDecomposer } from './topology/shell-decomposer.js';
import { BoreSpannerDetector } from './geometry/bore-spanner-detector.js';

export interface CoreValidationOptions {
  geometricTolerance?: number;
  targetHoles?: HoleDefinition[];
  faceFilter?: (centroid: { x: number; y: number; z: number }) => boolean;
}

export interface CoreAnalysisResult {
  graph: ReturnType<typeof HalfEdgeGraphBuilder.build>;
  shells: ReturnType<typeof ShellDecomposer.decompose>;
  boundingBox: ReturnType<typeof BoundingBoxCalculator.compute>;
  boreSpanners: ReturnType<typeof BoreSpannerDetector.detect>['boreSpanners'];
  totalBoreSpanners: number;
  frontPlanarFaces: PlanarFaceInfo[];
  isWatertight: boolean;
  is2Manifold: boolean;
  isValidSolid: boolean;
  errors: string[];
  warnings: string[];
  analysisDurationMs: number;
}

/**
 * Pure, in-memory, worker-ready B-Rep topological evaluation kernel.
 * Has zero node:fs or platform dependencies.
 */
export class StepBrepValidatorCore {
  private readonly extractor = new StepEntityExtractor();

  public analyzeModel(
    parsedModel: StepParsedModel,
    options: CoreValidationOptions = {}
  ): CoreAnalysisResult {
    const tAnalysisStart = performance.now();
    const tol = options.geometricTolerance ?? 1e-4;
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Calculate 3D Bounding Box
    const boundingBox = BoundingBoxCalculator.compute(parsedModel.points.values());

    // 2. Build Topological & Geometric Half-Edge Map
    const graph = HalfEdgeGraphBuilder.build(parsedModel, boundingBox, tol, this.extractor);

    // 3. Shell Decomposition via Connected Components (Deterministic O(E) BFS)
    const shells = ShellDecomposer.decompose(
      parsedModel.faces,
      graph.faceAdjacency,
      graph.edgeMap,
      graph.facePolygons,
      tol
    );

    // 4. Hole Bore Spanner Analysis
    const { boreSpanners, totalBoreSpanners } = BoreSpannerDetector.detect(
      graph.facePolygons,
      boundingBox,
      options.targetHoles
    );

    // 5. Configurable Front Planar Face Analysis (default centroid.y < 3.0 mm)
    const filter = options.faceFilter ?? ((c) => c.y < 3.0);
    const frontPlanarFaces: PlanarFaceInfo[] = [];
    for (let f = 0; f < parsedModel.faces.length; f++) {
      const poly = graph.facePolygons[f];
      if (poly && filter(poly.centroid)) {
        frontPlanarFaces.push({
          faceId: poly.faceId,
          area: poly.area,
          centroid: poly.centroid,
          edgeCount: poly.vertices.length,
          surfaceStepId: parsedModel.faces[f].surfaceId
        });
      }
    }

    const isWatertight = graph.openEdgesCount === 0 && parsedModel.faces.length > 0;
    const is2Manifold = graph.nonManifoldEdgesCount === 0 && graph.invertedOrientationsCount === 0;
    const isValidSolid = isWatertight && is2Manifold && shells.length >= 1 && shells.every(s => s.isClosed);

    if (graph.openEdgesCount > 0) {
      errors.push(`Found ${graph.openEdgesCount} open boundary edges (unstitched cracks). Model is not watertight.`);
    }
    if (graph.nonManifoldEdgesCount > 0) {
      errors.push(`Found ${graph.nonManifoldEdgesCount} non-manifold edges (shared by > 2 faces).`);
    }
    if (graph.invertedOrientationsCount > 0) {
      errors.push(`Found ${graph.invertedOrientationsCount} edges with inverted normal traversals.`);
    }
    if (totalBoreSpanners > 0) {
      errors.push(`Found ${totalBoreSpanners} bore spanner faces plugging the thread holes.`);
    }
    if (graph.weirdFaces.length > 0) {
      warnings.push(`Found ${graph.weirdFaces.length} weird or degenerate faces.`);
    }

    const analysisDurationMs = performance.now() - tAnalysisStart;

    return {
      graph,
      shells,
      boundingBox,
      boreSpanners,
      totalBoreSpanners,
      frontPlanarFaces,
      isWatertight,
      is2Manifold,
      isValidSolid,
      errors,
      warnings,
      analysisDurationMs
    };
  }
}
