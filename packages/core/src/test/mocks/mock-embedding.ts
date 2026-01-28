/**
 * Mock Embedding Service using FxHash
 *
 * Provides deterministic embeddings for testing without requiring
 * the actual ML model. Uses FxHash for fast, consistent hashing.
 *
 * Key properties:
 * - Deterministic: Same input always produces same embedding
 * - Fast: No ML model loading/inference
 * - Semantic similarity: Similar strings produce similar embeddings
 * - Normalized: All embeddings have unit length
 */

/**
 * Dimensions for mock embeddings (matches nomic-embed-text-v1.5)
 */
export const MOCK_EMBEDDING_DIM = 768;

/**
 * FxHash implementation (fast, non-cryptographic hash)
 * Based on Firefox's hash function
 */
function fxHash(data: Uint8Array): bigint {
  const SEED = 0x517cc1b727220a95n;
  let hash = SEED;
  for (const byte of data) {
    hash = rotateLeft64(hash, 5n) ^ BigInt(byte);
    hash = (hash * SEED) & 0xffffffffffffffffn;
  }
  return hash;
}

/**
 * Rotate a 64-bit value left by n bits
 */
function rotateLeft64(value: bigint, n: bigint): bigint {
  return ((value << n) | (value >> (64n - n))) & 0xffffffffffffffffn;
}

/**
 * Convert string to Uint8Array (UTF-8)
 */
function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Normalize a vector to unit length
 */
function normalize(v: number[]): void {
  let norm = 0;
  for (const x of v) {
    norm += x * x;
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < v.length; i++) {
      v[i] /= norm;
    }
  }
}

/**
 * Mock embedding service for testing
 *
 * Produces deterministic embeddings based on text content using FxHash.
 * Designed to approximate real embedding behavior:
 * - Similar texts produce similar embeddings
 * - Different texts produce different embeddings
 * - Embeddings are normalized to unit length
 *
 * @example
 * ```typescript
 * const service = new MockEmbeddingService();
 *
 * const emb1 = service.embed("hello world");
 * const emb2 = service.embed("hello world");
 * const emb3 = service.embed("goodbye world");
 *
 * // Same input = same output
 * assert(emb1 === emb2);
 *
 * // Different input = different output
 * assert(emb1 !== emb3);
 *
 * // But similar inputs have higher similarity
 * const simSame = service.cosineSimilarity(emb1, emb2);
 * const simDiff = service.cosineSimilarity(emb1, emb3);
 * assert(simSame > simDiff);
 * ```
 */
export class MockEmbeddingService {
  private cache: Map<string, Float32Array>;
  private readonly semanticMode: boolean;

  /**
   * Create a new mock embedding service
   */
  constructor(semanticMode = true) {
    this.cache = new Map();
    this.semanticMode = semanticMode;
  }

  /**
   * Create a service without semantic mode (pure hash-based)
   */
  static simple(): MockEmbeddingService {
    return new MockEmbeddingService(false);
  }

  /**
   * Embed text into a vector
   */
  embed(text: string): Float32Array {
    // Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      return new Float32Array(cached);
    }

    const embedding = this.semanticMode
      ? this.semanticEmbed(text)
      : this.simpleEmbed(text);

    this.cache.set(text, new Float32Array(embedding));
    return embedding;
  }

  /**
   * Simple hash-based embedding
   */
  private simpleEmbed(text: string): Float32Array {
    const embedding = new Array<number>(MOCK_EMBEDDING_DIM).fill(0);
    const normalized = text.toLowerCase();

    // Use multiple hash seeds for different dimensions
    for (let i = 0; i < Math.ceil(MOCK_EMBEDDING_DIM / 64); i++) {
      const seedText = `${i}:${normalized}`;
      const hash = fxHash(stringToBytes(seedText));

      for (let j = 0; j < 64 && i * 64 + j < MOCK_EMBEDDING_DIM; j++) {
        // Generate pseudo-random float from hash
        const shifted = rotateLeft64(hash, BigInt(j * 5));
        const idx = i * 64 + j;
        embedding[idx] = (Number(shifted % 1000000n) / 1000000) * 2 - 1;
      }
    }

    normalize(embedding);
    return new Float32Array(embedding);
  }

  /**
   * Semantic-aware embedding (word-level hashing)
   */
  private semanticEmbed(text: string): Float32Array {
    const embedding = new Array<number>(MOCK_EMBEDDING_DIM).fill(0);
    const normalized = text.toLowerCase();

    // Tokenize into words
    const words = normalized
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) {
      // Fall back to simple embedding for empty text
      return this.simpleEmbed(text);
    }

    // Each word contributes to the embedding
    for (const word of words) {
      const wordHash = fxHash(stringToBytes(word));

      // Map word to a sparse set of dimensions
      for (let i = 0; i < 16; i++) {
        const dim = Number((wordHash >> BigInt(i * 4)) % BigInt(MOCK_EMBEDDING_DIM));
        const sign = (wordHash >> BigInt(i + 48)) & 1n ? -1 : 1;
        const magnitude = (Number(wordHash >> BigInt(i * 2)) % 100) / 100 + 0.5;
        embedding[dim] += sign * magnitude;
      }
    }

    // Add position-aware component for word order sensitivity
    for (let pos = 0; pos < words.length; pos++) {
      const posHash = fxHash(stringToBytes(`${pos}:${words[pos]}`));
      const dim = Number(posHash % BigInt(MOCK_EMBEDDING_DIM));
      const weight = 1.0 / (pos + 1);
      embedding[dim] += weight;
    }

    // Add character n-gram features for subword similarity
    const chars = [...normalized];
    for (let i = 0; i < chars.length - 2; i++) {
      const trigram = chars.slice(i, i + 3).join('');
      const hash = fxHash(stringToBytes(trigram));
      const dim = Number(hash % BigInt(MOCK_EMBEDDING_DIM));
      embedding[dim] += 0.1;
    }

    normalize(embedding);
    return new Float32Array(embedding);
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      return 0;
    }

    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dot / (normA * normB);
  }

  /**
   * Calculate euclidean distance between two embeddings
   */
  euclideanDistance(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      return Number.MAX_VALUE;
    }

    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  /**
   * Find most similar embedding from a set
   */
  findMostSimilar(
    query: Float32Array,
    candidates: Array<{ id: string; embedding: Float32Array }>
  ): { id: string; similarity: number } | null {
    if (candidates.length === 0) {
      return null;
    }

    let best = { id: candidates[0].id, similarity: -2 };

    for (const { id, embedding } of candidates) {
      const sim = this.cosineSimilarity(query, embedding);
      if (sim > best.similarity) {
        best = { id, similarity: sim };
      }
    }

    return best;
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  cacheSize(): number {
    return this.cache.size;
  }

  /**
   * Check if service is ready (always true for mock)
   */
  isReady(): boolean {
    return true;
  }
}

export default MockEmbeddingService;
