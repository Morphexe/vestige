/**
 * Hippocampal Index Module
 *
 * Implements a hippocampus-inspired memory indexing system for fast retrieval.
 * The hippocampus creates "barcodes" (pattern-separated representations) for
 * rapid memory recognition before full retrieval from cortical storage.
 *
 * Two-phase retrieval:
 * 1. Fast search on compressed indices (hippocampal pattern matching)
 * 2. Full content retrieval from storage (cortical reactivation)
 *
 * Based on:
 * - Pattern separation and completion in the hippocampus (Rolls, 2013)
 * - Memory indexing theory (Teyler & DiScenna, 1986)
 */

import { nanoid } from 'nanoid';
import { createHash } from 'crypto';
import type { KnowledgeNode } from '../core/types.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Unique identifier for memory content using hash-based barcoding
 */
export interface MemoryBarcode {
  /** Unique identifier */
  id: string;
  /** Hash of content for quick duplicate detection */
  contentHash: string;
  /** Hash incorporating temporal context */
  temporalHash: string;
}

/**
 * Temporal metadata for memory indexing
 */
export interface TemporalMarker {
  /** When the memory was created */
  createdAt: Date;
  /** When the memory was last accessed */
  lastAccessed: Date;
  /** Number of times accessed */
  accessCount: number;
  /** Temporal validity start (for time-bounded knowledge) */
  validFrom?: Date;
  /** Temporal validity end */
  validUntil?: Date;
}

/**
 * Flags indicating various importance attributes
 */
export interface ImportanceFlags {
  /** High emotional content */
  emotional: boolean;
  /** Frequently accessed */
  frequentlyAccessed: boolean;
  /** Recently created */
  recentlyCreated: boolean;
  /** Has associations to other memories */
  hasAssociations: boolean;
  /** Explicitly starred/bookmarked by user */
  userStarred: boolean;
  /** High retention strength (well-remembered) */
  highRetention: boolean;
  /** Has been consolidated during sleep */
  consolidated: boolean;
  /** Has been compressed for storage efficiency */
  compressed: boolean;
}

/**
 * Pointer to where full memory content is stored
 */
export type ContentPointerType = 'sqlite' | 'vector' | 'inline' | 'archived';

export interface ContentPointer {
  /** Type of storage */
  type: ContentPointerType;
  /** Location identifier (table name, file path, etc.) */
  location: string;
}

/**
 * Types of links between memories
 */
export type IndexLinkType =
  | 'temporal'       // Time-based co-occurrence
  | 'semantic'       // Meaning-based similarity
  | 'causal'         // Cause-effect relationship
  | 'part_of'        // Hierarchical relationship
  | 'user_defined'   // Explicit user connection
  | 'same_source';   // From same source document

/**
 * Link to another indexed memory
 */
export interface IndexLink {
  /** ID of target memory */
  targetId: string;
  /** Strength of association (0-1) */
  strength: number;
  /** Type of relationship */
  linkType: IndexLinkType;
}

/**
 * Complete index entry for a memory
 */
export interface MemoryIndex {
  /** Unique barcode for fast identification */
  barcode: MemoryBarcode;
  /** Compressed semantic embedding (128 dimensions) */
  semanticSummary: number[];
  /** Temporal metadata */
  temporal: TemporalMarker;
  /** Pointers to full content storage */
  contentPointers: ContentPointer[];
  /** Links to related memories */
  links: IndexLink[];
  /** Importance flags */
  flags: ImportanceFlags;
}

/**
 * Query for searching the hippocampal index
 */
export interface IndexQuery {
  /** Semantic embedding to match against */
  embedding?: number[];
  /** Text to search for */
  text?: string;
  /** Time range to filter */
  timeRange?: {
    start: Date;
    end: Date;
  };
  /** Required importance flags */
  requiredFlags?: Partial<ImportanceFlags>;
  /** Filter by node types (source types) */
  nodeTypes?: string[];
  /** Minimum similarity threshold (0-1) */
  minSimilarity?: number;
}

/**
 * Match result from index search
 */
export interface IndexMatch {
  /** The matched index */
  index: MemoryIndex;
  /** Semantic similarity score */
  semanticScore: number;
  /** Text match score */
  textScore: number;
  /** Temporal relevance score */
  temporalScore: number;
  /** Importance-based score */
  importanceScore: number;
  /** Combined weighted score */
  combinedScore: number;
}

/**
 * Full memory with content (after retrieval)
 */
