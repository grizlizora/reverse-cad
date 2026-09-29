// ==============================================================================
// src/capabilities/pcd-pattern-engine.ts — Bolt Circle & PCD Clustering Engine Façade
// ==============================================================================
// Modularized for multi-threading, low latency, zero-GC, and strict sub-190 line compliance:
// - pcd-hole-normalizer.ts: Hole parameter normalization & unit vector enforcement
// - pcd-circle-clusterer.ts: PCD bolt circle clustering & FPU register rounding
// - pcd-geometry-matcher.ts: Orthonormal basis projection & polar coordinate analysis
// ==============================================================================

export { normalizeHole } from './pcd-hole-normalizer.js';
export {
  clusterNormalizedHoles,
  type PCDClusteringOptions
} from './pcd-circle-clusterer.js';
export type {
  NormalizedHole,
  HolePatternCluster
} from './pcd-geometry-matcher.js';
