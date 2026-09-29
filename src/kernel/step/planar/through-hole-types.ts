// ==============================================================================
// src/kernel/step/planar/through-hole-types.ts — Through-Hole Synthesis Types
// Breaks circular type dependencies between planar stitcher & hole cylinder builder.
// ==============================================================================

export interface MatchedThroughHole {
  topClusterIdx: number;
  botClusterIdx: number;
  topHoleIdx: number;
  botHoleIdx: number;
  cx: number;
  cy: number;
  cz: number;
  normal: [number, number, number];
  topLoop: number[];
  botLoop: number[];
}

export interface ThroughHoleStitchResult {
  shellFaceIds: string[];
  absorbedTriangleCount: number;
  matchedHoles: MatchedThroughHole[];
}
