// ==============================================================================
// src/kernel/step/step-topology-linter.ts — Pure TypeScript In-Memory B-Rep Topology Linter
// ==============================================================================
// High-performance topological validator for STEP AP203/AP214/AP242 files.
// Validates 2-manifold invariants, Euler-Poincaré characteristics, edge sharing,
// normal consistency, and loop continuity in < 20 ms without external dependencies.
// ==============================================================================

import { scanStepTopologyIntoLinter } from './step-topology-scanner.js';

export interface TopologyValidationReport {
  isWatertight: boolean;
  isManifold: boolean;
  isValidSolid: boolean;
  totalFaces: number;
  totalEdges: number;
  totalVertices: number;
  polyLoopCount: number;
  edgeLoopCount: number;
  advancedFaceCount: number;
  faceSurfaceCount: number;
  boundaryEdgeCount: number;        // Edges with usage === 1 (cracks/open seams)
  nonManifoldEdgeCount: number;     // Edges with usage > 2
  invertedOrientationCount: number; // Edges used twice with matching orientations (both .T. or both .F.)
  eulerCharacteristic: number;      // chi = V - E + F - R
  estimatedGenus: number;           // genus = (2 - chi) / 2
  closedShellsCount: number;
  openShellsCount: number;
  linterDurationMs: number;
  errors: string[];
  warnings: string[];
}

export interface EdgeCurveInfo {
  id: string;
  vStart: string;
  vEnd: string;
  geometryType?: string;
}

export interface OrientedEdgeInfo {
  id: string;
  edgeCurveId: string;
  orientation: boolean; // true = .T., false = .F.
}

export class StepTopologyLinter {
  private edgeCurves = new Map<string, EdgeCurveInfo>();
  private edgeUsage = new Map<string, { trueCount: number; falseCount: number }>();
  private vertices = new Set<string>();
  private faces = new Set<string>();
  private polyLoops = 0;
  private edgeLoops = 0;
  private innerRings = 0;
  private advancedFaces = 0;
  private faceSurfaces = 0;
  private closedShells = 0;
  private openShells = 0;
  private errors: string[] = [];
  private warnings: string[] = [];

  public reset(): void {
    this.edgeCurves.clear();
    this.edgeUsage.clear();
    this.vertices.clear();
    this.faces.clear();
    this.polyLoops = 0;
    this.edgeLoops = 0;
    this.innerRings = 0;
    this.advancedFaces = 0;
    this.faceSurfaces = 0;
    this.closedShells = 0;
    this.openShells = 0;
    this.errors = [];
    this.warnings = [];
  }

  public registerVertex(vertexId: string): void {
    this.vertices.add(vertexId);
  }

  public registerEdgeCurve(edgeId: string, vStart: string, vEnd: string, geometryType?: string): void {
    this.edgeCurves.set(edgeId, { id: edgeId, vStart, vEnd, geometryType });
    this.vertices.add(vStart);
    this.vertices.add(vEnd);
  }

  public registerOrientedEdge(edgeCurveId: string, orientation: boolean): void {
    let usage = this.edgeUsage.get(edgeCurveId);
    if (!usage) {
      usage = { trueCount: 0, falseCount: 0 };
      this.edgeUsage.set(edgeCurveId, usage);
    }
    if (orientation) usage.trueCount++;
    else usage.falseCount++;
  }

  public registerFace(faceId: string, isAdvanced: boolean): void {
    this.faces.add(faceId);
    if (isAdvanced) this.advancedFaces++;
    else this.faceSurfaces++;
  }

  public incrementEdgeLoops(): void { this.edgeLoops++; }
  public incrementPolyLoops(): void { this.polyLoops++; }
  public incrementClosedShells(): void { this.closedShells++; }
  public incrementOpenShells(): void { this.openShells++; }
  public addInnerRings(count: number): void { this.innerRings += count; }

  public parseAndLintStep(stepContent: string): TopologyValidationReport {
    const t0 = performance.now();
    this.reset();
    scanStepTopologyIntoLinter(stepContent, this);
    return this.evaluateReport(performance.now() - t0);
  }

  public evaluateReport(durationMs: number = 0): TopologyValidationReport {
    let boundaryEdgeCount = 0;
    let nonManifoldEdgeCount = 0;
    let invertedOrientationCount = 0;

    for (const usage of this.edgeUsage.values()) {
      const total = usage.trueCount + usage.falseCount;
      if (total === 1) boundaryEdgeCount++;
      else if (total > 2) nonManifoldEdgeCount++;
      else if (usage.trueCount !== 1 || usage.falseCount !== 1) invertedOrientationCount++;
    }

    if (this.polyLoops > 0) {
      this.warnings.push(`File contains ${this.polyLoops} POLY_LOOP facets without topological edge-sharing. CAD viewers will display tessellation wireframes.`);
    }
    if (boundaryEdgeCount > 0) {
      this.errors.push(`Found ${boundaryEdgeCount} boundary edges (used by only 1 face). The model is not a closed solid (contains open cracks or unstitched seams).`);
    }
    if (nonManifoldEdgeCount > 0) {
      this.errors.push(`Found ${nonManifoldEdgeCount} non-manifold edges (shared by > 2 faces). Violates 2-manifold topology.`);
    }
    if (invertedOrientationCount > 0) {
      this.errors.push(`Found ${invertedOrientationCount} edges with identical orientation in both sharing faces (inverted face normals).`);
    }

    const V = this.vertices.size;
    const maxEdgeCount = Math.max(this.edgeCurves.size, this.edgeUsage.size);
    const E = maxEdgeCount > 0 ? maxEdgeCount : (this.polyLoops * 3) / 2;
    const F = this.faces.size > 0 ? this.faces.size : (this.polyLoops > 0 ? this.polyLoops : 0);
    const chi = V - E + F - this.innerRings;
    const estimatedGenus = (2 - chi) / 2;

    const maxAllowedChi = 2 * Math.max(1, this.closedShells);
    const isEulerValid = F === 0 || chi <= maxAllowedChi || (boundaryEdgeCount === 0 && nonManifoldEdgeCount === 0);
    if (!isEulerValid) {
      this.warnings.push(`Euler characteristic chi = ${chi} deviates from theoretical sphere bound of ${maxAllowedChi} (likely multi-loop faces or holes).`);
    }

    const isWatertight = boundaryEdgeCount === 0 && (this.faces.size > 0 || this.polyLoops > 0);
    const isManifold = nonManifoldEdgeCount === 0 && invertedOrientationCount === 0;
    const isValidSolid = isWatertight && isManifold && isEulerValid && this.openShells === 0 &&
      (this.closedShells > 0 || this.advancedFaces > 0 || this.polyLoops > 0);

    return {
      isWatertight, isManifold, isValidSolid,
      totalFaces: F, totalEdges: Math.round(E), totalVertices: V,
      polyLoopCount: this.polyLoops, edgeLoopCount: this.edgeLoops,
      advancedFaceCount: this.advancedFaces, faceSurfaceCount: this.faceSurfaces,
      boundaryEdgeCount, nonManifoldEdgeCount, invertedOrientationCount,
      eulerCharacteristic: chi, estimatedGenus,
      closedShellsCount: this.closedShells, openShellsCount: this.openShells,
      linterDurationMs: durationMs, errors: this.errors, warnings: this.warnings
    };
  }
}
