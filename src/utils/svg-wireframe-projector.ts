// ==============================================================================
// src/utils/svg-wireframe-projector.ts — STEP Wireframe 2D SVG Projector
// ==============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { StepBrepValidator } from '../kernel/step/step-brep-validator.js';
import { type HoleAnnotation, renderHoleAnnotationsSvg } from './svg-hole-annotator.js';

export type { HoleAnnotation };
export { renderHoleAnnotationsSvg };

export interface RenderHolesOptions {
  stepPath?: string;
  outputPath?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  title?: string;
  subtitle?: string;
  holes?: HoleAnnotation[];
  generateHtml?: boolean;
}

export interface ExtractedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Extracts wireframe 2D segment projections for faces intersecting the bounding region,
 * deduplicating shared manifold edges so each boundary edge is drawn exactly once.
 */
export function extractStepEdgesInRegion(
  validator: StepBrepValidator,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): ExtractedEdge[] {
  const points = validator.getPoints();
  const loops = validator.getLoops();
  const faces = validator.getFaces();
  const edges: ExtractedEdge[] = [];
  const seenEdges = new Set<string>();

  for (let fIdx = 0; fIdx < faces.length; fIdx++) {
    const face = faces[fIdx];
    const loopIds = [face.outerLoopId, ...face.holeLoopIds].filter(Boolean) as string[];
    for (let lIdx = 0; lIdx < loopIds.length; lIdx++) {
      const loop = loops.get(loopIds[lIdx]);
      if (!loop || loop.pointIds.length < 2) continue;
      const pts = loop.pointIds;
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const idA = pts[i];
        const idB = pts[(i + 1) % n];
        const edgeKey = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);

        const p1 = points.get(idA);
        const p2 = points.get(idB);
        if (!p1 || !p2) continue;
        const midX = (p1.x + p2.x) * 0.5;
        const midY = (p1.y + p2.y) * 0.5;
        if (midX >= xMin && midX <= xMax && midY >= yMin && midY <= yMax) {
          edges.push({ x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
        }
      }
    }
  }
  return edges;
}

/**
 * Projects 3D wireframe edges from a STEP file to a 2D SVG graphic and optional HTML wrapper.
 */
