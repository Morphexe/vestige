/**
 * Smart Ingest Tool
 *
 * Intelligent memory ingestion with Prediction Error Gating.
 * Automatically decides whether to create, update, or supersede memories
 * based on semantic similarity to existing content.
 *
 * This solves the "bad vs good similar memory" problem by:
 * - Detecting when new content is similar to existing memories
 * - Updating existing memories when appropriate (low prediction error)
 * - Creating new memories when content is substantially different (high PE)
 * - Superseding demoted/outdated memories with better alternatives
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';
import type { EmbeddingService } from '../../core/embeddings.js';
import type { IVectorStore } from '../../core/vector-store.js';
import type { SourceType, SourcePlatform } from '../../core/types.js';

// ============================================================================
// HELPERS
// ============================================================================

/** Map user-provided nodeType to valid SourceType */
function mapNodeType(nodeType: string): SourceType {
  const validTypes: SourceType[] = [
    'fact', 'concept', 'event', 'person', 'place', 'note', 'pattern', 'decision',
    'conversation', 'email', 'book', 'article', 'highlight', 'meeting', 'manual', 'webpage', 'intention',
  ];
  if (validTypes.includes(nodeType as SourceType)) {
    return nodeType as SourceType;
  }
  return 'note'; // Default fallback
}

/** Map user-provided source to valid SourcePlatform */
function mapSourcePlatform(source?: string): SourcePlatform {
  if (!source) return 'smart_ingest';
  const validPlatforms: SourcePlatform[] = [
    'obsidian', 'notion', 'roam', 'logseq', 'claude', 'chatgpt', 'gmail', 'outlook',
    'kindle', 'readwise', 'pocket', 'instapaper', 'manual', 'browser', 'mcp',
    'smart_ingest', 'unit-test', 'test', 'unknown', 'wikipedia',
  ];
  if (validPlatforms.includes(source as SourcePlatform)) {
    return source as SourcePlatform;
  }
  return 'smart_ingest'; // Default fallback
}

// ============================================================================
// SCHEMAS
// ============================================================================

export const SmartIngestInputSchema = z.object({
  content: z.string().min(1).max(1_000_000).describe('The content to remember. Will be compared against existing memories.'),
  nodeType: z.string().default('fact').describe('Type of knowledge: fact, concept, event, person, place, note, pattern, decision'),
  tags: z.array(z.string()).optional().describe('Tags for categorization'),
  source: z.string().optional().describe('Source or reference for this knowledge'),
  forceCreate: z.boolean().default(false).describe('Force creation of a new memory even if similar content exists'),
});

export type SmartIngestInput = z.infer<typeof SmartIngestInputSchema>;

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const smartIngestToolDefinition = {
  name: 'smart_ingest',
  description:
    'Intelligent memory ingestion. Automatically decides whether to create, update, or supersede memories based on semantic similarity.',
  inputSchema: SmartIngestInputSchema.shape,
};

// ============================================================================
// CONSTANTS
// ============================================================================

/** Similarity threshold above which we consider content "the same" */
const SIMILARITY_THRESHOLD_SAME = 0.95;
/** Similarity threshold above which we consider content "very similar" */
const SIMILARITY_THRESHOLD_SIMILAR = 0.85;
/** Similarity threshold above which we consider content "related" */
const SIMILARITY_THRESHOLD_RELATED = 0.7;
/** Minimum retention strength for a memory to be considered for superseding */
const SUPERSEDE_RETENTION_THRESHOLD = 0.3;

// ============================================================================
// TYPES
// ============================================================================

