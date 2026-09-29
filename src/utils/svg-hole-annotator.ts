// ==============================================================================
// src/utils/svg-hole-annotator.ts — SVG Annotator for B-Rep Hole Keepouts & Marks
// ==============================================================================

export interface HoleAnnotation {
  name: string;
  x: number;
  y: number;
  boreDia: number;
}

/**
 * Generates SVG markup for hole keepout circles and labels.
 */
export function renderHoleAnnotationsSvg(
  holes: HoleAnnotation[],
  toSvgX: (x: number) => number,
  toSvgY: (y: number) => number,
  scale: number
): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < holes.length; i++) {
    const h = holes[i];
    const cx = toSvgX(h.x);
    const cy = toSvgY(h.y);
    const rK = (h.boreDia * 0.5) * 0.70 * scale;
    chunks.push(`  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${rK.toFixed(2)}" class="keepout" />\n`);
    chunks.push(`  <circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4.5" class="center-pt" />\n`);
    chunks.push(`  <text x="${cx.toFixed(2)}" y="${(cy + rK + 22).toFixed(2)}" class="lbl">${h.name}</text>\n`);
    chunks.push(`  <text x="${cx.toFixed(2)}" y="${(cy + rK + 35).toFixed(2)}" class="sublbl">(X=${h.x}, Y=${h.y})</text>\n`);
  }
  return chunks;
}
