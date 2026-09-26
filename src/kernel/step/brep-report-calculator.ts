// ==============================================================================
// src/kernel/step/brep-report-calculator.ts — B-Rep Synthesis Report Calculator
// ==============================================================================

import { ShellMetricResult } from './brep-mesh-metrics.js';
import { SolidBodyConfig, StepSolidBodyMetadata, StepBRepSynthesisReport } from './step-types.js';

export class BRepReportAggregator {
  private globalMinX = Infinity;
  private globalMinY = Infinity;
  private globalMinZ = Infinity;
  private globalMaxX = -Infinity;
  private globalMaxY = -Infinity;
  private globalMaxZ = -Infinity;
  private globalTotalVol = 0;
  private globalTotalArea = 0;
  private solidBodiesMeta: StepSolidBodyMetadata[] = [];

  public addShell(metrics: ShellMetricResult, bDef: SolidBodyConfig): void {
    const sMin = metrics.boundingBox.min;
    const sMax = metrics.boundingBox.max;
    if (sMin[0] < this.globalMinX) this.globalMinX = sMin[0];
    if (sMin[1] < this.globalMinY) this.globalMinY = sMin[1];
    if (sMin[2] < this.globalMinZ) this.globalMinZ = sMin[2];
    if (sMax[0] > this.globalMaxX) this.globalMaxX = sMax[0];
    if (sMax[1] > this.globalMaxY) this.globalMaxY = sMax[1];
    if (sMax[2] > this.globalMaxZ) this.globalMaxZ = sMax[2];

    this.globalTotalVol += metrics.volumeMm3;
    this.globalTotalArea += metrics.surfaceAreaMm2;

    this.solidBodiesMeta.push({
      name: bDef.name,
      volumeMm3: parseFloat(metrics.volumeMm3.toFixed(3)),
      surfaceAreaMm2: parseFloat(metrics.surfaceAreaMm2.toFixed(3)),
      boundingBox: {
        min: [parseFloat(sMin[0].toFixed(4)), parseFloat(sMin[1].toFixed(4)), parseFloat(sMin[2].toFixed(4))],
        max: [parseFloat(sMax[0].toFixed(4)), parseFloat(sMax[1].toFixed(4)), parseFloat(sMax[2].toFixed(4))],
        center: [
          parseFloat(metrics.boundingBox.center[0].toFixed(4)),
          parseFloat(metrics.boundingBox.center[1].toFixed(4)),
          parseFloat(metrics.boundingBox.center[2].toFixed(4))
        ],
        dimensions: [
          parseFloat(metrics.boundingBox.dimensions[0].toFixed(4)),
          parseFloat(metrics.boundingBox.dimensions[1].toFixed(4)),
          parseFloat(metrics.boundingBox.dimensions[2].toFixed(4))
        ],
        diagonal: parseFloat(metrics.boundingBox.diagonal.toFixed(4))
      }
    });
  }

  public buildReport(): StepBRepSynthesisReport {
    const globalAabbDiagonal = Math.hypot(
      this.globalMaxX - this.globalMinX,
      this.globalMaxY - this.globalMinY,
      this.globalMaxZ - this.globalMinZ
    );

    return {
      totalVolumeMm3: parseFloat(this.globalTotalVol.toFixed(4)),
      totalSurfaceAreaMm2: parseFloat(this.globalTotalArea.toFixed(4)),
      boundingBox: {
        min: [parseFloat(this.globalMinX.toFixed(4)), parseFloat(this.globalMinY.toFixed(4)), parseFloat(this.globalMinZ.toFixed(4))],
        max: [parseFloat(this.globalMaxX.toFixed(4)), parseFloat(this.globalMaxY.toFixed(4)), parseFloat(this.globalMaxZ.toFixed(4))],
        dimensions: [
          parseFloat((this.globalMaxX - this.globalMinX).toFixed(4)),
          parseFloat((this.globalMaxY - this.globalMinY).toFixed(4)),
          parseFloat((this.globalMaxZ - this.globalMinZ).toFixed(4))
        ],
        center: [
          parseFloat(((this.globalMinX + this.globalMaxX) * 0.5).toFixed(4)),
          parseFloat(((this.globalMinY + this.globalMaxY) * 0.5).toFixed(4)),
          parseFloat(((this.globalMinZ + this.globalMaxZ) * 0.5).toFixed(4))
        ],
        diagonal: parseFloat(globalAabbDiagonal.toFixed(4))
      },
      solidBodies: this.solidBodiesMeta
    };
  }
}
