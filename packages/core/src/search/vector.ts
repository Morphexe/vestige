/**
 * Vector Search Module
 *
 * Semantic similarity search using embedding vectors.
 * Supports cosine similarity for finding related content.
 */

import { Database } from 'bun:sqlite';
import type { EmbeddingService } from '../core/embeddings.js';
import { cosineSimilarity } from '../core/embeddings.js';
import type { SearchResult, SearchOptions, TemporalFilter } from './types.js';

/** Default number of results */
const DEFAULT_LIMIT = 10;

/**
 * Stored embedding with node metadata
 */
interface StoredEmbedding {
  nodeId: string;
  embedding: number[];
}

/**
 * Knowledge node with embedding
 */
interface NodeWithEmbedding {
  id: string;
  content: string;
  summary: string | null;
  tags: string;
  createdAt: string;
  lastAccessedAt: string;
  retentionStrength: number;
  sourceType: string;
  sourcePlatform: string;
  embedding: Buffer | null;
}

/**
 * Parse row to SearchResult
 */
function rowToSearchResult(row: NodeWithEmbedding, score: number): SearchResult {
  return {
    id: row.id,
    score,
    content: row.content,
    summary: row.summary,
    tags: JSON.parse(row.tags || '[]'),
    createdAt: new Date(row.createdAt),
    lastAccessedAt: new Date(row.lastAccessedAt),
    retentionStrength: row.retentionStrength,
    sourceType: row.sourceType,
    sourcePlatform: row.sourcePlatform,
  };
}

/**
 * Build temporal filter SQL
 */
function buildTemporalFilter(filter?: TemporalFilter): { clause: string; params: unknown[] } {
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

  return { clause: 'WHERE ' + clauses.join(' AND '), params };
}

/**
 * Deserialize embedding from database BLOB
 */
function deserializeEmbedding(buffer: Buffer | null): number[] | null {
  if (!buffer) return null;

  // Stored as Float32Array buffer
  const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4);
  return Array.from(floatArray);
}

/**
 * Serialize embedding for database storage
 */
