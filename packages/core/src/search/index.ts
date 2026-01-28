/**
 * Search Module
 *
 * Comprehensive search functionality for Vestige:
 * - Keyword search (FTS5)
 * - Vector search (semantic similarity)
 * - Hybrid search (RRF fusion)
 * - Reranking (recency, retention, diversity)
 */

// Types
export * from './types.js';

// Keyword search (FTS5)
export {
  keywordSearch,
  getKeywordCandidates,
  isValidQuery,
} from './keyword.js';

// Vector search (semantic)
export {
  vectorSearch,
  getVectorCandidates,
  findSimilarNodes,
  storeEmbedding,
  getEmbedding,
  serializeEmbedding,
} from './vector.js';

// Hybrid search (RRF)
export {
  hybridSearch,
  keywordOnlySearch,
  quickSearch,
} from './hybrid.js';

// Reranking
export {
  rerank,
  applyMMR,
  boostKeywords,
  filterByTimeWindow,
  groupBySourceType,
  interleaveBySource,
} from './reranker.js';
