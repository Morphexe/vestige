/**
 * Search Types
 *
 * Shared types for search operations.
 */

/**
 * Search result item with score
 */
export interface SearchResult {
  id: string;
  score: number;
  content: string;
  summary?: string | null;
  tags: string[];
  createdAt: Date;
  lastAccessedAt: Date;
  retentionStrength: number;
  sourceType: string;
  sourcePlatform: string;
}

/**
 * Search options
 */
export interface SearchOptions {
  /** Maximum number of results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Minimum score threshold (0-1) */
  minScore?: number;
  /** Filter by source type */
  sourceType?: string;
  /** Filter by source platform */
  sourcePlatform?: string;
  /** Filter by tags (any match) */
  tags?: string[];
  /** Filter by date range - start */
  dateFrom?: Date;
  /** Filter by date range - end */
  dateTo?: Date;
  /** Minimum retention strength */
  minRetention?: number;
  /** Maximum retention strength */
  maxRetention?: number;
  /** Boost results accessed recently */
  recencyBoost?: boolean;
  /** Boost results with high retention */
  retentionBoost?: boolean;
}

/**
 * Hybrid search configuration
 */
export interface HybridSearchConfig {
  /** Weight for keyword search results (0-1) */
  keywordWeight?: number;
  /** Weight for vector search results (0-1) */
  vectorWeight?: number;
  /** RRF constant (default: 60) */
  rrfK?: number;
  /** Number of candidates from each search */
  candidateMultiplier?: number;
}

/**
 * Reranker configuration
 */
export interface RerankerConfig {
  /** Enable recency decay factor */
  applyRecencyDecay?: boolean;
  /** Enable retention boost */
  applyRetentionBoost?: boolean;
  /** Decay half-life in days for recency */
  recencyHalfLife?: number;
  /** Maximum boost from retention (1.0 = 100% boost for retention=1) */
  maxRetentionBoost?: number;
}

/**
 * Temporal filter options
 */
export interface TemporalFilter {
  /** Filter to items created after this date */
  createdAfter?: Date;
  /** Filter to items created before this date */
  createdBefore?: Date;
  /** Filter to items accessed after this date */
  accessedAfter?: Date;
  /** Filter to items accessed before this date */
  accessedBefore?: Date;
  /** Filter to items with valid_from before this date */
  validAt?: Date;
}

/**
 * Paginated search results
 */
export interface PaginatedSearchResult {
  items: SearchResult[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}