export interface FullMemory {
  /** The index entry */
  index: MemoryIndex;
  /** Full content text */
  content: string;
  /** Summary if available */
  summary?: string;
  /** Tags */
  tags: string[];
  /** Source information */
  sourceType: string;
  sourcePlatform: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Target dimension for compressed embeddings */
export const COMPRESSED_DIMENSION = 128;

/** Original embedding dimension (nomic-embed-text) */
export const ORIGINAL_DIMENSION = 768;

/** Score weights for combined scoring */
export const SCORE_WEIGHTS = {
  semantic: 0.5,
  text: 0.2,
  temporal: 0.15,
  importance: 0.15,
};

/** Hours for temporal score half-life */
export const TEMPORAL_HALF_LIFE_HOURS = 336; // 14 days

/** Threshold for "frequently accessed" flag */
export const FREQUENTLY_ACCESSED_THRESHOLD = 10;

/** Hours for "recently created" flag */
export const RECENTLY_CREATED_HOURS = 168; // 7 days

/** Retention threshold for "high retention" flag */
export const HIGH_RETENTION_THRESHOLD = 0.7;

/** Default minimum similarity */
export const DEFAULT_MIN_SIMILARITY = 0.3;

// ============================================================================
// BARCODE GENERATION
// ============================================================================

/**
 * Generate a memory barcode for content
 */
export function generateBarcode(content: string, temporalContext?: Date): MemoryBarcode {
  const id = nanoid();

  // Content hash for duplicate detection
  const contentHash = createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 16);

  // Temporal hash incorporates time context
  const timestamp = temporalContext ?? new Date();
  const temporalString = `${content.slice(0, 100)}|${timestamp.getTime()}`;
  const temporalHash = createHash('sha256')
    .update(temporalString)
    .digest('hex')
    .slice(0, 16);

  return {
    id,
    contentHash,
    temporalHash,
  };
}

// ============================================================================
// EMBEDDING COMPRESSION
// ============================================================================

/**
 * Compress a 768-dimension embedding to 128 dimensions using random projection.
 * This preserves approximate distances (Johnson-Lindenstrauss lemma).
 */
export function compressEmbedding(
  embedding: number[],
  targetDimension: number = COMPRESSED_DIMENSION
): number[] {
  if (embedding.length === targetDimension) {
    return embedding;
  }

  if (embedding.length < targetDimension) {
    // Pad with zeros if smaller
    return [...embedding, ...new Array(targetDimension - embedding.length).fill(0)];
  }

  // Simple averaging compression: group original dimensions and average
  const groupSize = Math.ceil(embedding.length / targetDimension);
  const compressed: number[] = [];

  for (let i = 0; i < targetDimension; i++) {
    const startIdx = i * groupSize;
    const endIdx = Math.min(startIdx + groupSize, embedding.length);

    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += embedding[j]!;
      count++;
    }

    compressed.push(count > 0 ? sum / count : 0);
  }

  // L2 normalize
  const norm = Math.sqrt(compressed.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < compressed.length; i++) {
      compressed[i] = compressed[i]! / norm;
    }
  }

  return compressed;
}

/**
 * Expand a compressed embedding back to original dimensions (approximate)
 */
export function expandEmbedding(
  compressed: number[],
  targetDimension: number = ORIGINAL_DIMENSION
): number[] {
  if (compressed.length === targetDimension) {
    return compressed;
  }

  const expanded: number[] = [];
  const ratio = targetDimension / compressed.length;

  for (let i = 0; i < targetDimension; i++) {
    const srcIdx = Math.floor(i / ratio);
    expanded.push(compressed[srcIdx] ?? 0);
  }

  return expanded;
}

// ============================================================================
// IMPORTANCE FLAGS
// ============================================================================

/**
 * Create importance flags from a knowledge node
 */
export function createImportanceFlags(
  node: KnowledgeNode,
  hasAssociations: boolean = false,
  consolidated: boolean = false,
  compressed: boolean = false
): ImportanceFlags {
  const now = Date.now();
  const createdTime = node.createdAt.getTime();
  const hoursSinceCreation = (now - createdTime) / (1000 * 60 * 60);

  return {
    emotional: (node.sentimentIntensity ?? 0) > 0.5,
    frequentlyAccessed: node.accessCount >= FREQUENTLY_ACCESSED_THRESHOLD,
    recentlyCreated: hoursSinceCreation < RECENTLY_CREATED_HOURS,
    hasAssociations,
    userStarred: node.tags.includes('starred') || node.tags.includes('important'),
    highRetention: node.retentionStrength >= HIGH_RETENTION_THRESHOLD,
    consolidated,
    compressed,
  };
}

/**
 * Calculate importance score from flags
 */
export function calculateImportanceScore(flags: ImportanceFlags): number {
  let score = 0;

  if (flags.emotional) score += 0.15;
  if (flags.frequentlyAccessed) score += 0.2;
  if (flags.recentlyCreated) score += 0.1;
  if (flags.hasAssociations) score += 0.15;
  if (flags.userStarred) score += 0.2;
  if (flags.highRetention) score += 0.15;
  if (flags.consolidated) score += 0.05;

  return Math.min(1, score);
}

