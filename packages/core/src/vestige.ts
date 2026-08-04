/**
 * Vestige Library Entry Point
 *
 * Clean API for using Vestige as an importable library in agent projects.
 * Works with Supabase + pgvector for database and OpenAI for embeddings.
 *
 * @example Basic Usage
 * ```typescript
 * import { createVestige } from '@morphexe/vestige-core';
 *
 * const memory = await createVestige({
 *   supabase: {
 *     url: process.env.SUPABASE_URL!,
 *     serviceKey: process.env.SUPABASE_SERVICE_KEY!,
 *   },
 *   openai: {
 *     apiKey: process.env.OPENAI_API_KEY!,
 *   },
 *   agentId: 'my-agent-123',
 * });
 *
 * // Simple API for agents
 * const id = await memory.remember("User prefers dark mode");
 * const memories = await memory.recall("user preferences");
 * await memory.reinforce(id, 'good');
 *
 * // Cleanup on shutdown
 * await memory.close();
 * ```
 */

import { nanoid } from 'nanoid';
import { FSRSScheduler, Grade, type ReviewGrade } from './core/fsrs.js';
import { cosineSimilarity, type EmbeddingService } from './core/embeddings.js';

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for creating a Vestige memory instance
 */
export interface VestigeLibraryConfig {
  /**
   * Supabase connection configuration.
   * Required for database operations.
   */
  supabase: {
    /** Supabase project URL (e.g., https://xxx.supabase.co) */
    url: string;
    /** Service role key (for server-side) or anon key (for client-side with RLS) */
    serviceKey: string;
    /** Optional: Custom schema name (default: 'public') */
    schema?: string;
    /** Optional: Enable debug logging */
    debug?: boolean;
  };

  /**
   * OpenAI configuration for embeddings.
   * Optional - enables semantic search when provided.
   */
  openai?: {
    /** OpenAI API key */
    apiKey: string;
    /** Embedding model (default: 'text-embedding-3-small') */
    model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'text-embedding-ada-002';
    /** Request timeout in milliseconds (default: 30000) */
    timeout?: number;
    /** Base URL for API (optional, for proxies) */
    baseUrl?: string;
  };

  /**
   * Agent ID for multi-tenancy.
   * Required when multiple agents share the same database.
   * This is used for RLS (Row Level Security) isolation.
   */
  agentId?: string;

  /**
   * FSRS (Free Spaced Repetition Scheduler) configuration.
   * Controls how memory strength evolves over time.
   */
  fsrs?: {
    /** Target retention rate (0.7-0.99, default: 0.9 = 90% recall) */
    desiredRetention?: number;
  };

  /**
   * Memory behavior tuning.
   */
  memory?: {
    /** Storage strength boost on passive access (default: 0.05) */
    storageBoostOnAccess?: number;
    /** Storage strength boost on active review (default: 0.1) */
    storageBoostOnReview?: number;
    /** Half-life for retrieval decay in days (default: 7) */
    retrievalDecayHalfLife?: number;
    /** Minimum retention strength threshold (default: 0.1) */
    minRetentionStrength?: number;
  };

  /**
   * Sentiment analysis configuration.
   * Emotional memories are retained longer.
   */
  sentiment?: {
    /** Stability multiplier for emotional memories (default: 2.0) */
    stabilityBoost?: number;
    /** Minimum boost for neutral content (default: 1.0) */
    minBoost?: number;
  };

  /**
   * REM cycle (connection discovery) configuration.
   */
  rem?: {
    /** Enable REM cycle processing (default: true) */
    enabled?: boolean;
    /** Minimum similarity threshold for connections (default: 0.3) */
    minConnectionStrength?: number;
  };

  /**
   * Consolidation configuration.
   * Controls background memory strengthening.
   */
  consolidation?: {
    /** Enable consolidation (default: true) */
    enabled?: boolean;
    /** Importance threshold for consolidation (default: 0.5) */
    importanceThreshold?: number;
  };

  /**
   * Input/output limits.
   */
  limits?: {
    /** Maximum content length in characters (default: 1MB) */
    maxContentLength?: number;
    /** Maximum batch size (default: 1000) */
    maxBatchSize?: number;
  };
}

