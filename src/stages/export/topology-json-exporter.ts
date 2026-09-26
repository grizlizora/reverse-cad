// ==============================================================================
// src/stages/export/topology-json-exporter.ts — Chunked Streaming Topology JSON Exporter
// ==============================================================================

import { SurfacePrimitive } from '../../types/geometry.js';
import { CADFeaturesSummary } from '../../types/features.js';
import { ProfilingResult } from '../stage5-profiling.js';
import * as fs from 'fs';

/**
 * Streams detailed topology JSON with O(1) heap overhead.
 */
export async function exportTopologyJsonStream(
  summary: CADFeaturesSummary,
  surfaces: SurfacePrimitive[],
  profiling: ProfilingResult,
  outputPath: string
): Promise<void> {
  const writeStream = fs.createWriteStream(outputPath, { encoding: 'utf8', highWaterMark: 64 * 1024 });

  const writeChunk = (chunk: string): Promise<void> => {
    if (!writeStream.write(chunk)) {
      return new Promise<void>(resolve => writeStream.once('drain', resolve));
    }
    return Promise.resolve();
  };

  await writeChunk('{\n');
  await writeChunk(`  "summary": ${JSON.stringify(summary, null, 2).replace(/\n/g, '\n  ')},\n`);

  // Stream surfaces
  await writeChunk('  "surfaces": [\n');
  for (let i = 0; i < surfaces.length; i++) {
    const isLast = i === surfaces.length - 1;
    const surfJson = JSON.stringify(surfaces[i]);
    await writeChunk(`    ${surfJson}${isLast ? '' : ','}\n`);
  }
  await writeChunk('  ],\n');

  // Stream cavitiesDetail
  await writeChunk(`  "cavitiesDetail": ${JSON.stringify(profiling.cavities)},\n`);

  // Stream kinematicJoints
  await writeChunk(`  "kinematicJoints": ${JSON.stringify(profiling.kinematicJoints)}\n`);

  await writeChunk('}\n');

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