export interface SmartIngestResult {
  success: boolean;
  decision: 'create' | 'update' | 'reinforce' | 'supersede' | 'merge' | 'replace' | 'add_context';
  nodeId: string;
  message: string;
  hasEmbedding: boolean;
  similarity: number | null;
  predictionError: number;
  supersededId: string | null;
  reason: string;
  explanation: string;
}

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeSmartIngest(
  db: VestigeDatabase,
  args: SmartIngestInput,
  embeddingService?: EmbeddingService | null,
  vectorStore?: IVectorStore | null
): Promise<SmartIngestResult> {
  // Validate content
  if (args.content.trim() === '') {
    throw new Error('Content cannot be empty');
  }

  // If force_create is enabled or no embedding service available, use regular ingest
  if (args.forceCreate || !embeddingService || !vectorStore) {
    const node = db.insertNode({
      content: args.content,
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength: 1.0,
      stabilityFactor: 1.0,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      people: [],
      concepts: [],
      events: [],
      tags: args.tags ?? [],
      sourceChain: [],
    });

    const reason = args.forceCreate
      ? 'Forced creation - skipped similarity check'
      : 'Embeddings not available - used regular ingest';

    return {
      success: true,
      decision: 'create',
      nodeId: node.id,
      message: `Memory created (${args.forceCreate ? 'force_create=true' : 'embeddings unavailable'})`,
      hasEmbedding: false,
      similarity: null,
      predictionError: 1.0,
      supersededId: null,
      reason,
      explanation: 'Created new memory - content was different enough from existing memories',
    };
  }

  // Check if embedding service is available
  const isAvailable = await embeddingService.isAvailable();
  if (!isAvailable) {
    // Fall back to regular ingest
    const node = db.insertNode({
      content: args.content,
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength: 1.0,
      stabilityFactor: 1.0,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      people: [],
      concepts: [],
      events: [],
      tags: args.tags ?? [],
      sourceChain: [],
    });

    return {
      success: true,
      decision: 'create',
      nodeId: node.id,
      message: 'Memory created (embedding service unavailable)',
      hasEmbedding: false,
      similarity: null,
      predictionError: 1.0,
      supersededId: null,
      reason: 'Embedding service not available - used regular ingest',
      explanation: 'Created new memory - content was different enough from existing memories',
    };
  }

  // Generate embedding for new content
  const embedding = await embeddingService.generateEmbedding(args.content);

  // Find similar existing memories
  const similarMemories = await vectorStore.findSimilar(embedding, 5);

  // No similar memories found - create new
  if (similarMemories.length === 0) {
    const node = db.insertNode({
      content: args.content,
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength: 1.0,
      stabilityFactor: 1.0,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      people: [],
      concepts: [],
      events: [],
      tags: args.tags ?? [],
      sourceChain: [],
    });

    // Store embedding
    await vectorStore.upsertEmbedding(node.id, embedding, args.content, {
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      decision: 'create',
      nodeId: node.id,
      message: 'Memory created - no similar content found',
      hasEmbedding: true,
      similarity: 0,
      predictionError: 1.0,
      supersededId: null,
      reason: 'No similar memories found in vector store',
      explanation: 'Created new memory - content was different enough from existing memories',
    };
  }

  const topMatch = similarMemories[0];
  const similarity = topMatch.similarity;
  const predictionError = 1 - similarity;

  // Get the matched node
  const matchedNode = db.getNode(topMatch.id);
  if (!matchedNode) {
    // Node no longer exists - create new
    const node = db.insertNode({
      content: args.content,
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength: 1.0,
      stabilityFactor: 1.0,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      people: [],
      concepts: [],
      events: [],
      tags: args.tags ?? [],
      sourceChain: [],
    });

    await vectorStore.upsertEmbedding(node.id, embedding, args.content, {
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      decision: 'create',
      nodeId: node.id,
      message: 'Memory created - matched node no longer exists',
      hasEmbedding: true,
      similarity,
      predictionError,
      supersededId: null,
      reason: 'Matched memory was deleted',
      explanation: 'Created new memory - content was different enough from existing memories',
    };
  }

  // Decision logic based on similarity
  if (similarity >= SIMILARITY_THRESHOLD_SAME) {
    // Nearly identical - reinforce existing memory
    db.updateNodeAccess(matchedNode.id);

    return {
      success: true,
      decision: 'reinforce',
      nodeId: matchedNode.id,
      message: 'Reinforced existing memory - content nearly identical',
      hasEmbedding: true,
      similarity,
      predictionError,
      supersededId: null,
      reason: `Similarity ${(similarity * 100).toFixed(1)}% above same threshold (${SIMILARITY_THRESHOLD_SAME * 100}%)`,
      explanation: 'Reinforced existing memory - content was nearly identical',
    };
  }

  if (similarity >= SIMILARITY_THRESHOLD_SIMILAR) {
    // Very similar - check if existing memory is demoted/weak
    if (matchedNode.retentionStrength < SUPERSEDE_RETENTION_THRESHOLD) {
      // Supersede the weak memory
      const node = db.insertNode({
        content: args.content,
        sourceType: mapNodeType(args.nodeType ?? 'fact'),
        sourcePlatform: mapSourcePlatform(args.source),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 1.0,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [matchedNode.id],
        people: [],
        concepts: [],
        events: [],
        tags: args.tags ?? [],
        sourceChain: [matchedNode.id],
      });

      await vectorStore.upsertEmbedding(node.id, embedding, args.content, {
        sourceType: args.nodeType ?? 'fact',
        sourcePlatform: args.source ?? 'smart_ingest',
        createdAt: new Date().toISOString(),
      });

      return {
        success: true,
        decision: 'supersede',
        nodeId: node.id,
        message: 'Superseded weak/demoted memory with improved version',
        hasEmbedding: true,
        similarity,
        predictionError,
        supersededId: matchedNode.id,
        reason: `Similar memory has low retention (${(matchedNode.retentionStrength * 100).toFixed(0)}%)`,
        explanation: 'Superseded old memory - new content is an improvement/correction',
      };
    }

    // Update existing memory with new content
    const internalDb = (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
    internalDb.prepare(`
      UPDATE knowledge_nodes
      SET content = ?,
          updated_at = ?,
          last_accessed_at = ?,
          access_count = access_count + 1
      WHERE id = ?
    `).run(args.content, new Date().toISOString(), new Date().toISOString(), matchedNode.id);

    // Update embedding
    await vectorStore.upsertEmbedding(matchedNode.id, embedding, args.content, {
      sourceType: matchedNode.sourceType,
      sourcePlatform: matchedNode.sourcePlatform,
      createdAt: matchedNode.createdAt.toISOString(),
    });

    return {
      success: true,
      decision: 'update',
      nodeId: matchedNode.id,
      message: 'Updated existing memory with new content',
      hasEmbedding: true,
      similarity,
      predictionError,
      supersededId: null,
      reason: `Similarity ${(similarity * 100).toFixed(1)}% above similar threshold (${SIMILARITY_THRESHOLD_SIMILAR * 100}%)`,
      explanation: 'Updated existing memory - content was similar to an existing memory',
    };
  }

  if (similarity >= SIMILARITY_THRESHOLD_RELATED) {
    // Related content - create new memory and link to existing
    const node = db.insertNode({
      content: args.content,
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength: 1.0,
      stabilityFactor: 1.0,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      people: [],
      concepts: [],
      events: [],
      tags: args.tags ?? [],
      sourceChain: [],
    });

    await vectorStore.upsertEmbedding(node.id, embedding, args.content, {
      sourceType: mapNodeType(args.nodeType ?? 'fact'),
      sourcePlatform: mapSourcePlatform(args.source),
      createdAt: new Date().toISOString(),
    });

    // Create edge to related memory
    try {
      db.insertEdge({
        fromId: node.id,
        toId: matchedNode.id,
        edgeType: 'similar_to',
        weight: similarity,
        createdAt: new Date(),
      });
    } catch {
      // Edge creation is optional
    }

    return {
      success: true,
      decision: 'merge',
      nodeId: node.id,
      message: 'Created new memory linked to related content',
      hasEmbedding: true,
      similarity,
      predictionError,
      supersededId: null,
      reason: `Similarity ${(similarity * 100).toFixed(1)}% above related threshold (${SIMILARITY_THRESHOLD_RELATED * 100}%)`,
      explanation: 'Merged with related memories - content connects multiple topics',
    };
  }

  // Low similarity - create independent new memory
  const node = db.insertNode({
    content: args.content,
    sourceType: mapNodeType(args.nodeType ?? 'fact'),
    sourcePlatform: mapSourcePlatform(args.source),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 0,
    retentionStrength: 1.0,
    stabilityFactor: 1.0,
    reviewCount: 0,
    confidence: 0.8,
    isContradicted: false,
    contradictionIds: [],
    people: [],
    concepts: [],
    events: [],
    tags: args.tags ?? [],
    sourceChain: [],
  });

  await vectorStore.upsertEmbedding(node.id, embedding, args.content, {
    sourceType: args.nodeType ?? 'fact',
    sourcePlatform: args.source ?? 'smart_ingest',
    createdAt: new Date().toISOString(),
  });

  return {
    success: true,
    decision: 'create',
    nodeId: node.id,
    message: 'Created new memory - content sufficiently different',
    hasEmbedding: true,
    similarity,
    predictionError,
    supersededId: null,
    reason: `Similarity ${(similarity * 100).toFixed(1)}% below related threshold (${SIMILARITY_THRESHOLD_RELATED * 100}%)`,
    explanation: 'Created new memory - content was different enough from existing memories',
  };
}
