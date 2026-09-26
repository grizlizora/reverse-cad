// ==============================================================================
// src/utils/body-strategies.ts — Modular Body Classification Strategies
// ==============================================================================

import { MeshShell, Point3D } from '../types/geometry.js';
import { CADKinematicJoint } from '../types/features.js';

export interface ClassifiedBody {
  shell: MeshShell;
  name: string;
  role: 'base' | 'arm' | 'strut' | 'link' | 'component';
  colorLabel: string;
  colorRgb: [number, number, number];
}

export const DEFAULT_PALETTES: Array<{ name: string; colorLabel: string; rgb: [number, number, number] }> = [
  { name: 'Body_1_Base', colorLabel: 'Base Slate Dark Gray', rgb: [0.35, 0.35, 0.38] },
  { name: 'Body_2_Arm', colorLabel: 'Arm Industrial Cobalt Blue', rgb: [0.15, 0.45, 0.85] },
  { name: 'Body_3_Strut', colorLabel: 'Strut Safety Amber Orange', rgb: [0.92, 0.52, 0.12] },
  { name: 'Body_4_Link', colorLabel: 'Link Machined Cyan', rgb: [0.10, 0.70, 0.70] },
  { name: 'Body_5_Pin', colorLabel: 'Pin Polished Gold', rgb: [0.85, 0.75, 0.20] }
];

export interface BodyClassificationStrategy {
  canHandle(shells: MeshShell[], joints: CADKinematicJoint[]): boolean;
  classify(shells: MeshShell[], joints: CADKinematicJoint[]): ClassifiedBody[];
}

/**
 * Strategy 1: Monolithic Single-Body Classification
 */
export class MonolithicBodyStrategy implements BodyClassificationStrategy {
  canHandle(shells: MeshShell[]): boolean {
    return shells.length === 1;
  }

  classify(shells: MeshShell[]): ClassifiedBody[] {
    return [{
      shell: shells[0],
      name: 'Body_1_Base',
      role: 'base',
      colorLabel: 'Monolithic Structure Steel Gray',
      colorRgb: [0.70, 0.70, 0.72]
    }];
  }
}

/**
 * Strategy 2: 3-Body Folding Mechanism Strategy (Folding Stand / Scissor Linkage)
 */
export class FoldingMechanismStrategy implements BodyClassificationStrategy {
  canHandle(shells: MeshShell[], joints: CADKinematicJoint[]): boolean {
    const revoluteJoints = joints.filter(k => k.type === 'revolute');
    return shells.length === 3 && revoluteJoints.length >= 2;
  }

  classify(shells: MeshShell[], joints: CADKinematicJoint[]): ClassifiedBody[] {
    const revoluteJoints = joints.filter(k => k.type === 'revolute');
    const j1 = revoluteJoints[0];
    const j2 = revoluteJoints[1];

    const shellNearPoint = (sh: MeshShell, pt: Point3D, margin = 4.0): boolean => {
      const b = sh.boundingBox;
      return (
        pt[0] >= b.min[0] - margin && pt[0] <= b.max[0] + margin &&
        pt[1] >= b.min[1] - margin && pt[1] <= b.max[1] + margin &&
        pt[2] >= b.min[2] - margin && pt[2] <= b.max[2] + margin
      );
    };

    const maxDimY = Math.max(...shells.map(s => s.boundingBox.dimensions[1]));

    let strutShell: MeshShell | null = null;
    let armShell: MeshShell | null = null;
    let baseShell: MeshShell | null = null;

    // 1. Identify Strut: distinctly shorter link (length < 0.65 * max length)
    const shortShells = shells.filter(s => s.boundingBox.dimensions[1] < 0.65 * maxDimY);
    if (shortShells.length === 1) {
      strutShell = shortShells[0];
    }

    const remaining = shells.filter(s => s !== strutShell);

    // 2. Base vs Arm
    if (remaining.length === 2) {
      if (remaining[0].boundingBox.min[0] < remaining[1].boundingBox.min[0] - 5.0) {
        armShell = remaining[0];
        baseShell = remaining[1];
      } else if (remaining[1].boundingBox.min[0] < remaining[0].boundingBox.min[0] - 5.0) {
        armShell = remaining[1];
        baseShell = remaining[0];
      } else {
        const s0NearBoth = shellNearPoint(remaining[0], j1.axisOrigin) && shellNearPoint(remaining[0], j2.axisOrigin);
        const s1NearBoth = shellNearPoint(remaining[1], j1.axisOrigin) && shellNearPoint(remaining[1], j2.axisOrigin);
        if (s0NearBoth && !s1NearBoth) {
          armShell = remaining[0];
          baseShell = remaining[1];
        } else {
          armShell = remaining[1];
          baseShell = remaining[0];
        }
      }
    }

    if (baseShell && armShell && strutShell) {
      return [
        {
          shell: baseShell,
          name: 'Body_1_Base',
          role: 'base',
          colorLabel: 'Base Slate Dark Gray',
          colorRgb: [0.35, 0.35, 0.38]
        },
        {
          shell: armShell,
          name: 'Body_2_Arm',
          role: 'arm',
          colorLabel: 'Arm Industrial Cobalt Blue',
          colorRgb: [0.15, 0.45, 0.85]
        },
        {
          shell: strutShell,
          name: 'Body_3_Strut',
          role: 'strut',
          colorLabel: 'Strut Safety Amber Orange',
          colorRgb: [0.92, 0.52, 0.12]
        }
      ];
    }

    return new SpatialDeterministicFallbackStrategy().classify(shells, joints);
  }
}

/**
 * Strategy 3: General Multi-Body Spatial Deterministic Strategy
 */
export class SpatialDeterministicFallbackStrategy implements BodyClassificationStrategy {
  canHandle(_shells: MeshShell[], _joints?: CADKinematicJoint[]): boolean {
    return true;
  }

  classify(shells: MeshShell[], _joints?: CADKinematicJoint[]): ClassifiedBody[] {
    const sorted = [...shells].sort((a, b) => {
      const zDiff = a.boundingBox.min[2] - b.boundingBox.min[2];
      if (Math.abs(zDiff) > 1e-3) return zDiff;
      return Math.abs(b.signedVolume) - Math.abs(a.signedVolume);
    });

    return sorted.map((shell, idx) => {
      const pal = DEFAULT_PALETTES[idx % DEFAULT_PALETTES.length];
      const suffix = idx >= DEFAULT_PALETTES.length ? `_${idx + 1}` : '';
      return {
        shell,
        name: `${pal.name}${suffix}`,
        role: idx === 0 ? 'base' : idx === 1 ? 'arm' : idx === 2 ? 'strut' : 'component',
        colorLabel: `${pal.colorLabel}${suffix}`,
        colorRgb: pal.rgb
      };
    });
  }
}
