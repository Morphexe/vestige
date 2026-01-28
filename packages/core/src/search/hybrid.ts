/**
 * Hybrid Search Module
 *
 * Combines keyword (FTS5) and vector (semantic) search using
 * Reciprocal Rank Fusion (RRF) for optimal results.
 *
 * RRF formula: score = Σ 1/(k + rank)
 * where k is typically 60 (default) and rank is position in each list.
 */

import { Database } from 'bun:sqlite';
import type { EmbeddingService } from '../core/embeddings.js';
import type {
  SearchResult,
  SearchOptions,
  HybridSearchConfig,
  TemporalFilter,
  PaginatedSearchResult,
} from './types.js';
import { getKeywordCandidates } from './keyword.js';
import { getVectorCandidates } from './vector.js';

/** Default RRF constant */
const DEFAULT_RRF_K = 60;
/** Default weight for keyword search */
const DEFAULT_KEYWORD_WEIGHT = 0.5;
/** Default weight for vector search */
const DEFAULT_VECTOR_WEIGHT = 0.5;
/** Default candidate multiplier (get more candidates than requested results) */
const DEFAULT_CANDIDATE_MULTIPLIER = 3;

/**
 * Calculate Reciprocal Rank Fusion score
 *
 * @param keywordRank - Rank in keyword results (1-indexed, 0 if not found)
 * @param vectorRank - Rank in vector results (1-indexed, 0 if not found)
 * @param k - RRF constant (typically 60)
 * @param keywordWeight - Weight for keyword score
 * @param vectorWeight - Weight for vector score
 * @returns Combined RRF score
 */
function calculateRRFScore(
  keywordRank: number,
  vectorRank: number,
  k: number,
  keywordWeight: number,
  vectorWeight: number
): number {
  let score = 0;

  if (keywordRank > 0) {
    score += keywordWeight / (k + keywordRank);
  }

  if (vectorRank > 0) {
    score += vectorWeight / (k + vectorRank);
  }

  return score;
}

/**
 * Merge and rank results using RRF
 *
 * @param keywordResults - Results from keyword search (sorted by keyword relevance)
 * @param vectorResults - Results from vector search (sorted by similarity)
 * @param config - Hybrid search configuration
 * @returns Merged results sorted by RRF score
 */
function mergeWithRRF(
  keywordResults: SearchResult[],
  vectorResults: SearchResult[],
  config: HybridSearchConfig
): SearchResult[] {
  const k = config.rrfK ?? DEFAULT_RRF_K;
  const keywordWeight = config.keywordWeight ?? DEFAULT_KEYWORD_WEIGHT;
  const vectorWeight = config.vectorWeight ?? DEFAULT_VECTOR_WEIGHT;

  // Create rank maps (1-indexed)
  const keywordRanks = new Map<string, number>();
  keywordResults.forEach((r, i) => keywordRanks.set(r.id, i + 1));

  const vectorRanks = new Map<string, number>();
  vectorResults.forEach((r, i) => vectorRanks.set(r.id, i + 1));

  // Collect all unique results
  const allResults = new Map<string, SearchResult>();
  for (const r of keywordResults) {
    allResults.set(r.id, r);
  }
  for (const r of vectorResults) {
    if (!allResults.has(r.id)) {
      allResults.set(r.id, r);
    }
  }

  // Calculate RRF scores
  const scored: { result: SearchResult; rrfScore: number }[] = [];
  for (const [id, result] of allResults) {
    const keywordRank = keywordRanks.get(id) ?? 0;
    const vectorRank = vectorRanks.get(id) ?? 0;

    const rrfScore = calculateRRFScore(
      keywordRank,
      vectorRank,
      k,
      keywordWeight,
      vectorWeight
    );

    scored.push({
      result: { ...result, score: rrfScore },
      rrfScore,
    });
  }

  // Sort by RRF score descending
  scored.sort((a, b) => b.rrfScore - a.rrfScore);

  return scored.map(s => s.result);
}

