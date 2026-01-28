/**
 * Tagging Tool
 *
 * Synaptic tagging - mark memories as important based on significant events.
 * Implements the Synaptic Tagging & Capture (STC) mechanism.
 *
 * When an important event occurs, memories from a capture window (default: 9 hours back,
 * 2 hours forward) are tagged and strengthened.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/tagging.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const ImportanceEventTypeSchema = z.enum([
  'breakthrough',     // Major discovery or solution
  'deadline_met',     // Completed important deadline
  'user_feedback',    // Positive user feedback
  'repeated_access',  // Frequently accessed memory
  'explicit_mark',    // User explicitly marked as important
  'emotional',        // High emotional content
  'novel_connection', // New insight connecting ideas
]);

export const TriggerImportanceInputSchema = z.object({
  eventType: ImportanceEventTypeSchema.describe('Type of importance event'),
  memoryId: z.string().optional().describe('Specific memory to tag (if not using capture window)'),
  hoursBack: z.number().min(0).max(48).default(9).describe('Hours to look back for capture window'),
  hoursForward: z.number().min(0).max(12).default(2).describe('Hours to look forward for capture window'),
});

export const FindTaggedInputSchema = z.object({
  minStrength: z.number().min(0).max(1).default(0.5).describe('Minimum tag strength'),
  limit: z.number().int().min(1).max(100).default(20).describe('Maximum results'),
});

export const TagStatsInputSchema = z.object({});

export type TriggerImportanceInput = z.infer<typeof TriggerImportanceInputSchema>;
export type FindTaggedInput = z.infer<typeof FindTaggedInputSchema>;
export type TagStatsInput = z.infer<typeof TagStatsInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export type ImportanceEventType = z.infer<typeof ImportanceEventTypeSchema>;

export interface TaggedMemory {
  id: string;
  content: string;
  retentionStrength: number;
  stabilityFactor: number;
  tagStrength: number;
  eventType: ImportanceEventType;
  taggedAt: string;
}

export interface TriggerImportanceOutput {
  success: boolean;
  eventType: ImportanceEventType;
  memoriesTagged: number;
  captureWindow: {
    start: string;
    end: string;
  };
  taggedIds: string[];
}

export interface FindTaggedOutput {
  total: number;
  memories: TaggedMemory[];
}

export interface TagStatsOutput {
  totalTagged: number;
  byEventType: Record<ImportanceEventType, number>;
  avgTagStrength: number;
  recentlyTagged: number; // Tagged in last 24 hours
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Base strength boost for each event type */
const EVENT_STRENGTH_BOOST: Record<ImportanceEventType, number> = {
  breakthrough: 0.3,
  deadline_met: 0.2,
  user_feedback: 0.25,
  repeated_access: 0.15,
  explicit_mark: 0.35,
  emotional: 0.2,
  novel_connection: 0.25,
};

/** Stability boost for each event type */
const EVENT_STABILITY_BOOST: Record<ImportanceEventType, number> = {
  breakthrough: 2.0,
  deadline_met: 1.5,
  user_feedback: 1.8,
  repeated_access: 1.3,
  explicit_mark: 2.5,
  emotional: 1.6,
  novel_connection: 1.7,
};

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const triggerImportanceToolDefinition = {
  name: 'trigger_importance',
  description: 'Trigger an importance event that tags and strengthens memories in the capture window. Implements Synaptic Tagging & Capture.',
  inputSchema: TriggerImportanceInputSchema.shape,
};

export const findTaggedToolDefinition = {
  name: 'find_tagged',
  description: 'Find memories that have been tagged as important.',
  inputSchema: FindTaggedInputSchema.shape,
};

