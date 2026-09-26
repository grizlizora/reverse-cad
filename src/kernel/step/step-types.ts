// ==============================================================================
// src/kernel/step/step-types.ts — STEP AP242 Data Structures & Options
// ==============================================================================

import { MeshShell } from '../../types/geometry.js';
import { CADKinematicJoint } from '../../types/features.js';

export interface SolidBodyConfig {
  name: string;
  colorRgb?: [number, number, number]; // [R, G, B] normalized 0.0 .. 1.0
  colorLabel?: string;
}

export interface StepBoundingBox {
  min: [number, number, number];
  max: [number, number, number];
  dimensions: [number, number, number];
  center: [number, number, number];
  diagonal: number;
}

export interface StepSolidBodyMetadata {
  name: string;
  volumeMm3: number;
  surfaceAreaMm2: number;
  boundingBox: StepBoundingBox;
}

export interface StepBRepSynthesisReport {
  totalVolumeMm3: number;
  totalSurfaceAreaMm2: number;
  boundingBox: StepBoundingBox;
  solidBodies: StepSolidBodyMetadata[];
}

export interface StepWriterOptions {
  modelName?: string;
  author?: string;
  organization?: string;
  shells?: MeshShell[];
  bodyConfigs?: SolidBodyConfig[];
  kinematicJoints?: CADKinematicJoint[];
}

export interface DefaultPaletteEntry {
  name: string;
  colorLabel: string;
  rgb: [number, number, number];
}

export const DEFAULT_BODY_PALETTE: DefaultPaletteEntry[] = [
  { name: 'Body_1_Base', colorLabel: 'Base Slate Gray', rgb: [0.60, 0.60, 0.62] },
  { name: 'Body_2_Arm', colorLabel: 'Arm Mechanical Blue', rgb: [0.15, 0.45, 0.85] },
  { name: 'Body_3_Strut', colorLabel: 'Strut Safety Orange', rgb: [0.95, 0.50, 0.10] },
  { name: 'Body_4_Link', colorLabel: 'Link Forest Green', rgb: [0.15, 0.65, 0.35] },
  { name: 'Body_5_Pin', colorLabel: 'Pin Amber Gold', rgb: [0.90, 0.70, 0.15] },
  { name: 'Body_6_Coupler', colorLabel: 'Coupler Violet', rgb: [0.60, 0.25, 0.75] },
  { name: 'Body_7_Guide', colorLabel: 'Guide Cyan', rgb: [0.10, 0.70, 0.75] },
  { name: 'Body_8_Clamp', colorLabel: 'Clamp Crimson', rgb: [0.85, 0.20, 0.25] }
];
