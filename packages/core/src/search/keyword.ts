/**
 * Keyword Search Module
 *
 * FTS5-based full-text search for knowledge nodes.
 * Provides efficient keyword matching with BM25 ranking.
 */

import { Database } from 'bun:sqlite';
import type { SearchResult, SearchOptions, TemporalFilter, PaginatedSearchResult } from './types.js';

/** Default result limit */
const DEFAULT_LIMIT = 10;
/** Maximum result limit */
const MAX_LIMIT = 100;
/** Maximum query length */
const MAX_QUERY_LENGTH = 1000;

/**
 * Build FTS5 temporal filter clause
 */
function buildTemporalClause(filter?: TemporalFilter): { clause: string; params: unknown[] } {
  if (!filter) {
    return { clause: '', params: [] };
  }

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filter.createdAfter) {
    clauses.push('kn.created_at >= ?');
    params.push(filter.createdAfter.toISOString());
  }
  if (filter.createdBefore) {
    clauses.push('kn.created_at <= ?');
    params.push(filter.createdBefore.toISOString());
  }
  if (filter.accessedAfter) {
    clauses.push('kn.last_accessed_at >= ?');
    params.push(filter.accessedAfter.toISOString());
  }
  if (filter.accessedBefore) {
    clauses.push('kn.last_accessed_at <= ?');
    params.push(filter.accessedBefore.toISOString());
  }

  if (clauses.length === 0) {
    return { clause: '', params: [] };
  }

  return { clause: 'AND ' + clauses.join(' AND '), params };
}

/**
 * Build filter clause for search options
 */
function buildFilterClause(options: SearchOptions): { clause: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.sourceType) {
    clauses.push('kn.source_type = ?');
    params.push(options.sourceType);
  }
  if (options.sourcePlatform) {
    clauses.push('kn.source_platform = ?');
    params.push(options.sourcePlatform);
  }
  if (options.minRetention !== undefined) {
    clauses.push('kn.retention_strength >= ?');
    params.push(options.minRetention);
  }
  if (options.maxRetention !== undefined) {
    clauses.push('kn.retention_strength <= ?');
    params.push(options.maxRetention);
  }
  if (options.dateFrom) {
    clauses.push('kn.created_at >= ?');
    params.push(options.dateFrom.toISOString());
  }
  if (options.dateTo) {
    clauses.push('kn.created_at <= ?');
    params.push(options.dateTo.toISOString());
  }
  if (options.tags && options.tags.length > 0) {
    // Check if any tag matches (JSON array contains)
    const tagClauses = options.tags.map(() => "kn.tags LIKE ?");
    clauses.push(`(${tagClauses.join(' OR ')})`);
    options.tags.forEach(tag => params.push(`%"${tag}"%`));
  }

  if (clauses.length === 0) {
    return { clause: '', params: [] };
  }

  return { clause: 'AND ' + clauses.join(' AND '), params };
}

/**
 * Sanitize FTS5 query to prevent injection
 */
function sanitizeQuery(query: string): string {
  // FTS5 special characters that need to be escaped or removed: AND OR NOT ( ) " * ^
  return query
    .replace(/[^\w\s\-]/g, ' ')  // Remove special characters except hyphen
    .trim();
}

/**
 * Parse row to SearchResult
 */
function rowToSearchResult(row: Record<string, unknown>, rank: number): SearchResult {
  // FTS5 rank is negative (more negative = better match), convert to positive score
  const score = rank < 0 ? 1 / (1 - rank) : 0;

  return {
    id: row['id'] as string,
    score,
    content: row['content'] as string,
    summary: row['summary'] as string | null,
    tags: JSON.parse((row['tags'] as string) || '[]'),
    createdAt: new Date(row['created_at'] as string),
    lastAccessedAt: new Date(row['last_accessed_at'] as string),
    retentionStrength: row['retention_strength'] as number,
    sourceType: row['source_type'] as string,
    sourcePlatform: row['source_platform'] as string,
  };
}

/**
 * Keyword search using FTS5
 *
 * @param db - Database instance
 * @param query - Search query
 * @param options - Search options
 * @returns Paginated search results
 */
export function keywordSearch(
  db: Database,
  query: string,
  options: SearchOptions = {}
): PaginatedSearchResult {
  // Validate and sanitize query
  if (query.length > MAX_QUERY_LENGTH) {
    throw new Error(`Query too long: max ${MAX_QUERY_LENGTH} characters`);
  }

  const sanitizedQuery = sanitizeQuery(query);
  if (!sanitizedQuery) {
    return {
      items: [],
      total: 0,
      limit: options.limit ?? DEFAULT_LIMIT,
      offset: options.offset ?? 0,
      hasMore: false,
    };
  }

  const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, options.offset ?? 0);

  // Build filter clause
  const filterClause = buildFilterClause(options);

  // Get total count
  const countSql = `
    SELECT COUNT(*) as total FROM knowledge_nodes kn
    JOIN knowledge_fts fts ON kn.id = fts.id
    WHERE knowledge_fts MATCH ?
    ${filterClause.clause}
  `;
  const countResult = db.query(countSql).get(sanitizedQuery, ...filterClause.params) as { total: number };
  const total = countResult.total;

  // Get results with rank
  const searchSql = `
    SELECT kn.*, fts.rank FROM knowledge_nodes kn
    JOIN knowledge_fts fts ON kn.id = fts.id
    WHERE knowledge_fts MATCH ?
    ${filterClause.clause}
    ORDER BY rank
    LIMIT ? OFFSET ?
  `;
  const rows = db.query(searchSql).all(sanitizedQuery, ...filterClause.params, limit, offset) as (Record<string, unknown> & { rank: number })[];

  const items = rows.map(row => rowToSearchResult(row, row.rank));

  // Apply minimum score filter if specified
  const filteredItems = options.minScore !== undefined
    ? items.filter(item => item.score >= options.minScore!)
    : items;

  return {
    items: filteredItems,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

/**
 * Get keyword search candidates for hybrid search (returns more results for fusion)
 */
export function getKeywordCandidates(
  db: Database,
  query: string,
  count: number,
  temporalFilter?: TemporalFilter
): SearchResult[] {
  const sanitizedQuery = sanitizeQuery(query);
  if (!sanitizedQuery) {
    return [];
  }

  const temporal = buildTemporalClause(temporalFilter);

  const sql = `
    SELECT kn.*, fts.rank FROM knowledge_nodes kn
    JOIN knowledge_fts fts ON kn.id = fts.id
    WHERE knowledge_fts MATCH ?
    ${temporal.clause}
    ORDER BY rank
    LIMIT ?
  `;

  const rows = db.query(sql).all(sanitizedQuery, ...temporal.params, count) as (Record<string, unknown> & { rank: number })[];

  return rows.map(row => rowToSearchResult(row, row.rank));
}

/**
 * Check if a query contains valid FTS5 terms
 */
export function isValidQuery(query: string): boolean {
  const sanitized = sanitizeQuery(query);
  return sanitized.length > 0;
}