/**
 * Hybrid search combining keyword and vector search with RRF
 *
 * @param db - Database instance
 * @param embeddingService - Embedding service for vector search
 * @param query - Search query
 * @param options - Search options
 * @param config - Hybrid search configuration
 * @returns Paginated search results
 */
export async function hybridSearch(
  db: Database,
  embeddingService: EmbeddingService | null,
  query: string,
  options: SearchOptions = {},
  config: HybridSearchConfig = {}
): Promise<PaginatedSearchResult> {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const candidateMultiplier = config.candidateMultiplier ?? DEFAULT_CANDIDATE_MULTIPLIER;
  const candidateCount = limit * candidateMultiplier;

  // Build temporal filter
  const temporalFilter: TemporalFilter | undefined =
    options.dateFrom || options.dateTo
      ? { createdAfter: options.dateFrom, createdBefore: options.dateTo }
      : undefined;

  // Get keyword candidates
  const keywordCandidates = getKeywordCandidates(db, query, candidateCount, temporalFilter);

  // Get vector candidates if embedding service is available
  let vectorCandidates: SearchResult[] = [];
  if (embeddingService) {
    try {
      const available = await embeddingService.isAvailable();
      if (available) {
        vectorCandidates = await getVectorCandidates(
          db,
          embeddingService,
          query,
          candidateCount,
          temporalFilter
        );
      }
    } catch (error) {
      // Vector search failed, continue with keyword only
      console.warn('Vector search failed, using keyword search only:', error);
    }
  }

  // Merge with RRF
  let merged: SearchResult[];
  if (vectorCandidates.length > 0) {
    merged = mergeWithRRF(keywordCandidates, vectorCandidates, config);
  } else {
    // No vector results, use keyword results only
    merged = keywordCandidates;
  }

  // Apply filters
  let filtered = merged;

  if (options.minScore !== undefined) {
    filtered = filtered.filter(r => r.score >= options.minScore!);
  }

  if (options.sourceType) {
    filtered = filtered.filter(r => r.sourceType === options.sourceType);
  }

  if (options.sourcePlatform) {
    filtered = filtered.filter(r => r.sourcePlatform === options.sourcePlatform);
  }

  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter(r =>
      options.tags!.some(tag => r.tags.includes(tag))
    );
  }

  if (options.minRetention !== undefined) {
    filtered = filtered.filter(r => r.retentionStrength >= options.minRetention!);
  }

  if (options.maxRetention !== undefined) {
    filtered = filtered.filter(r => r.retentionStrength <= options.maxRetention!);
  }

  // Paginate
  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    items: paginated,
    total,
    limit,
    offset,
    hasMore: offset + paginated.length < total,
  };
}

/**
 * Keyword-only search (when vector search is not needed)
 */
export function keywordOnlySearch(
  db: Database,
  query: string,
  options: SearchOptions = {}
): PaginatedSearchResult {
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const candidateCount = limit * 3;

  const temporalFilter: TemporalFilter | undefined =
    options.dateFrom || options.dateTo
      ? { createdAfter: options.dateFrom, createdBefore: options.dateTo }
      : undefined;

  const results = getKeywordCandidates(db, query, candidateCount, temporalFilter);

  // Apply filters
  let filtered = results;

  if (options.minScore !== undefined) {
    filtered = filtered.filter(r => r.score >= options.minScore!);
  }

  if (options.sourceType) {
    filtered = filtered.filter(r => r.sourceType === options.sourceType);
  }

  if (options.sourcePlatform) {
    filtered = filtered.filter(r => r.sourcePlatform === options.sourcePlatform);
  }

  if (options.tags && options.tags.length > 0) {
    filtered = filtered.filter(r =>
      options.tags!.some(tag => r.tags.includes(tag))
    );
  }

  const total = filtered.length;
  const paginated = filtered.slice(offset, offset + limit);

  return {
    items: paginated,
    total,
    limit,
    offset,
    hasMore: offset + paginated.length < total,
  };
}

/**
 * Quick search with sensible defaults
 */
export async function quickSearch(
  db: Database,
  embeddingService: EmbeddingService | null,
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const result = await hybridSearch(db, embeddingService, query, { limit });
  return result.items;
}