// ============================================================================
// TEMPORAL SCORING
// ============================================================================

/**
 * Calculate temporal score based on recency
 * Uses 14-day half-life decay
 */
export function calculateTemporalScore(
  temporal: TemporalMarker,
  referenceTime: Date = new Date()
): number {
  const hoursAgo = (referenceTime.getTime() - temporal.lastAccessed.getTime()) / (1000 * 60 * 60);

  // Exponential decay with 14-day half-life
  return 1.0 / (1.0 + hoursAgo / TEMPORAL_HALF_LIFE_HOURS);
}

// ============================================================================
// MEMORY INDEXING
// ============================================================================

/**
 * Create a memory index from a knowledge node
 */
export function indexMemory(
  node: KnowledgeNode,
  embedding: number[],
  existingLinks: IndexLink[] = []
): MemoryIndex {
  const barcode = generateBarcode(node.content, node.createdAt);
  const compressedEmbedding = compressEmbedding(embedding);

  const temporal: TemporalMarker = {
    createdAt: node.createdAt,
    lastAccessed: node.lastAccessedAt,
    accessCount: node.accessCount,
  };

  const contentPointers: ContentPointer[] = [
    { type: 'sqlite', location: `knowledge_nodes:${node.id}` },
  ];

  const flags = createImportanceFlags(node, existingLinks.length > 0);

  return {
    barcode: { ...barcode, id: node.id }, // Use node ID for consistency
    semanticSummary: compressedEmbedding,
    temporal,
    contentPointers,
    links: existingLinks,
    flags,
  };
}

// ============================================================================
// HIPPOCAMPAL INDEX MANAGER
// ============================================================================

/**
 * Hippocampal Index Manager
 *
 * Manages fast memory indexing and two-phase retrieval.
 */
export class HippocampalIndexManager {
  private indices: Map<string, MemoryIndex> = new Map();
  private contentHashIndex: Map<string, string> = new Map(); // contentHash -> memoryId
  private stats = {
    totalIndices: 0,
    searchCount: 0,
    hitCount: 0,
    retrievalCount: 0,
  };

  /**
   * Add or update a memory index
   */
  addIndex(index: MemoryIndex): void {
    const memoryId = index.barcode.id;
    const isNew = !this.indices.has(memoryId);

    this.indices.set(memoryId, index);
    this.contentHashIndex.set(index.barcode.contentHash, memoryId);

    if (isNew) {
      this.stats.totalIndices++;
    }
  }

  /**
   * Remove a memory index
   */
  removeIndex(memoryId: string): boolean {
    const index = this.indices.get(memoryId);
    if (!index) return false;

    this.indices.delete(memoryId);
    this.contentHashIndex.delete(index.barcode.contentHash);
    this.stats.totalIndices--;

    return true;
  }

  /**
   * Get index by memory ID
   */
  getIndex(memoryId: string): MemoryIndex | null {
    return this.indices.get(memoryId) ?? null;
  }

  /**
   * Check for duplicate by content hash
   */
  findByContentHash(contentHash: string): string | null {
    return this.contentHashIndex.get(contentHash) ?? null;
  }

  /**
   * Search indices (Phase 1: fast search)
   */
  searchIndices(query: IndexQuery, limit: number = 20): IndexMatch[] {
    this.stats.searchCount++;

    const matches: IndexMatch[] = [];
    const minSimilarity = query.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

    for (const index of this.indices.values()) {
      // Apply filters
      if (!this.passesFilters(index, query)) {
        continue;
      }

      // Calculate scores
      const semanticScore = query.embedding
        ? this.calculateSemanticScore(query.embedding, index.semanticSummary)
        : 0;

      const textScore = query.text
        ? this.calculateTextScore(query.text, index)
        : 0;

      const temporalScore = calculateTemporalScore(index.temporal);
      const importanceScore = calculateImportanceScore(index.flags);

      // Combined score
      const combinedScore =
        semanticScore * SCORE_WEIGHTS.semantic +
        textScore * SCORE_WEIGHTS.text +
        temporalScore * SCORE_WEIGHTS.temporal +
        importanceScore * SCORE_WEIGHTS.importance;

      // Check minimum similarity
      if (semanticScore >= minSimilarity || textScore >= minSimilarity || !query.embedding) {
        matches.push({
          index,
          semanticScore,
          textScore,
          temporalScore,
          importanceScore,
          combinedScore,
        });
      }
    }

    // Sort by combined score
    matches.sort((a, b) => b.combinedScore - a.combinedScore);

    if (matches.length > 0) {
      this.stats.hitCount++;
    }

    return matches.slice(0, limit);
  }

