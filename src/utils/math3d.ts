// ==============================================================================
// src/utils/math3d.ts — 3D Vector Math, Linear Algebra & Geometry Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/math/vec3.ts (Vector algebra, dot, cross, norm, direct primitives)
// - src/math/solvers-3d.ts (Cyclic Jacobi eigensolver, Tikhonov regularization)
// - src/math/mesh-buffers.ts (Packed geometry buffers, bounding box, Gauss divergence)
// - src/utils/mesh-transform.ts (Coordinate alignment & CAD viewer transformations)
// ==============================================================================

export * from '../math/index.js';
export * from './mesh-transform.js';
