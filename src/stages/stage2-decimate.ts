// ==============================================================================
// src/stages/stage2-decimate.ts — Feature-Preserving Decimation Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/stages/decimation/mesh-csr.ts (Compressed Sparse Row mesh incidence)
// - src/stages/decimation/feature-shield.ts (5-Tier Feature Shield protection)
// - src/stages/decimation/coplanar-collapser.ts (Sliver-proof coplanar collapse)
// - src/stages/decimation/buffer-compactor.ts (Zero-GC typed array compaction)
// ==============================================================================

export * from './decimation/index.js';