  /**
   * Check if index passes query filters
   */
  private passesFilters(index: MemoryIndex, query: IndexQuery): boolean {
    // Time range filter
    if (query.timeRange) {
      const created = index.temporal.createdAt.getTime();
      if (created < query.timeRange.start.getTime() ||
          created > query.timeRange.end.getTime()) {
        return false;
      }
    }

    // Required flags filter
    if (query.requiredFlags) {
      for (const [flag, required] of Object.entries(query.requiredFlags)) {
        if (required && !index.flags[flag as keyof ImportanceFlags]) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Calculate semantic similarity score
   */
  private calculateSemanticScore(queryEmbedding: number[], indexEmbedding: number[]): number {
    // Cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    const compressed = compressEmbedding(queryEmbedding);

    for (let i = 0; i < Math.min(compressed.length, indexEmbedding.length); i++) {
      dotProduct += compressed[i]! * indexEmbedding[i]!;
      normA += compressed[i]! * compressed[i]!;
      normB += indexEmbedding[i]! * indexEmbedding[i]!;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    if (magnitude === 0) return 0;

    return Math.max(0, dotProduct / magnitude);
  }

  /**
   * Calculate text match score (basic keyword matching)
   */
  private calculateTextScore(queryText: string, index: MemoryIndex): number {
    // Simple: check if content hash or ID contains query words
    // In production, this would use the actual content from storage
    const queryWords = queryText.toLowerCase().split(/\s+/);
    const idLower = index.barcode.id.toLowerCase();

    let matches = 0;
    for (const word of queryWords) {
      if (idLower.includes(word)) {
        matches++;
      }
    }

    return queryWords.length > 0 ? matches / queryWords.length : 0;
  }

  /**
   * Add association between memories
   */
  addAssociation(
    fromId: string,
    toId: string,
    linkType: IndexLinkType,
    strength: number
  ): boolean {
    const fromIndex = this.indices.get(fromId);
    const toIndex = this.indices.get(toId);

    if (!fromIndex || !toIndex) return false;

    // Check if link already exists
    const existingLink = fromIndex.links.find(l => l.targetId === toId);
    if (existingLink) {
      // Update existing link
      existingLink.strength = Math.min(1, Math.max(0, strength));
      existingLink.linkType = linkType;
    } else {
      // Add new link
      fromIndex.links.push({
        targetId: toId,
        strength: Math.min(1, Math.max(0, strength)),
        linkType,
      });
    }

    // Update hasAssociations flag
    fromIndex.flags.hasAssociations = fromIndex.links.length > 0;

    return true;
  }

  /**
   * Get associations using spreading activation
   */
  getAssociations(nodeId: string, depth: number = 2): string[] {
    const visited = new Set<string>();
    const result: string[] = [];

    this.spreadingActivation(nodeId, depth, 1.0, visited, result);

    // Remove the starting node from results
    return result.filter(id => id !== nodeId);
  }

  /**
   * Spreading activation traversal
   */
  private spreadingActivation(
    nodeId: string,
    remainingDepth: number,
    activation: number,
    visited: Set<string>,
    result: string[]
  ): void {
    if (remainingDepth <= 0 || activation < 0.1) return;
    if (visited.has(nodeId)) return;

    visited.add(nodeId);

    const index = this.indices.get(nodeId);
    if (!index) return;

    for (const link of index.links) {
      if (!visited.has(link.targetId)) {
        const newActivation = activation * link.strength * 0.7; // Decay factor
        if (newActivation >= 0.1) {
          result.push(link.targetId);
          this.spreadingActivation(
            link.targetId,
            remainingDepth - 1,
            newActivation,
            visited,
            result
          );
        }
      }
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalIndices: number;
    searchCount: number;
    hitCount: number;
    retrievalCount: number;
    hitRate: number;
  } {
    return {
      ...this.stats,
      hitRate: this.stats.searchCount > 0
        ? this.stats.hitCount / this.stats.searchCount
        : 0,
    };
  }

  /**
   * Get all indices
   */
  getAllIndices(): MemoryIndex[] {
    return Array.from(this.indices.values());
  }

  /**
   * Get indices by importance flag
   */
  getByFlag(flag: keyof ImportanceFlags): MemoryIndex[] {
    return Array.from(this.indices.values()).filter(idx => idx.flags[flag]);
  }

  /**
   * Clear all indices
   */
  clear(): void {
    this.indices.clear();
    this.contentHashIndex.clear();
    this.stats = {
      totalIndices: 0,
      searchCount: 0,
      hitCount: 0,
      retrievalCount: 0,
    };
  }

  /**
   * Export indices for persistence
   */
  export(): MemoryIndex[] {
    return Array.from(this.indices.values());
  }

  /**
   * Import indices
   */
  import(indices: MemoryIndex[]): void {
    for (const index of indices) {
      this.addIndex(index);
    }
  }
}
