// ==============================================================================
// src/capabilities/cad-budget-engine.ts — Adaptive LLM Budget & Lossless Clustering
// ==============================================================================

import { CADFeaturesSummary } from '../types/features.js';
import {
  clusterNormalizedHoles,
  HolePatternCluster,
  NormalizedHole,
  normalizeHole
} from './pcd-pattern-engine.js';
import { generateCompactCsgDsl } from './csg-dsl-generator.js';

export type ContextTier = 'ctx_4k_edge' | 'ctx_8k_balanced' | 'ctx_32k_ide' | 'ctx_128k_frontier';
export { HolePatternCluster, NormalizedHole, normalizeHole };

/**
 * Clusters repeated holes into geometric patterns losslessly.
 * Preserves 100% of spatial and dimensional parameters while reducing token overhead.
 */
export function clusterHoleFeatures(holes: any[], preserveAllPositions = true): {
  individualHoles: any[];
  clusters: HolePatternCluster[];
} {
  return clusterNormalizedHoles(holes, { minHoleCount: 4 }, preserveAllPositions);
}

/**
 * Deep clones and budgets CAD features summary into LLM token context tiers.
 */
export function applyContextBudget(
  summary: CADFeaturesSummary,
  tier: ContextTier = 'ctx_8k_balanced'
): CADFeaturesSummary & { compactCsgDsl?: string; estimatedTokens?: number } {
  const budgeted: any = typeof structuredClone === 'function'
    ? structuredClone(summary)
    : JSON.parse(JSON.stringify(summary));
  budgeted.contextTier = tier;

  const holes = budgeted.engineeringFeatures?.holes || [];
  const keepFullCoords = tier === 'ctx_32k_ide' || tier === 'ctx_128k_frontier';
  const { individualHoles, clusters } = clusterHoleFeatures(holes, keepFullCoords);

  if (clusters.length > 0 && budgeted.engineeringFeatures) {
    budgeted.engineeringFeatures.repeatedHolePatterns = clusters;
  }

  // Generate compact symbolic CSG DSL summarizing entire model features in < 150 tokens
  const dsl = generateCompactCsgDsl({
    boundingDimensionsMm: budgeted.boundingDimensionsMm,
    solidBodies: budgeted.solidBodies,
    kinematicJoints: budgeted.engineeringFeatures?.kinematicJoints,
    slots: budgeted.engineeringFeatures?.slots,
    clusters,
    individualHoles
  });

  if (dsl) {
    budgeted.compactCsgDsl = dsl;
  }

  // Token truncation logic per tier
  if (tier === 'ctx_4k_edge') {
    if (budgeted.engineeringFeatures?.holes && clusters.length > 0) {
      budgeted.engineeringFeatures.holes = individualHoles.slice(0, 8);
    }
    if (budgeted.engineeringFeatures?.fillets) {
      budgeted.engineeringFeatures.fillets = budgeted.engineeringFeatures.fillets.slice(0, 10);
    }
    if (budgeted.engineeringFeatures?.chamfers) {
      budgeted.engineeringFeatures.chamfers = budgeted.engineeringFeatures.chamfers.slice(0, 10);
    }
  } else if (tier === 'ctx_8k_balanced') {
    if (budgeted.engineeringFeatures?.holes && clusters.length > 0) {
      budgeted.engineeringFeatures.holes = individualHoles.slice(0, 25);
    }
    if (budgeted.engineeringFeatures?.fillets) {
      budgeted.engineeringFeatures.fillets = budgeted.engineeringFeatures.fillets.slice(0, 30);
    }
  }

  // Approximate token count: ~3.2 characters per token for technical JSON
  const estimatedTokens = Math.ceil(JSON.stringify(budgeted).length / 3.2);
  budgeted.estimatedTokens = estimatedTokens;

  return budgeted;
}
