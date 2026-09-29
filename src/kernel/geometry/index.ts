// ==============================================================================
// src/kernel/geometry/index.ts — Unified Computational Geometry Façade
// ==============================================================================

export {
  type PolygonAABB2D,
  computeSignedArea2D,
  computePolygonArea2D,
  computePolygonAABB2D,
  isAABBContained2D,
  segmentsIntersect2D,
  isPointInPolygon2D,
  isLoopContainedInOuter2D,
  isLoopInsidePolygon2D
} from './polygon2d-primitives.js';

export {
  isPolygonSimple2D,
  type PolygonSimplicityOptions
} from './polygon2d-simplicity.js';

export {
  assignHolesToEnclosingOuters,
  type ContainmentForestNode,
  buildPolygonContainmentForest
} from './polygon-containment-forest.js';

export {
  simplifyCollinearLoop2D
} from './polygon-collinear-simplifier.js';

export {
  extractBoundaryHalfEdgeAdjacency,
  traceKeepLeftJordanCycles2D
} from './halfedge-pinch-tracer.js';