export const tagStatsToolDefinition = {
  name: 'tag_stats',
  description: 'Get statistics about tagged memories.',
  inputSchema: TagStatsInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executeTriggerImportance(
  db: VestigeDatabase,
  args: TriggerImportanceInput
): Promise<TriggerImportanceOutput> {
  const { eventType, memoryId, hoursBack, hoursForward } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
        run: (...args: unknown[]) => { changes: number };
      };
    };
  });

  const now = new Date();
  const windowStart = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + hoursForward * 60 * 60 * 1000);

  const strengthBoost = EVENT_STRENGTH_BOOST[eventType];
  const stabilityBoost = EVENT_STABILITY_BOOST[eventType];

  const taggedIds: string[] = [];

  if (memoryId) {
    // Tag specific memory
    const result = internalDb.db.prepare(`
      UPDATE knowledge_nodes
      SET
        retention_strength = MIN(1.0, retention_strength + ?),
        stability_factor = stability_factor * ?,
        updated_at = ?
      WHERE id = ?
    `).run(strengthBoost, stabilityBoost, now.toISOString(), memoryId);

    if (result.changes > 0) {
      taggedIds.push(memoryId);
    }
  } else {
    // Tag memories in capture window
    const rows = internalDb.db.prepare(`
      SELECT id
      FROM knowledge_nodes
      WHERE
        (created_at >= ? AND created_at <= ?)
        OR (last_accessed_at >= ? AND last_accessed_at <= ?)
      ORDER BY retention_strength DESC
      LIMIT 50
    `).all(
      windowStart.toISOString(),
      windowEnd.toISOString(),
      windowStart.toISOString(),
      windowEnd.toISOString()
    ) as Array<{ id: string }>;

    for (const row of rows) {
      internalDb.db.prepare(`
        UPDATE knowledge_nodes
        SET
          retention_strength = MIN(1.0, retention_strength + ?),
          stability_factor = stability_factor * ?,
          updated_at = ?
        WHERE id = ?
      `).run(strengthBoost, stabilityBoost, now.toISOString(), row.id);

      taggedIds.push(row.id);
    }
  }

  return {
    success: true,
    eventType,
    memoriesTagged: taggedIds.length,
    captureWindow: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
    },
    taggedIds,
  };
}

export async function executeFindTagged(
  db: VestigeDatabase,
  args: FindTaggedInput
): Promise<FindTaggedOutput> {
  const { minStrength, limit } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
      };
    };
  });

  // Find memories with high stability factor (indicates tagging)
  // A stability factor > 1.3 suggests the memory has been tagged
  const rows = internalDb.db.prepare(`
    SELECT
      id,
      content,
      retention_strength,
      stability_factor,
      updated_at
    FROM knowledge_nodes
    WHERE stability_factor > 1.3 AND retention_strength >= ?
    ORDER BY stability_factor DESC, retention_strength DESC
    LIMIT ?
  `).all(minStrength, limit) as Array<{
    id: string;
    content: string;
    retention_strength: number;
    stability_factor: number;
    updated_at: string;
  }>;

  const memories: TaggedMemory[] = rows.map(row => ({
    id: row.id,
    content: row.content.slice(0, 200),
    retentionStrength: row.retention_strength,
    stabilityFactor: row.stability_factor,
    tagStrength: Math.min(1, (row.stability_factor - 1) / 1.5), // Normalize
    eventType: 'explicit_mark' as ImportanceEventType, // Default since we don't track event type
    taggedAt: row.updated_at,
  }));

  return {
    total: memories.length,
    memories,
  };
}

export async function executeTagStats(
  db: VestigeDatabase,
  _args: TagStatsInput
): Promise<TagStatsOutput> {
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
      };
    };
  });

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const row = internalDb.db.prepare(`
    SELECT
      COUNT(*) as total_tagged,
      AVG(stability_factor) as avg_stability,
      COUNT(CASE WHEN updated_at >= ? THEN 1 END) as recently_tagged
    FROM knowledge_nodes
    WHERE stability_factor > 1.3
  `).get(oneDayAgo.toISOString()) as {
    total_tagged: number;
    avg_stability: number | null;
    recently_tagged: number;
  };

  // Calculate average tag strength from stability
  const avgTagStrength = row.avg_stability
    ? Math.min(1, (row.avg_stability - 1) / 1.5)
    : 0;

  // We don't track event types in the current schema, so return zeros
  const byEventType: Record<ImportanceEventType, number> = {
    breakthrough: 0,
    deadline_met: 0,
    user_feedback: 0,
    repeated_access: 0,
    explicit_mark: row.total_tagged,
    emotional: 0,
    novel_connection: 0,
  };

  return {
    totalTagged: row.total_tagged,
    byEventType,
    avgTagStrength,
    recentlyTagged: row.recently_tagged,
  };
}
