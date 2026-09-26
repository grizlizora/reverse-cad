// ==============================================================================
// src/stages/stage3-sanitize.ts — Topology Sanitization Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/stages/sanitization/degenerate-filter.ts (Zero-area triangle removal)
// - src/stages/sanitization/spatial-sewer.ts (O(K) 3D spatial hash micro-sewing)
// - src/stages/sanitization/topology-report.ts (Edge connectivity & Euler invariants)
// - src/stages/sanitization/shell-decomposer.ts (BFS connected shell extraction)
// ==============================================================================

export * from './sanitization/index.js';
