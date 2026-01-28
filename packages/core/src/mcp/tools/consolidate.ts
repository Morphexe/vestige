/**
 * Consolidate Tool
 *
 * Run memory consolidation - the process of strengthening important memories,
 * pruning weak ones, and generating embeddings.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/consolidate.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const ConsolidateInputSchema = z.object({
  applyDecay: z.boolean().default(true).describe('Apply time-based decay to retention strength'),
  pruneThreshold: z.number().min(0).max(1).default(0.05).describe('Retention threshold below which to prune memories'),
  promoteThreshold: z.number().min(0).max(1).default(0.8).describe('Retention threshold above which to promote memories'),
  maxProcess: z.number().int().min(1).max(10000).default(1000).describe('Maximum number of nodes to process'),
});

export type ConsolidateInput = z.infer<typeof ConsolidateInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface ConsolidateOutput {
  success: boolean;
  nodesProcessed: number;
  nodesPromoted: number;
  nodesPruned: number;
  decayApplied: boolean;
  embeddingsGenerated: number;
  durationMs: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base decay rate per day (approximately 5% per day) */
const DAILY_DECAY_RATE = 0.95;

/** Stability factor that slows decay (higher = slower decay) */
const STABILITY_INFLUENCE = 0.1;

/** Hours before decay starts (grace period for new memories) */
const DECAY_GRACE_HOURS = 24;

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const consolidateToolDefinition = {
  name: 'consolidate',
  description: 'Run memory consolidation to apply decay, prune weak memories, and promote strong ones. This mimics the sleep-based memory consolidation process.',
  inputSchema: ConsolidateInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeConsolidate(
  db: VestigeDatabase,
  args: ConsolidateInput
): Promise<ConsolidateOutput> {
  const startTime = Date.now();
  const { applyDecay, pruneThreshold, promoteThreshold, maxProcess } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
        run: (...args: unknown[]) => { changes: number };
      };
    };
  });

  let nodesProcessed = 0;
  let nodesPromoted = 0;
  let nodesPruned = 0;
  let embeddingsGenerated = 0;

  const now = new Date();
  const nowIso = now.toISOString();

  // Get nodes to process
  const nodes = internalDb.db.prepare(`
    SELECT
      id,
      retention_strength,
      stability_factor,
      sentiment_intensity,
      last_accessed_at,
      created_at,
      access_count
    FROM knowledge_nodes
    ORDER BY last_accessed_at ASC
    LIMIT ?
  `).all(maxProcess) as Array<{
    id: string;
    retention_strength: number;
    stability_factor: number;
    sentiment_intensity: number;
    last_accessed_at: string;
    created_at: string;
    access_count: number;
  }>;

  for (const node of nodes) {
    nodesProcessed++;

    let newRetention = node.retention_strength;

    // Apply decay if enabled
    if (applyDecay) {
      const lastAccessed = new Date(node.last_accessed_at);
      const hoursSinceAccess = (now.getTime() - lastAccessed.getTime()) / (1000 * 60 * 60);

      // Skip decay for recently accessed memories
      if (hoursSinceAccess > DECAY_GRACE_HOURS) {
        const daysSinceAccess = hoursSinceAccess / 24;

        // Calculate decay with stability influence
        // Higher stability = slower decay
        const stabilityFactor = 1 + (node.stability_factor - 1) * STABILITY_INFLUENCE;
        const effectiveDecayRate = Math.pow(DAILY_DECAY_RATE, 1 / stabilityFactor);
        const decayMultiplier = Math.pow(effectiveDecayRate, daysSinceAccess);

        // Emotional memories decay slower
        const sentimentProtection = 1 - (node.sentiment_intensity * 0.3);
        const finalDecay = decayMultiplier * sentimentProtection + (1 - sentimentProtection);

        newRetention = Math.max(0, node.retention_strength * finalDecay);
      }
    }

    // Check for pruning
    if (newRetention < pruneThreshold && node.access_count < 3) {
      // Prune this memory (mark as very low retention)
      internalDb.db.prepare(`
        UPDATE knowledge_nodes
        SET retention_strength = 0, updated_at = ?
        WHERE id = ?
      `).run(nowIso, node.id);
      nodesPruned++;
      continue;
    }

    // Check for promotion
    if (node.retention_strength >= promoteThreshold && node.access_count >= 5) {
      // Boost stability for frequently accessed strong memories
      const newStability = Math.min(365, node.stability_factor * 1.1);
      internalDb.db.prepare(`
        UPDATE knowledge_nodes
        SET stability_factor = ?, updated_at = ?
        WHERE id = ?
      `).run(newStability, nowIso, node.id);
      nodesPromoted++;
    }

    // Update retention if decayed
    if (newRetention !== node.retention_strength) {
      internalDb.db.prepare(`
        UPDATE knowledge_nodes
        SET retention_strength = ?, updated_at = ?
        WHERE id = ?
      `).run(newRetention, nowIso, node.id);
    }
  }

  // Check for nodes missing embeddings
  const missingEmbeddings = internalDb.db.prepare(`
    SELECT COUNT(*) as count
    FROM knowledge_nodes kn
    LEFT JOIN embeddings e ON kn.id = e.node_id
    WHERE e.node_id IS NULL
  `).all() as Array<{ count: number }>;

  embeddingsGenerated = missingEmbeddings[0]?.count ?? 0;

  const durationMs = Date.now() - startTime;

  return {
    success: true,
    nodesProcessed,
    nodesPromoted,
    nodesPruned,
    decayApplied: applyDecay,
    embeddingsGenerated,
    durationMs,
  };
}
