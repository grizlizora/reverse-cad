// ==============================================================================
// src/stages/profiling/planar-loop-scanner.ts — Planar Circular Loop Thread & Hole Scanner
// ==============================================================================

import { RawMesh, SurfacePrimitive, PlaneSurface, Point3D, Vector3D } from '../../types/geometry.js';
import { CADHole, CADThread } from '../../types/features.js';
import { matchMetricThread, matchTappedHolePair } from '../../standards/thread-catalog.js';
import { UniformVoxelGrid3D } from './spatial/voxel-grid.js';
import { tracePlanarLoops, PlanarBoundaryLoop } from './loop-mesh-tracer.js';

export interface PlanarScanResult {
  holes: CADHole[];
  threads: CADThread[];
}

/**
 * Detects physically modeled helical threads that have 60-degree angled flutes
 * or internal holes on planar surfaces via circular boundary loop extraction.
 * Uses 3D spatial voxel indexing to eliminate O(L * V) unindexed vertex sweeps.
 */
export function scanPlanarCircularLoops(
  mesh: RawMesh,
  surfaces: SurfacePrimitive[],
  startHoleId: number = 0,
  startThreadId: number = 0
): PlanarScanResult {
  const holes: CADHole[] = [];
  const threads: CADThread[] = [];
  let holeCounter = startHoleId;
  let threadCounter = startThreadId;

  const majorPlanes = surfaces.filter((s): s is PlaneSurface => s.type === 'plane' && s.area >= 5.0);
  const pos = mesh.positions;
  const idx = mesh.indices;
  const meshBBox = mesh.boundingBox;
  const vCount = mesh.vertexCount;
  const maxExt = Math.max(...meshBBox.dimensions);

  // Initialize fast spatial voxel grid for O(1) local cylinder queries
  const voxelGrid = new UniformVoxelGrid3D(pos, vCount, meshBBox, 12.0);

  for (const plane of majorPlanes) {
    const inliers = plane.inlierIndices;
    if (!inliers || inliers.length < 20) continue;

    const [nx, ny, nz] = plane.normal;
    const loops: PlanarBoundaryLoop[] = tracePlanarLoops(inliers, idx, pos, plane.normal, 12);

    for (let lIdx = 0; lIdx < loops.length; lIdx++) {
      const loop = loops[lIdx];
      if (loop.roundness < 0.88 || loop.averageRadius < 0.8 || loop.averageRadius > 40.0) continue;

      const [cx, cy, cz] = loop.center;
      // Axis pointing into the solid body
      const ax = -nx, ay = -ny, az = -nz;
      const probeR = loop.averageRadius + 0.35;

      const b0x = cx, b0y = cy, b0z = cz;
      const b1x = cx + ax * maxExt, b1y = cy + ay * maxExt, b1z = cz + az * maxExt;
      const minX = Math.min(b0x, b1x) - probeR - 0.5, maxX = Math.max(b0x, b1x) + probeR + 0.5;
      const minY = Math.min(b0y, b1y) - probeR - 0.5, maxY = Math.max(b0y, b1y) + probeR + 0.5;
      const minZ = Math.min(b0z, b1z) - probeR - 0.5, maxZ = Math.max(b0z, b1z) + probeR + 0.5;

      // Query only candidate vertices in the cylinder bounding box via the voxel grid
      const candidateIndices = voxelGrid.queryAABB([minX, minY, minZ], [maxX, maxY, maxZ]);

      let minT = Infinity, maxT = -Infinity;
      const insidePoints: { r: number; t: number }[] = [];

      for (let ci = 0; ci < candidateIndices.length; ci++) {
        const vi = candidateIndices[ci];
        const vi3 = 3 * vi;
        const px = pos[vi3], py = pos[vi3 + 1], pz = pos[vi3 + 2];
        const dx = px - cx;
        const dy = py - cy;
        const dz = pz - cz;
        const t = dx * ax + dy * ay + dz * az;
        if (t < -0.2) continue;

        const rx = dx - t * ax, ry = dy - t * ay, rz = dz - t * az;
        const rSq = rx * rx + ry * ry + rz * rz;
        if (rSq <= probeR * probeR) {
          const r = Math.sqrt(rSq);
          if (t < minT) minT = t;
          if (t > maxT) maxT = t;
          insidePoints.push({ r, t });
        }
      }

      const depth = maxT > minT ? maxT - minT : 0;
      if (depth < 1.5) continue;

      const interior = insidePoints.filter(p => p.t >= minT + 0.15 * depth && p.t <= minT + 0.85 * depth);
      if (interior.length < 10) continue;

      let rInteriorMin = Infinity, rInteriorMax = -Infinity;
      for (let pIdx = 0; pIdx < interior.length; pIdx++) {
        const p = interior[pIdx];
        if (p.r < rInteriorMin) rInteriorMin = p.r;
        if (p.r > rInteriorMax) rInteriorMax = p.r;
      }

      const dMin = rInteriorMin * 2.0;
      const dMax = rInteriorMax * 2.0;

      let match = matchTappedHolePair(dMin, dMax);
      if (!match && Math.abs(dMax - dMin) < 0.5) {
        match = matchMetricThread(dMin, true, 0.45);
      }

      const holeDia = match ? match.tapDrillDiameter : dMin;
      const isThreaded = match !== null;
      const threadSpec = match ? match.designation : undefined;

      const holeOrigin: Point3D = [cx, cy, cz];
      const holeAxis: Vector3D = [ax, ay, az];

      holes.push({
        id: `hole_${++holeCounter}`,
        type: 'through',
        diameter: parseFloat(holeDia.toFixed(2)),
        depth: parseFloat(depth.toFixed(2)),
        axisOrigin: holeOrigin,
        axisDirection: holeAxis,
        isThreaded,
        threadSpec
      });

      if (match) {
        threads.push({
          id: `thread_${++threadCounter}`,
          isInternal: true,
          standard: 'ISO_METRIC',
          designation: match.designation,
          nominalDiameter: match.nominalDiameter,
          tapDrillDiameter: match.tapDrillDiameter,
          pitch: match.pitch,
          threadDepth: depth,
          starts: 1,
          hand: 'right',
          axisOrigin: holeOrigin,
          axisDirection: holeAxis,
          radialFdmOffsetApplied: 0.0
        });
      }
    }
  }

  return { holes, threads };
}