export function serializeEmbedding(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

/**
 * Vector similarity search
 *
 * @param db - Database instance
 * @param embeddingService - Service to generate query embedding
 * @param query - Search query text
 * @param options - Search options
 * @returns Array of search results sorted by similarity
 */
export async function vectorSearch(
  db: Database,
  embeddingService: EmbeddingService,
  query: string,
  options: SearchOptions = {}
): Promise<SearchResult[]> {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const minScore = options.minScore ?? 0;

  // Generate query embedding
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  // Get all nodes with embeddings
  const temporal = buildTemporalFilter(options.dateFrom || options.dateTo ? {
    createdAfter: options.dateFrom,
    createdBefore: options.dateTo,
  } : undefined);

  const sql = `
    SELECT
      kn.id,
      kn.content,
      kn.summary,
      kn.tags,
      kn.created_at as createdAt,
      kn.last_accessed_at as lastAccessedAt,
      kn.retention_strength as retentionStrength,
      kn.source_type as sourceType,
      kn.source_platform as sourcePlatform,
      e.embedding
    FROM knowledge_nodes kn
    INNER JOIN embeddings e ON kn.id = e.node_id
    ${temporal.clause}
  `;

  const rows = db.query(sql).all(...temporal.params) as NodeWithEmbedding[];

  // Calculate similarity for each node
  const scored: { row: NodeWithEmbedding; score: number }[] = [];

  for (const row of rows) {
    const embedding = deserializeEmbedding(row.embedding);
    if (!embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    // Normalize from [-1, 1] to [0, 1]
    const score = (similarity + 1) / 2;

    if (score >= minScore) {
      scored.push({ row, score });
    }
  }

  // Sort by similarity descending
  scored.sort((a, b) => b.score - a.score);

  // Return top results
  return scored.slice(0, limit).map(({ row, score }) => rowToSearchResult(row, score));
}

/**
 * Get vector search candidates for hybrid search
 */
export async function getVectorCandidates(
  db: Database,
  embeddingService: EmbeddingService,
  query: string,
  count: number,
  temporalFilter?: TemporalFilter
): Promise<SearchResult[]> {
  // Generate query embedding
  const queryEmbedding = await embeddingService.generateEmbedding(query);

  const temporal = buildTemporalFilter(temporalFilter);

  const sql = `
    SELECT
      kn.id,
      kn.content,
      kn.summary,
      kn.tags,
      kn.created_at as createdAt,
      kn.last_accessed_at as lastAccessedAt,
      kn.retention_strength as retentionStrength,
      kn.source_type as sourceType,
      kn.source_platform as sourcePlatform,
      e.embedding
    FROM knowledge_nodes kn
    INNER JOIN embeddings e ON kn.id = e.node_id
    ${temporal.clause}
  `;

  const rows = db.query(sql).all(...temporal.params) as NodeWithEmbedding[];

  // Calculate similarity for each node
  const scored: { row: NodeWithEmbedding; score: number }[] = [];

  for (const row of rows) {
    const embedding = deserializeEmbedding(row.embedding);
    if (!embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, embedding);
    // Normalize from [-1, 1] to [0, 1]
    const score = (similarity + 1) / 2;

    scored.push({ row, score });
  }

  // Sort by similarity descending
  scored.sort((a, b) => b.score - a.score);

  // Return top candidates
  return scored.slice(0, count).map(({ row, score }) => rowToSearchResult(row, score));
}

/**
 * Store embedding for a node
 */
export function storeEmbedding(
  db: Database,
  nodeId: string,
  embedding: number[],
  model: string
): void {
  const embeddingBuffer = serializeEmbedding(embedding);

  db.query(`
    INSERT INTO embeddings (node_id, embedding, model, created_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(node_id) DO UPDATE SET
      embedding = excluded.embedding,
      model = excluded.model,
      created_at = excluded.created_at
  `).run(nodeId, embeddingBuffer, model, new Date().toISOString());
}

/**
 * Get embedding for a node
 */
export function getEmbedding(db: Database, nodeId: string): number[] | null {
  const row = db.query(`
    SELECT embedding FROM embeddings WHERE node_id = ?
  `).get(nodeId) as { embedding: Buffer | null } | null;

  if (!row) return null;
  return deserializeEmbedding(row.embedding);
}

/**
 * Find similar nodes to a given node
 */
export async function findSimilarNodes(
  db: Database,
  nodeId: string,
  count: number = 10
): Promise<SearchResult[]> {
  // Get the node's embedding
  const nodeEmbedding = getEmbedding(db, nodeId);
  if (!nodeEmbedding) {
    return [];
  }

  // Get all other nodes with embeddings
  const sql = `
    SELECT
      kn.id,
      kn.content,
      kn.summary,
      kn.tags,
      kn.created_at as createdAt,
      kn.last_accessed_at as lastAccessedAt,
      kn.retention_strength as retentionStrength,
      kn.source_type as sourceType,
      kn.source_platform as sourcePlatform,
      e.embedding
    FROM knowledge_nodes kn
    INNER JOIN embeddings e ON kn.id = e.node_id
    WHERE kn.id != ?
  `;

  const rows = db.query(sql).all(nodeId) as NodeWithEmbedding[];

  // Calculate similarity for each node
  const scored: { row: NodeWithEmbedding; score: number }[] = [];

  for (const row of rows) {
    const embedding = deserializeEmbedding(row.embedding);
    if (!embedding) continue;

    const similarity = cosineSimilarity(nodeEmbedding, embedding);
    // Normalize from [-1, 1] to [0, 1]
    const score = (similarity + 1) / 2;

    scored.push({ row, score });
  }

  // Sort by similarity descending
  scored.sort((a, b) => b.score - a.score);

  // Return top results
  return scored.slice(0, count).map(({ row, score }) => rowToSearchResult(row, score));
}
