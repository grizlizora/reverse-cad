// ==============================================================================
// src/types/geometry.ts — Mathematical & Geometric Types for 3D Pipeline
// ==============================================================================

export type Point3D = [number, number, number];
export type Vector3D = [number, number, number];

export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
  dimensions: Point3D;
  center: Point3D;
  diagonal: number;
}

export interface RawMesh {
  positions: Float32Array; // Flattened x, y, z
  indices: Uint32Array;    // 3 per triangle
  normals?: Float32Array;  // Flattened per-vertex or per-face normals
  vertexCount: number;
  triangleCount: number;
  boundingBox: BoundingBox3D;
}

export type SurfaceType = 'plane' | 'cylinder' | 'cone' | 'torus' | 'freeform';

export interface BaseSurface {
  id: string;
  type: SurfaceType;
  inlierIndices: number[]; // Triangle indices belonging to this surface
  area: number;
  meanResidual: number;
}

export interface PlaneSurface extends BaseSurface {
  type: 'plane';
  origin: Point3D;
  normal: Vector3D;
  boundaryVertices?: Point3D[];
}

export type CylinderSubType = 'full_cylinder' | 'fillet' | 'partial_arc';

export interface CylinderSurface extends BaseSurface {
  type: 'cylinder';
  axisOrigin: Point3D;
  axisDirection: Vector3D;
  radius: number;
  height: number;
  isInternal: boolean; // true = hole / bore, false = external pin / boss
  angularSpanRad?: number;
  maxAngularGapRad?: number;
  angularBinCoverage?: number;
  subType?: CylinderSubType;
}

export interface ConeSurface extends BaseSurface {
  type: 'cone';
  apex: Point3D;
  axisDirection: Vector3D;
  halfAngleRad: number;
  height: number;
  isInternal: boolean;
}

export interface TorusSurface extends BaseSurface {
  type: 'torus';
  center: Point3D;
  axisDirection: Vector3D;
  majorRadius: number;
  minorRadius: number;
}

export interface FreeformSurface extends BaseSurface {
  type: 'freeform';
  bvhAABB?: BoundingBox3D;
}

export type SurfacePrimitive =
  | PlaneSurface
  | CylinderSurface
  | ConeSurface
  | TorusSurface
  | FreeformSurface;

export interface MeshShell {
  shellIndex: number;
  triangleIndices: number[];
  signedVolume: number; // >0 for outer solid boundary, <0 for internal void/cavity
  surfaceArea: number;
  isCavity: boolean;
  boundingBox: BoundingBox3D;
}
