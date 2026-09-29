// ==============================================================================
// src/stages/segmentation/plane-clusterer.ts — Fast Planar Surface Clustering Façade
// ==============================================================================
// Modularized for multi-threading, low latency, zero-GC, and strict sub-190 line compliance:
// - plane-bucket-builder.ts: 50-bit normal spatial hashing & bucket generation
// - plane-inlier-extractor.ts: Invariant-hoisted plane sweep & inlier extraction
// - plane-feature-validator.ts: Minor plane quality gates & compact shape checks
// ==============================================================================

export * from './plane-bucket-builder.js';
export * from './plane-inlier-extractor.js';
