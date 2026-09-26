// ==============================================================================
// src/kernel/step/step-presentation-styles.ts — ISO 10303-46 Presentation Styles
// ==============================================================================

import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { SolidBodyConfig } from './step-types.js';
import { CADThread } from '../../types/features.js';

/**
 * Generates full 7-tier ISO 10303-46 presentation style assignment for a given color.
 */
export async function createPresentationStyle(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  name: string,
  r: number,
  g: number,
  b: number
): Promise<string> {
  const colourId = allocator.nextId();
  await writer.writeLine(`${colourId} = COLOUR_RGB('${name}', ${r.toFixed(4)}, ${g.toFixed(4)}, ${b.toFixed(4)});`);
  const fillColourId = allocator.nextId();
  await writer.writeLine(`${fillColourId} = FILL_AREA_STYLE_COLOUR('', ${colourId});`);
  const fillStyleId = allocator.nextId();
  await writer.writeLine(`${fillStyleId} = FILL_AREA_STYLE('', (${fillColourId}));`);
  const surfFillId = allocator.nextId();
  await writer.writeLine(`${surfFillId} = SURFACE_STYLE_FILL_AREA(${fillStyleId});`);
  const sideStyleId = allocator.nextId();
  await writer.writeLine(`${sideStyleId} = SURFACE_SIDE_STYLE('', (${surfFillId}));`);
  const usageId = allocator.nextId();
  await writer.writeLine(`${usageId} = SURFACE_STYLE_USAGE(.BOTH., ${sideStyleId});`);
  const presStyleId = allocator.nextId();
  await writer.writeLine(`${presStyleId} = PRESENTATION_STYLE_ASSIGNMENT((${usageId}));`);
  return presStyleId;
}

/**
 * Emits presentation styles for each solid body.
 */
export async function writeBodyPresentationStyles(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  bodyDefinitions: SolidBodyConfig[]
): Promise<string[]> {
  const styles: string[] = [];
  for (let i = 0; i < bodyDefinitions.length; i++) {
    const bDef = bodyDefinitions[i];
    const rgb = bDef.colorRgb ?? [0.70, 0.70, 0.72];
    const label = bDef.colorLabel ?? `${bDef.name} Style`;
    const styleId = await createPresentationStyle(writer, allocator, label, rgb[0], rgb[1], rgb[2]);
    styles.push(styleId);
  }
  return styles;
}

/**
 * Emits AP242 Semantic PMI thread presentation layers.
 */
export async function writeThreadLayers(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  threads: CADThread[],
  primarySolidId: string
): Promise<void> {
  if (!threads || threads.length === 0 || !primarySolidId) return;

  for (let i = 0; i < threads.length; i++) {
    const t = threads[i];
    const layerId = allocator.nextId();
    const layerName = `THREADS_${t.designation}`;
    const layerDesc = `ISO Metric Thread ${t.designation} (Nominal: ${t.nominalDiameter}mm, Pitch: ${t.pitch}mm, Drill: ${t.tapDrillDiameter}mm)`;
    await writer.writeLine(`${layerId} = PRESENTATION_LAYER_ASSIGNMENT('${layerName}', '${layerDesc}', (${primarySolidId}));`);
  }
}

/**
 * Emits MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION container.
 */
export async function writePresentationRepresentation(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  styledItemIds: string[],
  contextId: string
): Promise<void> {
  if (styledItemIds.length === 0) return;
  const CHUNK_SIZE = 10;
  const presRepId = allocator.nextId();
  await writer.writeLine(`${presRepId} = MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('Model Appearances', (`);
  for (let s = 0; s < styledItemIds.length; s += CHUNK_SIZE) {
    const chunk = styledItemIds.slice(s, s + CHUNK_SIZE).join(', ');
    const isLast = s + CHUNK_SIZE >= styledItemIds.length;
    await writer.writeLine(`  ${chunk}${isLast ? '' : ','}`);
  }
  await writer.writeLine(`), ${contextId});`);
}
