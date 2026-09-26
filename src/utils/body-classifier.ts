// ==============================================================================
// src/utils/body-classifier.ts — Topological Multi-Body Role Classifier Façade
// ==============================================================================

import { MeshShell } from '../types/geometry.js';
import { CADKinematicJoint } from '../types/features.js';
import { ClassifiedBody } from './body-strategies.js';
import { BodyClassificationEngine } from './body-classification-engine.js';

export {
  ClassifiedBody,
  BodyClassificationStrategy,
  MonolithicBodyStrategy,
  FoldingMechanismStrategy,
  SpatialDeterministicFallbackStrategy,
  DEFAULT_PALETTES
} from './body-strategies.js';

export { BodyClassificationEngine } from './body-classification-engine.js';

const defaultEngine = new BodyClassificationEngine();

/**
 * Classifies solid bodies topologically based on their kinematic graph and spatial relationships.
 * Guarantees 1:1 synchronization between STEP MANIFOLD_SOLID_BREP entities and CAD JSON metadata.
 */
export function classifySolidBodies(
  shells: MeshShell[],
  kinematicJoints: CADKinematicJoint[] = []
): ClassifiedBody[] {
  return defaultEngine.classify(shells, kinematicJoints);
}
