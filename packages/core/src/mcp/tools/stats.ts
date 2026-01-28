/**
 * Stats Tool
 *
 * Get statistics about the memory store and check health.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/stats.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const StatsInputSchema = z.object({
  includeHealth: z.boolean().default(true).describe('Include detailed health check'),
});

export type StatsInput = z.infer<typeof StatsInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export type HealthStatus = 'empty' | 'critical' | 'degraded' | 'healthy';

export interface RetentionDistribution {
  strong: number;  // retention >= 0.7
  moderate: number; // 0.4 <= retention < 0.7
  weak: number;    // 0.1 <= retention < 0.4
  fading: number;  // retention < 0.1
}

export interface SourceDistribution {
  [sourceType: string]: number;
}

export interface StatsOutput {
  totalMemories: number;
  totalPeople: number;
  totalEdges: number;
  databaseSizeMB: number;
  avgRetentionStrength: number;
  memoriesDueForReview: number;
  retentionDistribution: RetentionDistribution;
  sourceDistribution: SourceDistribution;
  health: {
    status: HealthStatus;
    warnings: string[];
  };
  createdAt: string;
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const statsToolDefinition = {
  name: 'stats',
  description: 'Get statistics about the memory store including total memories, retention distribution, health status, and storage usage.',
  inputSchema: StatsInputSchema.shape,
};

// ============================================================================
// HEALTH CHECK
// ============================================================================

function determineHealthStatus(
  totalMemories: number,
  avgRetention: number,
  dueForReview: number,
  warnings: string[]
): HealthStatus {
  if (totalMemories === 0) {
    return 'empty';
  }

  // Critical: very low retention or too many warnings
  if (avgRetention < 0.2 || warnings.length >= 3) {
    return 'critical';
  }

  // Degraded: low retention or some warnings
  if (avgRetention < 0.5 || warnings.length >= 1 || (dueForReview > totalMemories * 0.5)) {
    return 'degraded';
  }

  return 'healthy';
}

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeStats(
  db: VestigeDatabase,
  args: StatsInput
): Promise<StatsOutput> {
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
        all: (...args: unknown[]) => unknown[];
      };
    };
    getDatabaseSize: () => { mb: number };
    checkHealth: () => { warnings: string[] };
  });

  // Get basic counts
  const countRow = internalDb.db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM knowledge_nodes) as total_memories,
      (SELECT COUNT(*) FROM people) as total_people,
      (SELECT COUNT(*) FROM graph_edges) as total_edges
  `).get() as { total_memories: number; total_people: number; total_edges: number };

  // Get retention statistics
  const retentionRow = internalDb.db.prepare(`
    SELECT
      AVG(retention_strength) as avg_retention,
      COUNT(CASE WHEN retention_strength >= 0.7 THEN 1 END) as strong,
      COUNT(CASE WHEN retention_strength >= 0.4 AND retention_strength < 0.7 THEN 1 END) as moderate,
      COUNT(CASE WHEN retention_strength >= 0.1 AND retention_strength < 0.4 THEN 1 END) as weak,
      COUNT(CASE WHEN retention_strength < 0.1 THEN 1 END) as fading
    FROM knowledge_nodes
  `).get() as {
    avg_retention: number | null;
    strong: number;
    moderate: number;
    weak: number;
    fading: number;
  };

  // Get memories due for review
  const now = new Date().toISOString();
  const dueRow = internalDb.db.prepare(`
    SELECT COUNT(*) as due
    FROM knowledge_nodes
    WHERE next_review_date IS NOT NULL AND next_review_date <= ?
  `).get(now) as { due: number };

  // Get source distribution
  const sourceRows = internalDb.db.prepare(`
    SELECT source_type, COUNT(*) as count
    FROM knowledge_nodes
    GROUP BY source_type
    ORDER BY count DESC
  `).all() as Array<{ source_type: string; count: number }>;

  const sourceDistribution: SourceDistribution = {};
  for (const row of sourceRows) {
    sourceDistribution[row.source_type] = row.count;
  }

  // Get database size
  let databaseSizeMB = 0;
  try {
    const sizeInfo = internalDb.getDatabaseSize();
    databaseSizeMB = sizeInfo.mb;
  } catch {
    // Ignore
  }

  // Build warnings list
  const warnings: string[] = [];

  const avgRetention = retentionRow.avg_retention ?? 0;
  const totalMemories = countRow.total_memories;

  if (totalMemories > 0 && avgRetention < 0.5) {
    warnings.push('Average retention is below 50% - consider reviewing more memories');
  }

  if (dueRow.due > 100) {
    warnings.push(`${dueRow.due} memories are due for review`);
  }

  if (retentionRow.fading > totalMemories * 0.2) {
    warnings.push('More than 20% of memories are fading (retention < 0.1)');
  }

  // Determine health status
  const healthStatus = determineHealthStatus(
    totalMemories,
    avgRetention,
    dueRow.due,
    warnings
  );

  return {
    totalMemories,
    totalPeople: countRow.total_people,
    totalEdges: countRow.total_edges,
    databaseSizeMB,
    avgRetentionStrength: avgRetention,
    memoriesDueForReview: dueRow.due,
    retentionDistribution: {
      strong: retentionRow.strong,
      moderate: retentionRow.moderate,
      weak: retentionRow.weak,
      fading: retentionRow.fading,
    },
    sourceDistribution,
    health: {
      status: healthStatus,
      warnings,
    },
    createdAt: new Date().toISOString(),
  };
}
