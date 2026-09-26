// ==============================================================================
// src/stages/profiling/index.ts — Unified Semantic CAD Feature Profiler
// ==============================================================================

import { RawMesh, SurfacePrimitive, PlaneSurface, MeshShell } from '../../types/geometry.js';
import { CADHole, CADThread, CADCavity, CADKinematicJoint, CADSlot } from '../../types/features.js';
import { detectHelicalThread, HelicalDetectionResult } from './thread-helical-detector.js';
import { detectKinematics, CandidateJoint, KinematicsResult } from './kinematics-detector.js';
import { profileHolesAndThreads, validateAndDeduplicateHoles } from './hole-counterbore-profiler.js';
import { scanPlanarCircularLoops } from './planar-loop-scanner.js';
import { classifyBlendSurfaces, CADFillet, CADChamfer } from './fillet-chamfer-classifier.js';
import { detectPositioningSlots } from './slot-notch-detector.js';
import { clusterBoltCirclePatterns, BoltCirclePattern } from './bolt-circle-clusterer.js';

export * from './thread-helical-detector.js';
export * from './kinematics-detector.js';
export * from './hole-counterbore-profiler.js';
export * from './planar-loop-scanner.js';
export * from './fillet-chamfer-classifier.js';
export * from './slot-notch-detector.js';
export * from './bolt-circle-clusterer.js';

export interface ProfilingOptions {
  inferTapDrillThreads?: boolean;
  detectHelicalThreads?: boolean;
}

export interface ProfilingResult {
  holes: CADHole[];
  threads: CADThread[];
  cavities: CADCavity[];
  kinematicJoints: CADKinematicJoint[];
  slots?: CADSlot[];
  chamfers?: CADChamfer[];
  fillets?: CADFillet[];
}

/**
 * Extracts high-level engineering features (holes, threads, cavities, kinematic joints)
 * from segmented surfaces and topological shells with strict feature disambiguation.
 */
export function profileFeatures(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  shells: MeshShell[],
  options: ProfilingOptions = {}
): ProfilingResult {
  // 1. Kinematics & Coaxial Clearance
  const { kinematicJoints, isHingeAssociatedCylinder } = detectKinematics(mesh, surfaces, shells);

  // 2. Internal & External Cylinders (Holes & Threads)
  const { holes: cylHoles, threads: cylThreads } = profileHolesAndThreads(
    mesh,
    surfaces,
    isHingeAssociatedCylinder,
    options
  );

  // 3. Planar Boundary Circular Loop Scanner
  const { holes: loopHoles, threads: loopThreads } = scanPlanarCircularLoops(
    mesh,
    surfaces,
    cylHoles.length,
    cylThreads.length
  );

  const rawHoles = [...cylHoles, ...loopHoles];
  const rawThreads = [...cylThreads, ...loopThreads];

  // 4. Validate & Deduplicate Holes
  const majorPlanes = surfaces.filter((s): s is PlaneSurface => s.type === 'plane' && s.area >= 5.0);
  const { finalHoles, finalThreads } = validateAndDeduplicateHoles(
    rawHoles,
    rawThreads,
    mesh,
    majorPlanes
  );

  // 5. Internal Cavities from Shells with Negative Volume
  const cavities: CADCavity[] = [];
  let cavityCounter = 0;
  for (let sIdx = 0; sIdx < shells.length; sIdx++) {
    const shell = shells[sIdx];
    if (shell.isCavity) {
      cavities.push({
        id: `cavity_${++cavityCounter}`,
        volumeMm3: Math.abs(shell.signedVolume),
        centerOfMass: shell.boundingBox.center,
        boundingBox: shell.boundingBox,
        isEnclosedVoid: true
      });
    }
  }

  // 6. Fillets and Chamfers
  const { fillets, chamfers } = classifyBlendSurfaces(mesh, surfaces);

  // 7. Transverse Slots & Notches
  const slots = detectPositioningSlots(mesh, shells);

  return {
    holes: finalHoles,
    threads: finalThreads,
    cavities,
    kinematicJoints,
    slots,
    chamfers,
    fillets
  };
}
