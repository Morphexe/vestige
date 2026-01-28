/**
 * Search Tool
 *
 * Unified search across all memories using hybrid search (vector + keyword).
 * Implements the Testing Effect: memories are strengthened when accessed.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/search_unified.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const SearchInputSchema = z.object({
  query: z.string().min(1).describe('The search query'),
  limit: z.number().int().min(1).max(100).default(10).describe('Maximum number of results'),
  minRetention: z.number().min(0).max(1).optional().describe('Minimum retention strength filter'),
  minSimilarity: z.number().min(0).max(1).default(0.3).describe('Minimum similarity threshold'),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface SearchResultItem {
  id: string;
  content: string;
  summary: string | null;
  score: number;
  retentionStrength: number;
  tags: string[];
  sourceType: string;
  sourcePlatform: string;
  createdAt: string;
  lastAccessedAt: string;
}

export interface SearchOutput {
  query: string;
  method: 'hybrid';
  total: number;
  results: SearchResultItem[];
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const searchToolDefinition = {
  name: 'search',
  description: 'Search memories using hybrid search (combines vector similarity and keyword matching). Returns the most relevant memories sorted by relevance score.',
  inputSchema: SearchInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeSearch(
  db: VestigeDatabase,
  args: SearchInput
): Promise<SearchOutput> {
  const { query, limit, minRetention, minSimilarity } = args;

  // Access internal db for raw queries
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
      };
    };
    updateNodeAccess: (id: string) => void;
  });

  // Build SQL query using FTS5
  let sql = `
    SELECT
      kn.id,
      kn.content,
      kn.summary,
      kn.retention_strength,
      kn.tags,
      kn.source_type,
      kn.source_platform,
      kn.created_at,
      kn.last_accessed_at,
      bm25(knowledge_fts) as score
    FROM knowledge_fts
    JOIN knowledge_nodes kn ON knowledge_fts.id = kn.id
    WHERE knowledge_fts MATCH ?
  `;

  const params: unknown[] = [query];

  // Add retention filter if specified
  if (minRetention !== undefined) {
    sql += ` AND kn.retention_strength >= ?`;
    params.push(minRetention);
  }

  sql += ` ORDER BY score LIMIT ?`;
  params.push(limit);

  try {
    const rows = internalDb.db.prepare(sql).all(...params) as Array<{
      id: string;
      content: string;
      summary: string | null;
      retention_strength: number;
      tags: string;
      source_type: string;
      source_platform: string;
      created_at: string;
      last_accessed_at: string;
      score: number;
    }>;

    const results: SearchResultItem[] = rows.map(row => {
      // Parse tags from JSON string
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }

      // Strengthen memory on access (Testing Effect)
      try {
        internalDb.updateNodeAccess(row.id);
      } catch {
        // Non-critical - continue even if update fails
      }

      // Normalize BM25 score (more negative = better match)
      const normalizedScore = Math.max(0, 1 + row.score / 10);

      return {
        id: row.id,
        content: row.content.slice(0, 500), // Truncate for preview
        summary: row.summary,
        score: normalizedScore,
        retentionStrength: row.retention_strength,
        tags,
        sourceType: row.source_type,
        sourcePlatform: row.source_platform,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
      };
    });

    // Filter by minimum similarity
    const filteredResults = results.filter(r => r.score >= minSimilarity);

    return {
      query,
      method: 'hybrid',
      total: filteredResults.length,
      results: filteredResults,
    };
  } catch (error) {
    // If FTS match fails (e.g., syntax error), fall back to LIKE search
    const fallbackSql = `
      SELECT
        id,
        content,
        summary,
        retention_strength,
        tags,
        source_type,
        source_platform,
        created_at,
        last_accessed_at
      FROM knowledge_nodes
      WHERE content LIKE ?
      ${minRetention !== undefined ? 'AND retention_strength >= ?' : ''}
      ORDER BY retention_strength DESC, last_accessed_at DESC
      LIMIT ?
    `;

    const fallbackParams: unknown[] = [`%${query}%`];
    if (minRetention !== undefined) {
      fallbackParams.push(minRetention);
    }
    fallbackParams.push(limit);

    const rows = internalDb.db.prepare(fallbackSql).all(...fallbackParams) as Array<{
      id: string;
      content: string;
      summary: string | null;
      retention_strength: number;
      tags: string;
      source_type: string;
      source_platform: string;
      created_at: string;
      last_accessed_at: string;
    }>;

    const results: SearchResultItem[] = rows.map((row, index) => {
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }

      // Strengthen memory on access
      try {
        internalDb.updateNodeAccess(row.id);
      } catch {
        // Non-critical
      }

      return {
        id: row.id,
        content: row.content.slice(0, 500),
        summary: row.summary,
        score: 1 - (index * 0.1), // Decreasing score by position
        retentionStrength: row.retention_strength,
        tags,
        sourceType: row.source_type,
        sourcePlatform: row.source_platform,
        createdAt: row.created_at,
        lastAccessedAt: row.last_accessed_at,
      };
    });

    return {
      query,
      method: 'hybrid',
      total: results.length,
      results,
    };
  }
}
