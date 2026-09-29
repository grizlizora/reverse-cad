// ==============================================================================
// src/standards/materials-optical.ts — Optical & Transparent Engineering Materials
// ==============================================================================

import { MaterialSpec } from './material-types.js';

export const OPTICAL_MATERIALS: Record<string, MaterialSpec> = {
  glass: {
    id: 'glass',
    name: 'Borosilicate Glass',
    category: 'glass',
    densityGcm3: 2.23,
    colorRgb: [0.90, 0.95, 1.00],
    transparency: 0.85,
    refractiveIndex: 1.52,
    youngsModulusGpa: 64.0,
    poissonsRatio: 0.20,
    description: 'High-transparency borosilicate glass for optical windows, lenses, and labware.'
  },
  soda_lime_glass: {
    id: 'soda_lime_glass',
    name: 'Soda-Lime Float Glass',
    category: 'glass',
    densityGcm3: 2.50,
    colorRgb: [0.88, 0.94, 0.92],
    transparency: 0.82,
    refractiveIndex: 1.51,
    youngsModulusGpa: 70.0,
    poissonsRatio: 0.22,
    description: 'Standard architectural and bottle container glass with subtle greenish tint.'
  },
  quartz: {
    id: 'quartz',
    name: 'Fused Quartz / Silica Glass',
    category: 'glass',
    densityGcm3: 2.20,
    colorRgb: [0.95, 0.97, 1.00],
    transparency: 0.92,
    refractiveIndex: 1.46,
    youngsModulusGpa: 72.0,
    poissonsRatio: 0.17,
    description: 'Ultra-pure fused silica with near-zero thermal expansion and high UV transmission.'
  },
  acrylic: {
    id: 'acrylic',
    name: 'Acrylic / PMMA (Plexiglass)',
    category: 'polymer',
    densityGcm3: 1.18,
    colorRgb: [0.93, 0.97, 1.00],
    transparency: 0.88,
    refractiveIndex: 1.49,
    youngsModulusGpa: 3.2,
    poissonsRatio: 0.35,
    description: 'Optically clear thermoplastic sheet and lens material.'
  },
  polycarbonate: {
    id: 'polycarbonate',
    name: 'Polycarbonate (PC Optical)',
    category: 'polymer',
    densityGcm3: 1.20,
    colorRgb: [0.89, 0.93, 0.97],
    transparency: 0.80,
    refractiveIndex: 1.58,
    youngsModulusGpa: 2.4,
    poissonsRatio: 0.37,
    description: 'Impact-resistant transparent polymer for safety visors and heavy-duty covers.'
  },
  silicone: {
    id: 'silicone',
    name: 'Silicone Elastomer',
    category: 'elastomer',
    densityGcm3: 1.15,
    colorRgb: [0.85, 0.88, 0.90],
    transparency: 0.40,
    refractiveIndex: 1.40,
    youngsModulusGpa: 0.005,
    poissonsRatio: 0.48,
    description: 'Heat-resistant semi-translucent flexible elastomer for gaskets and medical seals.'
  }
};