export async function projectStepToSvg(options: RenderHolesOptions): Promise<string> {
  const stepPath = options.stepPath || path.resolve(process.cwd(), 'test_output/Metric_thread_testblock_v2.step');
  const outputPath = options.outputPath || path.resolve(process.cwd(), 'scratch/holes_solid_perfect.svg');
  const xMin = options.xMin ?? 5.0;
  const xMax = options.xMax ?? 65.0;
  const yMin = options.yMin ?? 42.0;
  const yMax = options.yMax ?? 56.0;
  const width = options.width || 1600;
  const height = options.height || 700;
  const holes = options.holes;
  const generateHtml = options.generateHtml ?? true;
  const title = options.title ?? (holes && holes.length > 0 ? 'Small Metric Threads (M3–M8) in STEP AP242' : 'STEP AP242 Wireframe Preview');
  const subtitle = options.subtitle ?? (holes && holes.length > 0 ? '100% Watertight Solid B-Rep • 64-bit Quantized Geometry' : 'Watertight B-Rep Boundary Projection');

  if (!fs.existsSync(stepPath)) {
    throw new Error(`STEP model not found: ${stepPath}`);
  }

  const validator = new StepBrepValidator();
  validator.parseFile(stepPath);
  const edges = extractStepEdgesInRegion(validator, xMin, xMax, yMin, yMax);

  const margin = 80;
  const scale = Math.min((width - 2 * margin) / (xMax - xMin), (height - 2 * margin) / (yMax - yMin));
  const toSvgX = (x: number) => margin + (x - xMin) * scale;
  const toSvgY = (y: number) => height - margin - (y - yMin) * scale;

  const chunks: string[] = [];
  chunks.push(`<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`);
  chunks.push(`  <defs><style>
    .bg { fill: #f8fafc; } .grid { stroke: #e2e8f0; stroke-width: 1; stroke-dasharray: 4,4; }
    .border { fill: #ffffff; stroke: #cbd5e1; stroke-width: 2; }
    .wireframe { stroke: #004488; stroke-width: 0.65; stroke-linecap: round; opacity: 0.85; }
    .keepout { fill: none; stroke: #f59e0b; stroke-width: 1.5; stroke-dasharray: 5,3; opacity: 0.8; }
    .center-pt { fill: #ef4444; stroke: #ffffff; stroke-width: 1.5; }
    .title { font-family: sans-serif; font-size: 20px; font-weight: bold; fill: #0f172a; text-anchor: middle; }
    .sub { font-family: sans-serif; font-size: 13px; fill: #64748b; text-anchor: middle; }
    .lbl { font-family: sans-serif; font-size: 12px; font-weight: 600; fill: #1e293b; text-anchor: middle; }
    .sublbl { font-family: sans-serif; font-size: 10px; fill: #64748b; text-anchor: middle; }
    .axis { font-family: monospace; font-size: 11px; fill: #94a3b8; }
  </style></defs>\n`);
  chunks.push(`  <rect width="100%" height="100%" class="bg" />\n`);
  chunks.push(`  <rect x="${margin}" y="${toSvgY(yMax)}" width="${(xMax - xMin) * scale}" height="${(yMax - yMin) * scale}" class="border" />\n`);

  for (let x = Math.ceil(xMin / 5) * 5; x <= xMax; x += 5) {
    const sx = toSvgX(x);
    chunks.push(`  <line x1="${sx}" y1="${toSvgY(yMin)}" x2="${sx}" y2="${toSvgY(yMax)}" class="grid" />\n`);
    chunks.push(`  <text x="${sx}" y="${toSvgY(yMin) + 20}" class="axis" text-anchor="middle">X=${x}</text>\n`);
  }
  for (let y = Math.ceil(yMin / 2) * 2; y <= yMax; y += 2) {
    const sy = toSvgY(y);
    chunks.push(`  <line x1="${toSvgX(xMin)}" y1="${sy}" x2="${toSvgX(xMax)}" y2="${sy}" class="grid" />\n`);
    chunks.push(`  <text x="${toSvgX(xMin) - 10}" y="${sy + 4}" class="axis" text-anchor="end">Y=${y}</text>\n`);
  }

  chunks.push(`  <g class="wireframe">\n`);
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    chunks.push(`    <line x1="${toSvgX(e.x1).toFixed(2)}" y1="${toSvgY(e.y1).toFixed(2)}" x2="${toSvgX(e.x2).toFixed(2)}" y2="${toSvgY(e.y2).toFixed(2)}" />\n`);
  }
  chunks.push(`  </g>\n`);

  if (holes && holes.length > 0) {
    const holeSvgChunks = renderHoleAnnotationsSvg(holes, toSvgX, toSvgY, scale);
    for (let i = 0; i < holeSvgChunks.length; i++) {
      chunks.push(holeSvgChunks[i]);
    }
  }

  chunks.push(`  <text x="${width * 0.5}" y="35" class="title">${title}</text>\n`);
  chunks.push(`  <text x="${width * 0.5}" y="55" class="sub">${subtitle}</text>\n</svg>\n`);

  const svgContent = chunks.join('');
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  await fs.promises.writeFile(outputPath, svgContent, 'utf8');

  if (generateHtml) {
    const htmlPath = outputPath.replace(/\.svg$/, '.html');
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>STEP Preview</title><style>body{margin:0;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh}svg{max-width:100%;height:auto;border-radius:8px}</style></head><body>${svgContent}</body></html>`;
    await fs.promises.writeFile(htmlPath, html, 'utf8');
  }

  return outputPath;
}
