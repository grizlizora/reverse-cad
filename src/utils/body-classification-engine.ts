// ==============================================================================
// src/utils/body-classification-engine.ts — Multi-Body Rule & Strategy Engine
// ==============================================================================

import { MeshShell } from '../types/geometry.js';
import { CADKinematicJoint } from '../types/features.js';
import {
  type ClassifiedBody,
  type BodyClassificationStrategy,
  MonolithicBodyStrategy,
  FoldingMechanismStrategy,
  SpatialDeterministicFallbackStrategy
} from './body-strategies.js';

export class BodyClassificationEngine {
  private strategies: BodyClassificationStrategy[];

  constructor() {
    this.strategies = [
      new MonolithicBodyStrategy(),
      new FoldingMechanismStrategy(),
      new SpatialDeterministicFallbackStrategy()
    ];
  }

  public registerStrategy(strategy: BodyClassificationStrategy, prepend: boolean = true): void {
    if (prepend) {
      this.strategies.unshift(strategy);
    } else {
      this.strategies.push(strategy);
    }
  }

  public classify(shells: MeshShell[], kinematicJoints: CADKinematicJoint[] = []): ClassifiedBody[] {
    let solidShells = shells.filter(s => !s.isCavity && s.triangleIndices.length > 0);
    if (solidShells.length === 0) {
      solidShells = shells.filter(s => s.triangleIndices.length > 0);
    }
    if (solidShells.length === 0) {
      return [];
    }

    for (let i = 0; i < this.strategies.length; i++) {
      const strat = this.strategies[i];
      if (strat.canHandle(solidShells, kinematicJoints)) {
        return strat.classify(solidShells, kinematicJoints);
      }
    }

    return new SpatialDeterministicFallbackStrategy().classify(solidShells);
  }
}
