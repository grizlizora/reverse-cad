// ==============================================================================
// src/types/features.ts — Semantic CAD Engineering Features & JSON Schemas
// ==============================================================================

export type * from './features/holes.js';
export type * from './features/threads.js';
export type * from './features/cavities.js';
export type * from './features/mechanisms.js';
export type * from './features/materials.js';
export type * from './features/summary.js';

export {
  type HoleType,
  type CADHole
} from './features/holes.js';

export {
  type ThreadStandard,
  type ThreadHand,
  type CADThread
} from './features/threads.js';

export {
  type CADCavity,
  type CADPattern,
  type CADSlot
} from './features/cavities.js';

export {
  type CADKinematicJoint
} from './features/mechanisms.js';

export {
  type CADMaterialElement,
  type CADMaterialsSummary
} from './features/materials.js';

export {
  type CADFeaturesSummary,
  type CADFeaturesTopology
} from './features/summary.js';
