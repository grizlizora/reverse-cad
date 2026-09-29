// ==============================================================================
// src/standards/materials-metals.ts — Metallic Engineering Materials
// ==============================================================================

import { MaterialSpec } from './material-types.js';

export const METALS_MATERIALS: Record<string, MaterialSpec> = {
  steel: {
    id: 'steel',
    name: 'Stainless Steel 316L',
    category: 'metal',
    densityGcm3: 7.98,
    colorRgb: [0.75, 0.76, 0.78],
    transparency: 0.0,
    youngsModulusGpa: 193.0,
    poissonsRatio: 0.28,
    yieldStrengthMpa: 290.0,
    description: 'Austenitic corrosion-resistant stainless steel for fasteners and shafts.'
  },
  mild_steel: {
    id: 'mild_steel',
    name: 'Structural Carbon Steel (AISI 1020)',
    category: 'metal',
    densityGcm3: 7.85,
    colorRgb: [0.55, 0.55, 0.58],
    transparency: 0.0,
    youngsModulusGpa: 205.0,
    poissonsRatio: 0.29,
    yieldStrengthMpa: 350.0,
    description: 'General engineering carbon steel for structural brackets and frames.'
  },
  aluminum: {
    id: 'aluminum',
    name: 'Aluminum 6061-T6',
    category: 'metal',
    densityGcm3: 2.70,
    colorRgb: [0.82, 0.84, 0.86],
    transparency: 0.0,
    youngsModulusGpa: 68.9,
    poissonsRatio: 0.33,
    yieldStrengthMpa: 276.0,
    description: 'Aerospace & precision machined aluminum alloy with bright satin finish.'
  },
  brass: {
    id: 'brass',
    name: 'Machining Brass (CuZn39Pb3 / C36000)',
    category: 'metal',
    densityGcm3: 8.50,
    colorRgb: [0.85, 0.75, 0.25],
    transparency: 0.0,
    youngsModulusGpa: 105.0,
    poissonsRatio: 0.34,
    yieldStrengthMpa: 310.0,
    description: 'High-machinability brass for threaded inserts, bushings, and fittings.'
  },
  copper: {
    id: 'copper',
    name: 'Pure Copper (C11000 ETP)',
    category: 'metal',
    densityGcm3: 8.96,
    colorRgb: [0.85, 0.53, 0.40],
    transparency: 0.0,
    youngsModulusGpa: 117.0,
    poissonsRatio: 0.34,
    yieldStrengthMpa: 220.0,
    description: 'High thermal and electrical conductivity metal with reddish metallic luster.'
  },
  titanium: {
    id: 'titanium',
    name: 'Titanium Grade 5 (Ti-6Al-4V)',
    category: 'metal',
    densityGcm3: 4.43,
    colorRgb: [0.58, 0.58, 0.62],
    transparency: 0.0,
    youngsModulusGpa: 113.8,
    poissonsRatio: 0.34,
    yieldStrengthMpa: 880.0,
    description: 'Ultra-high strength-to-weight biocompatible alloy with gunmetal gray sheen.'
  }
};
