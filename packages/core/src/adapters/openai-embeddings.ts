/**
 * OpenAI Embedding Service
 *
 * Implements EmbeddingService interface using OpenAI's embedding models.
 * Provides high-quality embeddings for semantic search and similarity.
 *
 * @example
 * ```typescript
 * import { OpenAIEmbeddingService } from '@vestige/core/adapters';
 *
 * const embeddings = new OpenAIEmbeddingService({
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   model: 'text-embedding-3-small', // 1536 dimensions
 * });
 *
 * const vector = await embeddings.generateEmbedding("Hello world");
 * console.log('Dimensions:', vector.length); // 1536
 * ```
 */

import { cosineSimilarity, type EmbeddingService } from '../core/embeddings.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * OpenAI embedding model information
 */
const OPENAI_MODELS = {
  'text-embedding-3-small': { dimensions: 1536, maxTokens: 8191 },
  'text-embedding-3-large': { dimensions: 3072, maxTokens: 8191 },
  'text-embedding-ada-002': { dimensions: 1536, maxTokens: 8191 },
} as const;

type OpenAIEmbeddingModel = keyof typeof OPENAI_MODELS;

/**
 * Default model (best balance of quality, speed, and cost)
 */
const DEFAULT_MODEL: OpenAIEmbeddingModel = 'text-embedding-3-small';

/**
 * Maximum characters to embed (conservative estimate for token limit)
 */
const MAX_TEXT_LENGTH = 32000; // ~8k tokens with safety margin

/**
 * Default request timeout in milliseconds
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Cache duration for availability check (5 minutes in ms)
 */
const AVAILABILITY_CACHE_TTL = 5 * 60 * 1000;

/**
 * Maximum texts per batch request
 */
const MAX_BATCH_SIZE = 100;

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration options for OpenAI embedding service
 */
export interface OpenAIEmbeddingConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (default: text-embedding-3-small) */
  model?: OpenAIEmbeddingModel;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Base URL for API (default: https://api.openai.com/v1) */
  baseUrl?: string;
  /** Organization ID (optional) */
  organization?: string;
}

/**
 * OpenAI API embedding response
 */
interface OpenAIEmbeddingResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// =============================================================================
// OPENAI EMBEDDING SERVICE
// =============================================================================

/**
 * OpenAI embedding service implementation.
 *
 * Uses OpenAI's embedding API for high-quality semantic embeddings.
 * Supports text-embedding-3-small (1536 dims) and text-embedding-3-large (3072 dims).
 */
export class OpenAIEmbeddingService implements EmbeddingService {
  private apiKey: string;
  private model: OpenAIEmbeddingModel;
  private timeout: number;
  private baseUrl: string;
  private organization?: string;
  private availabilityCache: { available: boolean; timestamp: number } | null = null;

  constructor(config: OpenAIEmbeddingConfig) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
    this.organization = config.organization;

    // Validate model
    if (!(this.model in OPENAI_MODELS)) {
      throw new Error(
        `Invalid model: ${this.model}. Supported models: ${Object.keys(OPENAI_MODELS).join(', ')}`
      );
    }
  }

  /**
   * Check if the OpenAI API is available.
   * Results are cached for 5 minutes.
   */
  async isAvailable(): Promise<boolean> {
    // Check cache first
    if (
      this.availabilityCache &&
      Date.now() - this.availabilityCache.timestamp < AVAILABILITY_CACHE_TTL
    ) {
      return this.availabilityCache.available;
    }

    try {
      // Test with a minimal embedding request
      const response = await this.fetchEmbeddings(['test']);
      const available = response.data.length > 0;
      this.availabilityCache = { available, timestamp: Date.now() };
      return available;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`OpenAI API not available: ${message}`);
      this.availabilityCache = { available: false, timestamp: Date.now() };
      return false;
    }
  }

  /**
   * Generate an embedding for the given text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }

    const truncatedText = this.truncateText(text.trim());
    const response = await this.fetchEmbeddings([truncatedText]);

    if (!response.data || response.data.length === 0) {
      throw new Error('No embedding returned from OpenAI');
    }

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error('No embedding returned from OpenAI');
    }

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts in a batch.
   * More efficient than calling generateEmbedding multiple times.
   */
  async batchEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Filter and truncate texts
    const validTexts = texts
      .filter((t) => t && t.trim().length > 0)
      .map((t) => this.truncateText(t.trim()));

    if (validTexts.length === 0) {
      return [];
    }

    // Split into batches if needed
    const batches: string[][] = [];
    for (let i = 0; i < validTexts.length; i += MAX_BATCH_SIZE) {
      batches.push(validTexts.slice(i, i + MAX_BATCH_SIZE));
    }

    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const response = await this.fetchEmbeddings(batch);

      // Sort by index to maintain order
      const sorted = response.data.sort((a, b) => a.index - b.index);
      allEmbeddings.push(...sorted.map((d) => d.embedding));
    }

    return allEmbeddings;
  }

  /**
   * Calculate similarity between two embedding vectors using cosine similarity.
   */
  getSimilarity(embA: number[], embB: number[]): number {
    return cosineSimilarity(embA, embB);
  }

  /**
   * Get the model being used.
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Get the embedding dimensions for the current model.
   */
  getDimensions(): number {
    return OPENAI_MODELS[this.model].dimensions;
  }

  /**
   * Clear the availability cache, forcing a fresh check on next call.
   */
  clearCache(): void {
    this.availabilityCache = null;
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Truncate text to fit within model limits.
   */
  private truncateText(text: string): string {
    if (text.length <= MAX_TEXT_LENGTH) {
      return text;
    }
    console.warn(
      `Text truncated from ${text.length} to ${MAX_TEXT_LENGTH} characters`
    );
    return text.slice(0, MAX_TEXT_LENGTH);
  }

  /**
   * Fetch embeddings from OpenAI API.
   */
  private async fetchEmbeddings(input: string[]): Promise<OpenAIEmbeddingResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      };

      if (this.organization) {
        headers['OpenAI-Organization'] = this.organization;
      }

      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          input,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${error}`);
      }

      const data = await response.json() as OpenAIEmbeddingResponse;
      return data;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create an OpenAI embedding service.
 *
 * @param config - Configuration options
 * @returns OpenAIEmbeddingService instance
 *
 * @example
 * ```typescript
 * const embeddings = createOpenAIEmbeddingService({
 *   apiKey: process.env.OPENAI_API_KEY!,
 * });
 *
 * const vec = await embeddings.generateEmbedding("Hello world");
 * ```
 */
export function createOpenAIEmbeddingService(
  config: OpenAIEmbeddingConfig
): OpenAIEmbeddingService {
  return new OpenAIEmbeddingService(config);
}
