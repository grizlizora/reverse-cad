// ==============================================================================
// src/test/fixtures/metric-thread-visual-annotator.ts — Metric Thread Visual Annotations
// ==============================================================================

import { type HoleAnnotation, renderHoleAnnotationsSvg } from '../../utils/svg-hole-annotator.js';

export type { HoleAnnotation };
export { renderHoleAnnotationsSvg };

export const DEFAULT_METRIC_HOLES: HoleAnnotation[] = [
  { name: 'M3 (Bore: 2.44mm)', x: 9.47, y: 48.75, boreDia: 2.44 },
  { name: 'M4 (Bore: 3.28mm)', x: 20.41, y: 48.75, boreDia: 3.28 },
  { name: 'M5 (Bore: 4.16mm)', x: 32.16, y: 48.76, boreDia: 4.16 },
  { name: 'M6 (Bore: 4.98mm)', x: 44.75, y: 48.74, boreDia: 4.98 },
  { name: 'M8 (Bore: 6.78mm)', x: 58.65, y: 48.74, boreDia: 6.78 }
];