/**
 * Options for the remember() method
 */
export interface RememberOptions {
  /** Memory tags for categorization */
  tags?: string[];
  /** Source type (default: 'note') */
  sourceType?: string;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Skip embedding generation */
  skipEmbedding?: boolean;
}

/**
 * Options for the recall() method
 */
export interface RecallOptions {
  /** Maximum number of results (default: 10) */
  limit?: number;
  /** Minimum similarity threshold (0-1, default: 0.5) */
  threshold?: number;
  /** Search method: 'semantic', 'keyword', or 'hybrid' (default: 'hybrid') */
  method?: 'semantic' | 'keyword' | 'hybrid';
  /** Filter by tags */
  tags?: string[];
}

/**
 * A memory returned from recall operations
 */
export interface Memory {
  /** Unique memory ID */
  id: string;
  /** Memory content */
  content: string;
  /** Optional summary */
  summary?: string;
  /** Tags associated with this memory */
  tags: string[];
  /** When the memory was created */
  createdAt: Date;
  /** When the memory was last accessed */
  lastAccessedAt: Date;
  /** Current retention strength (0-1) */
  retentionStrength: number;
  /** Similarity score (for search results) */
  similarity?: number;
  /** Source metadata */
  source?: {
    type: string;
    platform: string;
    url?: string;
  };
}

/**
 * FSRS rating for reinforcing memories
 */
export type ReinforceRating = 'again' | 'hard' | 'good' | 'easy';

/**
 * The main Vestige memory interface for agents
 */
export interface VestigeMemory {
  /**
   * Store a new memory
   * @param content - The content to remember
   * @param options - Optional configuration
   * @returns The ID of the created memory
   */
  remember(content: string, options?: RememberOptions): Promise<string>;

  /**
   * Recall memories relevant to a query
   * @param query - The search query
   * @param options - Optional configuration
   * @returns Array of matching memories
   */
  recall(query: string, options?: RecallOptions): Promise<Memory[]>;

  /**
   * Forget (delete) a memory
   * @param id - The memory ID to delete
   */
  forget(id: string): Promise<void>;

  /**
   * Reinforce a memory using FSRS spaced repetition
   * @param id - The memory ID
   * @param rating - How well the memory was recalled
   */
  reinforce(id: string, rating: ReinforceRating): Promise<void>;

  /**
   * Find memories semantically similar to a given memory
   * @param id - The memory ID
   * @param limit - Maximum results (default: 5)
   * @returns Array of related memories
   */
  getRelated(id: string, limit?: number): Promise<Memory[]>;

  /**
   * Get a single memory by ID
   * @param id - The memory ID
   * @returns The memory or null if not found
   */
  get(id: string): Promise<Memory | null>;

  /**
   * Check if the service is healthy
   * @returns True if all services are operational
   */
  isHealthy(): Promise<boolean>;

  /**
   * Close all connections and clean up resources
   */
  close(): Promise<void>;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Internal implementation of VestigeMemory
 */
class VestigeMemoryImpl implements VestigeMemory {
  private supabase: SupabaseMemoryAdapter;
  private embeddings: EmbeddingService | null = null;
  private fsrs: FSRSScheduler;
  private config: VestigeLibraryConfig;
  private closed = false;

  constructor(
    supabase: SupabaseMemoryAdapter,
    embeddings: EmbeddingService | null,
    fsrs: FSRSScheduler,
    config: VestigeLibraryConfig
  ) {
    this.supabase = supabase;
    this.embeddings = embeddings;
    this.fsrs = fsrs;
    this.config = config;
  }

