// ==============================================================================
// src/standards/materials-polymers.ts — Polymers, Elastomers & Composite Materials
// ==============================================================================

import { MaterialSpec } from './material-types.js';

export const POLYMERS_MATERIALS: Record<string, MaterialSpec> = {
  pla: {
    id: 'pla',
    name: 'PLA Thermoplastic (Polylactic Acid)',
    category: 'polymer',
    densityGcm3: 1.24,
    colorRgb: [0.15, 0.45, 0.85],
    transparency: 0.0,
    youngsModulusGpa: 3.5,
    poissonsRatio: 0.36,
    description: 'Standard rigid FDM/FFF 3D printing filament with crisp detail resolution.'
  },
  petg: {
    id: 'petg',
    name: 'PETG Copolymer',
    category: 'polymer',
    densityGcm3: 1.27,
    colorRgb: [0.15, 0.65, 0.45],
    transparency: 0.15,
    youngsModulusGpa: 2.1,
    poissonsRatio: 0.38,
    description: 'Tough, chemical-resistant polymer with semi-translucent properties.'
  },
  abs: {
    id: 'abs',
    name: 'ABS Engineering Resin',
    category: 'polymer',
    densityGcm3: 1.04,
    colorRgb: [0.92, 0.52, 0.12],
    transparency: 0.0,
    youngsModulusGpa: 2.3,
    poissonsRatio: 0.39,
    description: 'Impact-resistant production polymer for enclosures and automotive parts.'
  },
  nylon: {
    id: 'nylon',
    name: 'PA12 Nylon (Polyamide 12)',
    category: 'polymer',
    densityGcm3: 1.01,
    colorRgb: [0.90, 0.90, 0.92],
    transparency: 0.0,
    youngsModulusGpa: 1.7,
    poissonsRatio: 0.40,
    description: 'Wear-resistant semi-flexible engineering polymer for snap-fits and hinges.'
  },
  pom: {
    id: 'pom',
    name: 'POM / Polyacetal (Delrin)',
    category: 'polymer',
    densityGcm3: 1.41,
    colorRgb: [0.88, 0.88, 0.88],
    transparency: 0.0,
    youngsModulusGpa: 2.8,
    poissonsRatio: 0.35,
    description: 'Low-friction dimensional engineering plastic for gears, bearings, and pins.'
  },
  rubber: {
    id: 'rubber',
    name: 'Nitrile Rubber (NBR 70A)',
    category: 'elastomer',
    densityGcm3: 1.20,
    colorRgb: [0.18, 0.18, 0.18],
    transparency: 0.0,
    youngsModulusGpa: 0.01,
    poissonsRatio: 0.49,
    description: 'Synthetic rubber for oil-resistant seals, O-rings, and dampening pads.'
  },
  carbon_fiber: {
    id: 'carbon_fiber',
    name: 'Carbon Fiber Reinforced Polymer (CFRP)',
    category: 'composite',
    densityGcm3: 1.55,
    colorRgb: [0.20, 0.20, 0.22],
    transparency: 0.0,
    youngsModulusGpa: 140.0,
    poissonsRatio: 0.30,
    description: 'High-stiffness woven carbon fiber composite for structural lightweight frames.'
  }
};
