// ==============================================================================
// src/stages/stage4-segmentation.ts — Analytical CAD Surface Segmentation Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/stages/segmentation/angular-metrics.ts (Polar sweep & circular gap metrics)
// - src/stages/segmentation/plane-clusterer.ts (Fast deterministic plane bucketing)
// - src/stages/segmentation/cylinder-ransac.ts (Localized in-place cylinder RANSAC)
// - src/stages/segmentation/coaxial-stitcher.ts (Coaxial cylinder arc stitching)
// ==============================================================================

export * from './segmentation/index.js';
