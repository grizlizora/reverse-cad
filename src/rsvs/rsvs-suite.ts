// ==============================================================================
// src/rsvs/rsvs-suite.ts — Reality Simulation & Verification Suite (RSVS)
// ==============================================================================

import { RawMesh, SurfacePrimitive, MeshShell } from '../types/geometry.js';
import { VerificationReport, GateStatus, GateResult } from '../types/verification.js';
import { ProfilingResult } from '../stages/stage5-profiling.js';
import { evaluateGate0, evaluateGate1, evaluateGate2, evaluateGate3, evaluateGate4 } from './gates.js';
import { generateBinaryHeatmapGlb } from './heatmap-glb.js';
import * as path from 'path';
import * as fs from 'fs';

import { StepBrepValidator } from '../kernel/step/step-brep-validator.js';

export * from './heatmap-glb.js';

export interface RSVSExecutionOptions {
  outputDir: string;
  baseFileName: string;
  isClosedSolid: boolean;
  openEdgesCount: number;
  degenerateCount: number;
  eulerCharacteristic: number;
  heatmapMode?: 'failed-only' | 'always' | 'none';
  rawMesh?: RawMesh;
  rawMassProps?: { centerOfMass: [number, number, number]; volumeMm3: number };
  stepFilePath?: string;
  skipReportFile?: boolean;
}

/**
 * Runs RSVS evaluation completely in-memory without disk I/O.
 */
export function runRSVSInMemory(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  profiling: ProfilingResult,
  options: {
    baseFileName: string;
    isClosedSolid: boolean;
    openEdgesCount: number;
    degenerateCount: number;
    eulerCharacteristic: number;
    rawMesh?: RawMesh;
    rawMassProps?: { centerOfMass: [number, number, number]; volumeMm3: number };
    stepFilePath?: string;
  }
): { report: VerificationReport; gatesList: GateResult[]; hasFailed: boolean; hasWarning: boolean } {
  const startTime = Date.now();

  let stepValidation: any = undefined;
  if (options.stepFilePath && fs.existsSync(options.stepFilePath)) {
    try {
      const validator = new StepBrepValidator();
      const stepRep = validator.validate(options.stepFilePath, { geometricTolerance: 1e-4 });
      stepValidation = {
        isWatertight: stepRep.isWatertight,
        is2Manifold: stepRep.is2Manifold,
        openEdgesCount: stepRep.openEdgesCount,
        nonManifoldEdgesCount: stepRep.nonManifoldEdgesCount,
        invertedOrientationsCount: stepRep.invertedOrientationsCount,
        totalBoreSpanners: stepRep.totalBoreSpanners,
        shellsCount: stepRep.detectedShellsCount
      };
    } catch {}
  }

  const gate0 = evaluateGate0(mesh, options.openEdgesCount, options.degenerateCount, options.eulerCharacteristic, shells.length);
  const gate1 = evaluateGate1(mesh, surfaces);
  const gate2 = evaluateGate2(profiling);
  const gate3 = evaluateGate3(options.isClosedSolid, stepValidation);
  const gate4 = evaluateGate4(mesh, surfaces, shells, {
    sampleCount: 3000,
    rawMesh: options.rawMesh,
    rawMassProps: options.rawMassProps,
    hasThreads: profiling.threads && profiling.threads.length > 0
  });

  const gatesList = [gate0, gate1, gate2, gate3, gate4];
  const hasFailed = gatesList.some(g => g.status === 'FAILED');
  const hasWarning = gatesList.some(g => g.status === 'WARNING');
  const overallStatus: GateStatus = hasFailed ? 'FAILED' : hasWarning ? 'WARNING' : 'PASSED';

  const report: VerificationReport = {
    file: options.baseFileName,
    timestamp: new Date().toISOString(),
    overallStatus,
    processingTimeMs: Date.now() - startTime,
    gates: {
      gate0,
      gate1,
      gate2,
      gate3,
      gate4
    },
    summary: {
      allGatesPassed: !hasFailed,
      criticalDefectsCount: gatesList.filter(g => g.status === 'FAILED').length,
      warningsCount: gatesList.filter(g => g.status === 'WARNING').length,
      heatmapGlbGenerated: false
    }
  };

  return { report, gatesList, hasFailed, hasWarning };
}

/**
 * Saves RSVS artifacts (JSON report and binary GLB heatmap) to disk.
 */
export async function saveRSVSArtifacts(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  report: VerificationReport,
  hasFailed: boolean,
  options: RSVSExecutionOptions
): Promise<void> {
  const shouldGenerateHeatmap =
    options.heatmapMode === 'always' || (options.heatmapMode === 'failed-only' && hasFailed);

  let heatmapPath: string | undefined;
  if (shouldGenerateHeatmap) {
    heatmapPath = path.join(options.outputDir, `${options.baseFileName}.heatmap.glb`);
    const glbBuffer = generateBinaryHeatmapGlb(mesh, surfaces);
    await fs.promises.writeFile(heatmapPath, glbBuffer);
    report.summary.heatmapGlbGenerated = true;
    report.summary.heatmapPath = heatmapPath;
  }

  if (!options.skipReportFile) {
    const reportPath = path.join(options.outputDir, `${options.baseFileName}.verification_report.json`);
    await fs.promises.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  }
}

/**
 * Runs the complete 5-gate Reality Simulation & Verification Suite.
 */
export async function runRSVS(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  profiling: ProfilingResult,
  options: RSVSExecutionOptions
): Promise<VerificationReport> {
  const { report, hasFailed } = runRSVSInMemory(mesh, surfaces, shells, profiling, options);
  await saveRSVSArtifacts(mesh, surfaces, report, hasFailed, options);
  return report;
}