  async remember(content: string, options?: RememberOptions): Promise<string> {
    if (this.closed) throw new Error('Vestige instance has been closed');

    const maxLength = this.config.limits?.maxContentLength ?? 1_000_000;
    if (content.length > maxLength) {
      throw new Error(`Content exceeds maximum length of ${maxLength} characters`);
    }

    const id = nanoid();
    const now = new Date();

    // Generate embedding if available and not skipped
    let embedding: number[] | undefined;
    if (this.embeddings && !options?.skipEmbedding) {
      try {
        if (await this.embeddings.isAvailable()) {
          embedding = await this.embeddings.generateEmbedding(content);
        }
      } catch (error) {
        console.warn('Failed to generate embedding:', error);
      }
    }

    // Insert into database
    await this.supabase.insertKnowledge({
      id,
      content,
      tags: options?.tags ?? [],
      sourceType: options?.sourceType ?? 'note',
      sourcePlatform: 'api',
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      retentionStrength: 1.0,
      storageStrength: 1.0,
      retrievalStrength: 1.0,
      stabilityFactor: 1.0,
      embedding,
    });

    return id;
  }

  async recall(query: string, options?: RecallOptions): Promise<Memory[]> {
    if (this.closed) throw new Error('Vestige instance has been closed');

    const limit = options?.limit ?? 10;
    const threshold = options?.threshold ?? 0.5;
    const method = options?.method ?? 'hybrid';

    let results: Memory[] = [];

    // Semantic search
    if ((method === 'semantic' || method === 'hybrid') && this.embeddings) {
      try {
        if (await this.embeddings.isAvailable()) {
          const queryEmbedding = await this.embeddings.generateEmbedding(query);
          const semanticResults = await this.supabase.searchByVector(
            queryEmbedding,
            limit,
            threshold
          );
          results = semanticResults.map(r => ({
            id: r.id,
            content: r.content,
            summary: r.summary ?? undefined,
            tags: r.tags ?? [],
            createdAt: new Date(r.createdAt),
            lastAccessedAt: new Date(r.lastAccessedAt),
            retentionStrength: r.retentionStrength,
            similarity: r.similarity,
            source: {
              type: r.sourceType,
              platform: r.sourcePlatform,
              url: r.sourceUrl,
            },
          }));
        }
      } catch (error) {
        console.warn('Semantic search failed:', error);
      }
    }

    // Keyword/full-text search
    if (method === 'keyword' || (method === 'hybrid' && results.length < limit)) {
      const keywordResults = await this.supabase.searchByKeyword(query, limit);
      const existingIds = new Set(results.map(r => r.id));

      for (const r of keywordResults) {
        if (!existingIds.has(r.id)) {
          results.push({
            id: r.id,
            content: r.content,
            summary: r.summary ?? undefined,
            tags: r.tags ?? [],
            createdAt: new Date(r.createdAt),
            lastAccessedAt: new Date(r.lastAccessedAt),
            retentionStrength: r.retentionStrength,
            source: {
              type: r.sourceType,
              platform: r.sourcePlatform,
              url: r.sourceUrl,
            },
          });
        }
      }
    }

    // Filter by tags if specified
    if (options?.tags && options.tags.length > 0) {
      const tagSet = new Set(options.tags);
      results = results.filter(r =>
        r.tags.some(tag => tagSet.has(tag))
      );
    }

    // Update access time for retrieved memories
    for (const memory of results.slice(0, limit)) {
      try {
        await this.supabase.updateAccess(memory.id);
      } catch {
        // Ignore access update errors
      }
    }

    return results.slice(0, limit);
  }

  async forget(id: string): Promise<void> {
    if (this.closed) throw new Error('Vestige instance has been closed');
    await this.supabase.deleteKnowledge(id);
  }

