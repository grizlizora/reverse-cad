// ==============================================================================
// src/stages/stage5-profiling.ts — Semantic CAD Feature Profiling Façade
// ==============================================================================
// Re-exports from modular sub-libraries for 100% backward compatibility:
// - src/stages/profiling/thread-helical-detector.ts (Helical & catalog thread matching)
// - src/stages/profiling/kinematics-detector.ts (Print-in-Place kinematic joint profiler)
// - src/stages/profiling/hole-counterbore-profiler.ts (Hole, counterbore & wall thickness)
// - src/stages/profiling/planar-loop-scanner.ts (Planar boundary circular loop scanner)
// - src/stages/profiling/fillet-chamfer-classifier.ts (Fillet & 45° chamfer classifier)
// - src/stages/profiling/slot-notch-detector.ts (Transverse slot & notch profiler)
// - src/stages/profiling/bolt-circle-clusterer.ts (Bolt circle PCD pattern clusterer)
// ==============================================================================

export * from './profiling/index.js';
