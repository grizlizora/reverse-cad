// ==============================================================================
// src/types/features/materials.ts — CAD Material Element & Summary Types
// ==============================================================================

export interface CADMaterialElement {
  bodyIndex: number;
  name: string;
  role: string;
  materialName: string;
  category: 'glass' | 'metal' | 'polymer' | 'elastomer' | 'composite' | 'mineral';
  densityGcm3: number;
  volumeMm3: number;
  massGrams: number;
  transparency: number;
  refractiveIndex?: number;
  youngsModulusGpa?: number;
  colorRgb: [number, number, number];
}

export interface CADMaterialsSummary {
  totalMassGrams: number;
  hasTransparentOptics: boolean;
  elements: CADMaterialElement[];
}