  async reinforce(id: string, rating: ReinforceRating): Promise<void> {
    if (this.closed) throw new Error('Vestige instance has been closed');

    // Map rating to FSRS grade
    const gradeMap: Record<ReinforceRating, ReviewGrade> = {
      again: Grade.Again,
      hard: Grade.Hard,
      good: Grade.Good,
      easy: Grade.Easy,
    };
    const grade = gradeMap[rating];

    // Get current memory state
    const memory = await this.supabase.getKnowledge(id);
    if (!memory) {
      throw new Error(`Memory not found: ${id}`);
    }

    // Create or get FSRS state
    let fsrsState = this.fsrs.newCard();
    if (memory.reviewCount > 0) {
      fsrsState = {
        ...fsrsState,
        reps: memory.reviewCount,
        lastReview: memory.lastAccessedAt,
        state: 'Review',
        stability: memory.stabilityFactor,
      };
    }

    // Calculate elapsed days
    const elapsedDays = (Date.now() - memory.lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Apply FSRS review
    const result = this.fsrs.review(fsrsState, grade, elapsedDays);

    // Update memory with new FSRS state
    await this.supabase.updateFSRS(id, {
      stabilityFactor: result.state.stability,
      retentionStrength: result.retrievability,
      reviewCount: memory.reviewCount + 1,
      nextReviewDate: new Date(Date.now() + result.interval * 24 * 60 * 60 * 1000),
    });
  }

  async getRelated(id: string, limit: number = 5): Promise<Memory[]> {
    if (this.closed) throw new Error('Vestige instance has been closed');

    if (!this.embeddings || !await this.embeddings.isAvailable()) {
      return []; // No semantic search without embeddings
    }

    // Get the source memory's embedding
    const memory = await this.supabase.getKnowledge(id);
    if (!memory?.embedding) {
      return [];
    }

    // Search for similar memories
    const results = await this.supabase.searchByVector(
      memory.embedding,
      limit + 1, // +1 to exclude self
      0.3
    );

    // Filter out the source memory
    return results
      .filter(r => r.id !== id)
      .slice(0, limit)
      .map(r => ({
        id: r.id,
        content: r.content,
        summary: r.summary ?? undefined,
        tags: r.tags ?? [],
        createdAt: new Date(r.createdAt),
        lastAccessedAt: new Date(r.lastAccessedAt),
        retentionStrength: r.retentionStrength,
        similarity: r.similarity,
        source: {
          type: r.sourceType,
          platform: r.sourcePlatform,
          url: r.sourceUrl,
        },
      }));
  }

  async get(id: string): Promise<Memory | null> {
    if (this.closed) throw new Error('Vestige instance has been closed');

    const memory = await this.supabase.getKnowledge(id);
    if (!memory) return null;

    return {
      id: memory.id,
      content: memory.content,
      summary: memory.summary ?? undefined,
      tags: memory.tags ?? [],
      createdAt: memory.createdAt,
      lastAccessedAt: memory.lastAccessedAt,
      retentionStrength: memory.retentionStrength,
      source: {
        type: memory.sourceType,
        platform: memory.sourcePlatform,
        url: memory.sourceUrl,
      },
    };
  }

  async isHealthy(): Promise<boolean> {
    if (this.closed) return false;

    try {
      return await this.supabase.isHealthy();
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.supabase.close();
  }
}

// =============================================================================
// SUPABASE MEMORY ADAPTER
// =============================================================================

/**
 * Internal adapter for Supabase operations
 */
class SupabaseMemoryAdapter {
  private client: SupabaseClient;
  private agentId?: string;
  private closed = false;

  constructor(client: SupabaseClient, agentId?: string) {
    this.client = client;
    this.agentId = agentId;
  }

  async insertKnowledge(data: {
    id: string;
    content: string;
    tags: string[];
    sourceType: string;
    sourcePlatform: string;
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt: Date;
    retentionStrength: number;
    storageStrength: number;
    retrievalStrength: number;
    stabilityFactor: number;
    embedding?: number[];
  }): Promise<void> {
    const { error } = await this.client
      .from('vestige_knowledge')
      .insert({
        id: data.id,
        content: data.content,
        tags: data.tags,
        source_type: data.sourceType,
        source_platform: data.sourcePlatform,
        created_at: data.createdAt.toISOString(),
        updated_at: data.updatedAt.toISOString(),
        last_accessed_at: data.lastAccessedAt.toISOString(),
        retention_strength: data.retentionStrength,
        storage_strength: data.storageStrength,
        retrieval_strength: data.retrievalStrength,
        stability_factor: data.stabilityFactor,
        embedding: data.embedding ? `[${data.embedding.join(',')}]` : null,
        ...(this.agentId && { agent_id: this.agentId }),
      });

    if (error) {
      throw new Error(`Failed to insert knowledge: ${error.message}`);
    }
  }

  async getKnowledge(id: string): Promise<KnowledgeRow | null> {
    const { data, error } = await this.client
      .from('vestige_knowledge')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to get knowledge: ${error.message}`);
    }

    return this.mapRow(data);
  }

  async deleteKnowledge(id: string): Promise<void> {
    const { error } = await this.client
      .from('vestige_knowledge')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete knowledge: ${error.message}`);
    }
  }

