// ==============================================================================
// src/standards/thread/iso-thread-data.ts — Built-in ISO Metric Thread Standards
// ISO 261 / ISO 724 / ISO 965-1 / DIN 13-1 static database for zero-IO execution
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export interface ISOThreadSpec {
  designation: string;
  nominalDiameter: number;
  pitch: number;
  tapDrillDiameter: number;
  pitchDiameter?: number;
  minorDiameterInternal?: number;
}

export interface ThreadCatalogFile {
  standard: string;
  name: string;
  version: string;
  threads: ISOThreadSpec[];
}

export const STATIC_ISO_METRIC_THREADS: ISOThreadSpec[] = [
  { designation: "M1x0.25", nominalDiameter: 1.0, pitch: 0.25, tapDrillDiameter: 0.75, pitchDiameter: 0.838, minorDiameterInternal: 0.729 },
  { designation: "M1.2x0.25", nominalDiameter: 1.2, pitch: 0.25, tapDrillDiameter: 0.95, pitchDiameter: 1.038, minorDiameterInternal: 0.929 },
  { designation: "M1.4x0.3", nominalDiameter: 1.4, pitch: 0.3, tapDrillDiameter: 1.1, pitchDiameter: 1.205, minorDiameterInternal: 1.075 },
  { designation: "M1.6x0.35", nominalDiameter: 1.6, pitch: 0.35, tapDrillDiameter: 1.25, pitchDiameter: 1.373, minorDiameterInternal: 1.221 },
  { designation: "M1.8x0.35", nominalDiameter: 1.8, pitch: 0.35, tapDrillDiameter: 1.45, pitchDiameter: 1.573, minorDiameterInternal: 1.421 },
  { designation: "M2x0.4", nominalDiameter: 2.0, pitch: 0.4, tapDrillDiameter: 1.6, pitchDiameter: 1.74, minorDiameterInternal: 1.567 },
  { designation: "M2.5x0.45", nominalDiameter: 2.5, pitch: 0.45, tapDrillDiameter: 2.05, pitchDiameter: 2.208, minorDiameterInternal: 2.013 },
  { designation: "M3x0.5", nominalDiameter: 3.0, pitch: 0.5, tapDrillDiameter: 2.5, pitchDiameter: 2.675, minorDiameterInternal: 2.459 },
  { designation: "M3.5x0.6", nominalDiameter: 3.5, pitch: 0.6, tapDrillDiameter: 2.9, pitchDiameter: 3.11, minorDiameterInternal: 2.85 },
  { designation: "M4x0.7", nominalDiameter: 4.0, pitch: 0.7, tapDrillDiameter: 3.3, pitchDiameter: 3.545, minorDiameterInternal: 3.242 },
  { designation: "M5x0.8", nominalDiameter: 5.0, pitch: 0.8, tapDrillDiameter: 4.2, pitchDiameter: 4.48, minorDiameterInternal: 4.134 },
  { designation: "M6x1.0", nominalDiameter: 6.0, pitch: 1.0, tapDrillDiameter: 5.0, pitchDiameter: 5.35, minorDiameterInternal: 4.917 },
  { designation: "M7x1.0", nominalDiameter: 7.0, pitch: 1.0, tapDrillDiameter: 6.0, pitchDiameter: 6.35, minorDiameterInternal: 5.917 },
  { designation: "M8x1.25", nominalDiameter: 8.0, pitch: 1.25, tapDrillDiameter: 6.8, pitchDiameter: 7.188, minorDiameterInternal: 6.647 },
  { designation: "M10x1.5", nominalDiameter: 10.0, pitch: 1.5, tapDrillDiameter: 8.5, pitchDiameter: 9.026, minorDiameterInternal: 8.376 },
  { designation: "M12x1.75", nominalDiameter: 12.0, pitch: 1.75, tapDrillDiameter: 10.2, pitchDiameter: 10.863, minorDiameterInternal: 10.106 },
  { designation: "M14x2.0", nominalDiameter: 14.0, pitch: 2.0, tapDrillDiameter: 12.0, pitchDiameter: 12.701, minorDiameterInternal: 11.835 },
  { designation: "M16x2.0", nominalDiameter: 16.0, pitch: 2.0, tapDrillDiameter: 14.0, pitchDiameter: 14.701, minorDiameterInternal: 13.835 },
  { designation: "M18x2.5", nominalDiameter: 18.0, pitch: 2.5, tapDrillDiameter: 15.5, pitchDiameter: 16.376, minorDiameterInternal: 15.294 },
  { designation: "M20x2.5", nominalDiameter: 20.0, pitch: 2.5, tapDrillDiameter: 17.5, pitchDiameter: 18.376, minorDiameterInternal: 17.294 },
  { designation: "M22x2.5", nominalDiameter: 22.0, pitch: 2.5, tapDrillDiameter: 19.5, pitchDiameter: 20.376, minorDiameterInternal: 19.294 },
  { designation: "M24x3.0", nominalDiameter: 24.0, pitch: 3.0, tapDrillDiameter: 21.0, pitchDiameter: 22.051, minorDiameterInternal: 20.752 },
  { designation: "M27x3.0", nominalDiameter: 27.0, pitch: 3.0, tapDrillDiameter: 24.0, pitchDiameter: 25.051, minorDiameterInternal: 23.752 },
  { designation: "M30x3.5", nominalDiameter: 30.0, pitch: 3.5, tapDrillDiameter: 26.5, pitchDiameter: 27.727, minorDiameterInternal: 26.211 },
  { designation: "M33x3.5", nominalDiameter: 33.0, pitch: 3.5, tapDrillDiameter: 29.5, pitchDiameter: 30.727, minorDiameterInternal: 29.211 },
  { designation: "M36x4.0", nominalDiameter: 36.0, pitch: 4.0, tapDrillDiameter: 32.0, pitchDiameter: 33.402, minorDiameterInternal: 31.67 },
  { designation: "M39x4.0", nominalDiameter: 39.0, pitch: 4.0, tapDrillDiameter: 35.0, pitchDiameter: 36.402, minorDiameterInternal: 34.67 },
  { designation: "M42x4.5", nominalDiameter: 42.0, pitch: 4.5, tapDrillDiameter: 37.5, pitchDiameter: 39.077, minorDiameterInternal: 37.129 },
  { designation: "M45x4.5", nominalDiameter: 45.0, pitch: 4.5, tapDrillDiameter: 40.5, pitchDiameter: 42.077, minorDiameterInternal: 40.129 },
  { designation: "M48x5.0", nominalDiameter: 48.0, pitch: 5.0, tapDrillDiameter: 43.0, pitchDiameter: 44.752, minorDiameterInternal: 42.587 },
  { designation: "M52x5.0", nominalDiameter: 52.0, pitch: 5.0, tapDrillDiameter: 47.0, pitchDiameter: 48.752, minorDiameterInternal: 46.587 },
  { designation: "M56x5.5", nominalDiameter: 56.0, pitch: 5.5, tapDrillDiameter: 50.5, pitchDiameter: 52.428, minorDiameterInternal: 50.046 },
  { designation: "M60x5.5", nominalDiameter: 60.0, pitch: 5.5, tapDrillDiameter: 54.5, pitchDiameter: 56.428, minorDiameterInternal: 54.046 },
  { designation: "M64x6.0", nominalDiameter: 64.0, pitch: 6.0, tapDrillDiameter: 58.0, pitchDiameter: 60.103, minorDiameterInternal: 57.505 }
];

let cachedCatalog: ISOThreadSpec[] | null = null;

/**
 * Loads the thread catalog with zero-IO in-memory baseline,
 * falling back to disk JSON only if custom overrides are detected.
 */
export function loadThreadCatalog(): ISOThreadSpec[] {
  if (cachedCatalog) return cachedCatalog;

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.join(currentDir, '..', 'iso_metric_threads.json'),
      path.join(currentDir, '..', '..', 'standards', 'iso_metric_threads.json'),
      path.join(process.cwd(), 'src', 'standards', 'iso_metric_threads.json')
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const jsonContent = fs.readFileSync(p, 'utf-8');
        const parsed: ThreadCatalogFile = JSON.parse(jsonContent);
        if (parsed.threads && parsed.threads.length > 0) {
          cachedCatalog = parsed.threads;
          return cachedCatalog;
        }
      }
    }
  } catch {
    // Zero-overhead fallback to static database
  }

  cachedCatalog = STATIC_ISO_METRIC_THREADS;
  return cachedCatalog;
}
