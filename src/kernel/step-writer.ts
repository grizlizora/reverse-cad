// ==============================================================================
// src/kernel/step-writer.ts — Pure ISO 10303-21 STEP AP242 Generator Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/kernel/step/step-types.ts (Data structures, configs, synthesis reports)
// - src/kernel/step/step-id-allocator.ts (Deterministic entity ID allocator)
// - src/kernel/step/step-stream-writer.ts (256KB block-buffered disk streaming)
// - src/kernel/step/step-meta-builder.ts (Header, units, coordinate placements)
// - src/kernel/step/step-presentation-styles.ts (7-tier ISO 10303-46 styling & PMI)
// - src/kernel/step/step-analytical-surfaces.ts (PLANE, CYLINDRICAL_SURFACE)
// - src/kernel/step/step-brep-builder.ts (Multi-body B-Rep assembly & hierarchy)
// ==============================================================================

export * from './step/index.js';