  async updateAccess(id: string): Promise<void> {
    const { error } = await this.client
      .from('vestige_knowledge')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: this.client.rpc('increment_access_count'),
      })
      .eq('id', id);

    if (error) {
      // Non-critical, just log
      console.warn(`Failed to update access: ${error.message}`);
    }
  }

  async updateFSRS(id: string, data: {
    stabilityFactor: number;
    retentionStrength: number;
    reviewCount: number;
    nextReviewDate: Date;
  }): Promise<void> {
    const { error } = await this.client
      .from('vestige_knowledge')
      .update({
        stability_factor: data.stabilityFactor,
        retention_strength: data.retentionStrength,
        review_count: data.reviewCount,
        next_review: data.nextReviewDate.toISOString(),
        last_accessed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to update FSRS: ${error.message}`);
    }
  }

  async searchByVector(
    embedding: number[],
    limit: number,
    threshold: number
  ): Promise<VectorSearchRow[]> {
    const { data, error } = await this.client.rpc('vestige_search_similar', {
      query_embedding: `[${embedding.join(',')}]`,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      throw new Error(`Vector search failed: ${error.message}`);
    }

    // Get full records for the matched IDs
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return [];

    const { data: fullData, error: fullError } = await this.client
      .from('vestige_knowledge')
      .select('*')
      .in('id', ids);

    if (fullError) {
      throw new Error(`Failed to get full records: ${fullError.message}`);
    }

    // Merge similarity scores with full data
    const similarityMap = new Map(
      (data ?? []).map((r: { id: string; similarity: number }) => [r.id, r.similarity])
    );

    return (fullData ?? []).map((row: SupabaseRow) => ({
      ...this.mapRow(row),
      similarity: similarityMap.get(row.id) ?? 0,
    }));
  }

  async searchByKeyword(query: string, limit: number): Promise<KnowledgeRow[]> {
    const { data, error } = await this.client
      .from('vestige_knowledge')
      .select('*')
      .textSearch('search_vector', query, { type: 'websearch' })
      .limit(limit);

    if (error) {
      throw new Error(`Keyword search failed: ${error.message}`);
    }

    return (data ?? []).map((row: SupabaseRow) => this.mapRow(row));
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.client
        .from('vestige_metadata')
        .select('key')
        .limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    // Supabase client doesn't have explicit close
  }

  private mapRow(row: SupabaseRow): KnowledgeRow {
    return {
      id: row.id,
      content: row.content,
      summary: row.summary,
      tags: row.tags ?? [],
      sourceType: row.source_type,
      sourcePlatform: row.source_platform,
      sourceUrl: row.source_url,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastAccessedAt: new Date(row.last_accessed_at),
      retentionStrength: row.retention_strength,
      storageStrength: row.storage_strength,
      retrievalStrength: row.retrieval_strength,
      stabilityFactor: row.stability_factor,
      reviewCount: row.review_count ?? 0,
      embedding: row.embedding,
    };
  }
}

// Internal types
interface SupabaseRow {
  id: string;
  content: string;
  summary: string | null;
  tags: string[] | null;
  source_type: string;
  source_platform: string;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  retention_strength: number;
  storage_strength: number;
  retrieval_strength: number;
  stability_factor: number;
  review_count: number | null;
  embedding: number[] | null;
}

interface KnowledgeRow {
  id: string;
  content: string;
  summary: string | null;
  tags: string[];
  sourceType: string;
  sourcePlatform: string;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt: Date;
  retentionStrength: number;
  storageStrength: number;
  retrievalStrength: number;
  stabilityFactor: number;
  reviewCount: number;
  embedding: number[] | null;
}

interface VectorSearchRow extends KnowledgeRow {
  similarity: number;
}

// Minimal Supabase client type
interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  rpc(fn: string, params?: Record<string, unknown>): SupabaseRpcBuilder;
}

interface SupabaseQueryBuilder {
  insert(data: Record<string, unknown>): SupabasePromise;
  select(columns?: string): SupabaseSelectBuilder;
  update(data: Record<string, unknown>): SupabaseFilterBuilder;
  delete(): SupabaseFilterBuilder;
}

interface SupabaseSelectBuilder extends SupabaseFilterBuilder {
  textSearch(column: string, query: string, options?: { type?: string }): SupabaseFilterBuilder;
}

interface SupabaseFilterBuilder {
  eq(column: string, value: unknown): SupabaseFilterBuilder;
  in(column: string, values: unknown[]): SupabaseFilterBuilder;
  limit(count: number): SupabasePromise;
  single(): SupabasePromise;
}

interface SupabaseRpcBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then(onfulfilled?: (value: { data: any; error: any }) => void): Promise<{ data: any; error: any }>;
}

interface SupabasePromise {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  then(onfulfilled?: (value: { data: any; error: any }) => void): Promise<{ data: any; error: any }>;
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a Vestige memory instance for library usage.
 *
 * This is the main entry point for using Vestige as an importable library.
 * Works with Supabase for database and optionally OpenAI for embeddings.
 *
 * @param config - Configuration options
 * @returns A VestigeMemory instance
 *
 * @example Basic Usage
 * ```typescript
 * import { createVestige } from '@morphexe/vestige-core';
 *
 * const memory = await createVestige({
 *   supabase: {
 *     url: process.env.SUPABASE_URL!,
 *     serviceKey: process.env.SUPABASE_SERVICE_KEY!,
 *   },
 *   openai: {
 *     apiKey: process.env.OPENAI_API_KEY!,
 *   },
 *   agentId: 'my-agent',
 * });
 *
 * // Store a memory
 * const id = await memory.remember("Important fact", { tags: ['facts'] });
 *
 * // Recall memories
 * const results = await memory.recall("what are the important facts?");
 *
 * // Reinforce with FSRS
 * await memory.reinforce(id, 'good');
 *
 * // Cleanup
 * await memory.close();
 * ```
 *
 * @example Without Embeddings (keyword search only)
 * ```typescript
 * const memory = await createVestige({
 *   supabase: {
 *     url: process.env.SUPABASE_URL!,
 *     serviceKey: process.env.SUPABASE_SERVICE_KEY!,
 *   },
 *   // No openai = keyword search only
 *   agentId: 'my-agent',
 * });
 * ```
 */
export async function createVestige(config: VestigeLibraryConfig): Promise<VestigeMemory> {
  // Validate required config
  if (!config.supabase?.url) {
    throw new Error('Supabase URL is required');
  }
  if (!config.supabase?.serviceKey) {
    throw new Error('Supabase service key is required');
  }

  // Create Supabase client
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseClient = createClient(
    config.supabase.url,
    config.supabase.serviceKey,
    {
      db: { schema: config.supabase.schema ?? 'public' },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  // Create adapter
  const supabase = new SupabaseMemoryAdapter(supabaseClient as SupabaseClient, config.agentId);

  // Create embedding service if configured
  let embeddings: EmbeddingService | null = null;
  if (config.openai?.apiKey) {
    const { OpenAIEmbeddingService } = await import('./adapters/openai-embeddings.js');
    embeddings = new OpenAIEmbeddingService({
      apiKey: config.openai.apiKey,
      model: config.openai.model ?? 'text-embedding-3-small',
      timeout: config.openai.timeout,
      baseUrl: config.openai.baseUrl,
    });
  }

  // Create FSRS scheduler
  const fsrs = new FSRSScheduler({
    desiredRetention: config.fsrs?.desiredRetention ?? 0.9,
    enableSentimentBoost: true,
  });

  return new VestigeMemoryImpl(supabase, embeddings, fsrs, config);
}
