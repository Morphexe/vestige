/**
 * Recall Tool
 *
 * Recall memories based on semantic similarity and context.
 * Uses the hippocampal-inspired two-phase retrieval:
 * 1. Fast index lookup
 * 2. Full content retrieval
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/recall.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const RecallInputSchema = z.object({
  query: z.string().min(1).describe('What to recall - can be a topic, question, or keyword'),
  limit: z.number().int().min(1).max(50).default(5).describe('Maximum number of memories to recall'),
  minRetention: z.number().min(0).max(1).optional().describe('Only recall memories above this retention threshold'),
});

export type RecallInput = z.infer<typeof RecallInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface RecallResultItem {
  id: string;
  content: string;
  summary: string | null;
  relevance: number;
  retentionStrength: number;
  tags: string[];
  sourceType: string;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
}

export interface RecallOutput {
  query: string;
  total: number;
  results: RecallResultItem[];
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const recallToolDefinition = {
  name: 'recall',
  description: 'Recall relevant memories based on a query. Returns memories most semantically related to the query, ordered by relevance.',
  inputSchema: RecallInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeRecall(
  db: VestigeDatabase,
  args: RecallInput
): Promise<RecallOutput> {
  const { query, limit, minRetention } = args;

  // Access internal db
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
      };
    };
    updateNodeAccess: (id: string) => void;
  });

  // Try FTS-based search first
  try {
    let sql = `
      SELECT
        kn.id,
        kn.content,
        kn.summary,
        kn.retention_strength,
        kn.tags,
        kn.source_type,
        kn.created_at,
        kn.last_accessed_at,
        kn.access_count,
        bm25(knowledge_fts) as relevance
      FROM knowledge_fts
      JOIN knowledge_nodes kn ON knowledge_fts.id = kn.id
      WHERE knowledge_fts MATCH ?
    `;

    const params: unknown[] = [query];

    if (minRetention !== undefined) {
      sql += ` AND kn.retention_strength >= ?`;
      params.push(minRetention);
    }

    sql += ` ORDER BY relevance LIMIT ?`;
    params.push(limit);

    const rows = internalDb.db.prepare(sql).all(...params) as Array<{
      id: string;
      content: string;
      summary: string | null;
      retention_strength: number;
      tags: string;
      source_type: string;
      created_at: string;
      last_accessed_at: string;
      access_count: number;
      relevance: number;
    }>;

    const results: RecallResultItem[] = rows.map(row => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }

      // Update access on recall
      try {
        internalDb.updateNodeAccess(row.id);
      } catch {
        // Non-critical
      }

      // Normalize BM25 score
      const normalizedRelevance = Math.max(0, Math.min(1, 1 + row.relevance / 10));

      return {
        id: row.id,
        content: row.content,
        summary: row.summary,
        relevance: normalizedRelevance,
        retentionStrength: row.retention_strength,
        tags,
        sourceType: row.source_type,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count,
      };
    });

    return {
      query,
      total: results.length,
      results,
    };
  } catch {
    // Fallback to LIKE search if FTS fails
    let sql = `
      SELECT
        id,
        content,
        summary,
        retention_strength,
        tags,
        source_type,
        created_at,
        last_accessed_at,
        access_count
      FROM knowledge_nodes
      WHERE content LIKE ? OR summary LIKE ? OR tags LIKE ?
    `;

    const likePattern = `%${query}%`;
    const params: unknown[] = [likePattern, likePattern, likePattern];

    if (minRetention !== undefined) {
      sql += ` AND retention_strength >= ?`;
      params.push(minRetention);
    }

    sql += ` ORDER BY retention_strength DESC, access_count DESC LIMIT ?`;
    params.push(limit);

    const rows = internalDb.db.prepare(sql).all(...params) as Array<{
      id: string;
      content: string;
      summary: string | null;
      retention_strength: number;
      tags: string;
      source_type: string;
      created_at: string;
      last_accessed_at: string;
      access_count: number;
    }>;

    const results: RecallResultItem[] = rows.map((row, index) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }

      try {
        internalDb.updateNodeAccess(row.id);
      } catch {
        // Non-critical
      }

      return {
        id: row.id,
        content: row.content,
        summary: row.summary,
        relevance: 1 - (index * 0.1),
        retentionStrength: row.retention_strength,
        tags,
        sourceType: row.source_type,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
        accessCount: row.access_count,
      };
    });

    return {
      query,
      total: results.length,
      results,
    };
  }
}
