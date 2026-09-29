// ==============================================================================
// src/standards/material-types.ts — Engineering Material Specification Types
// ==============================================================================

export type MaterialCategory =
  | 'glass'
  | 'metal'
  | 'polymer'
  | 'elastomer'
  | 'composite'
  | 'mineral';

export interface MaterialSpec {
  id: string;
  name: string;
  category: MaterialCategory;
  densityGcm3: number;
  colorRgb: [number, number, number];
  transparency: number;
  refractiveIndex?: number;
  youngsModulusGpa?: number;
  poissonsRatio?: number;
  yieldStrengthMpa?: number;
  description: string;
}
