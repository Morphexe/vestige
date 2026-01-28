/**
 * Prediction Error Gating Module
 *
 * When ingesting new information, decides what to do based on comparison
 * with existing knowledge:
 *
 * - Create: Information is novel, add as new memory
 * - Update: Similar existing memory exists, add to it
 * - Supersede: Contradicts existing memory, mark old as superseded
 * - Merge: Multiple related memories, consolidate them
 * - Skip: Too similar to existing (duplicate)
 *
 * This module uses prediction error as a gating signal:
 * - High prediction error → novel information → should be stored
 * - Low prediction error → redundant → can be skipped
 * - Contradictory → needs conflict resolution
 *
 * Based on:
 * - Prediction error signaling in memory consolidation research
 */

import { nanoid } from 'nanoid';

/** Default similarity threshold for considering memories as duplicates */
export const DEFAULT_DUPLICATE_THRESHOLD = 0.95;

/** Default similarity threshold for updating existing memories */
export const DEFAULT_UPDATE_THRESHOLD = 0.7;

/** Default similarity threshold for potential merging */
export const DEFAULT_MERGE_THRESHOLD = 0.6;

/** Minimum number of related memories needed to consider merging */
export const MIN_MEMORIES_FOR_MERGE = 2;

/** What to do with incoming information */
export enum GateDecision {
  /** Create a new memory - information is novel */
  Create = 'create',
  /** Update an existing memory - information is related */
  Update = 'update',
  /** Supersede an existing memory - this is more current/correct */
  Supersede = 'supersede',
  /** Merge with existing memories - information consolidates multiple sources */
  Merge = 'merge',
  /** Skip - too similar to existing (duplicate) */
  Skip = 'skip',
  /** Flag for review - contradictory information detected */
  FlagContradiction = 'flag_contradiction',
}

/** Why a particular decision was made */
export interface DecisionReason {
  decision: GateDecision;
  primaryReason: string;
  similarityScore: number | null;
  relatedMemoryIds: string[];
  confidence: number;
  details: Record<string, unknown>;
}

/** Create a decision reason */
export function createDecisionReason(
  decision: GateDecision,
  primaryReason: string,
  similarityScore: number | null,
  relatedMemoryIds: string[],
  confidence: number,
  details: Record<string, unknown> = {}
): DecisionReason {
  return {
    decision,
    primaryReason,
    similarityScore,
    relatedMemoryIds,
    confidence,
    details,
  };
}

/** An existing memory for comparison */
export interface ExistingMemory {
  id: string;
  content: string;
  embedding?: number[];
  importance: number;
  createdAt: Date;
  lastAccessed: Date | null;
  tags: string[];
  superseded: boolean;
}

/** Information about incoming content */
export interface IncomingContent {
  content: string;
  embedding?: number[];
  tags: string[];
  source?: string;
  timestamp?: Date;
}

/** Similarity result from comparing memories */
export interface SimilarityResult {
  memoryId: string;
  similarity: number;
  isContradiction: boolean;
  contradictionType?: ContradictionType;
}

/** Types of contradictions */
export enum ContradictionType {
  /** Different values for same concept */
  ValueConflict = 'value_conflict',
  /** Negation of existing statement */
  DirectNegation = 'direct_negation',
  /** Incompatible statements */
  LogicalConflict = 'logical_conflict',
  /** Different time assertions */
  TemporalConflict = 'temporal_conflict',
}

/** Result of the gating decision */
export interface GateResult {
  decision: GateDecision;
  reason: DecisionReason;
  targetMemoryIds: string[];
  suggestedActions: SuggestedAction[];
  predictionError: number;
}

/** Suggested action to take */
export interface SuggestedAction {
  action: ActionType;
  targetId?: string;
  description: string;
  priority: number;
}

/** Types of actions */
export enum ActionType {
  CreateMemory = 'create_memory',
  UpdateContent = 'update_content',
  AddContext = 'add_context',
  MarkSuperseded = 'mark_superseded',
  MergeMemories = 'merge_memories',
  AddContradictionFlag = 'add_contradiction_flag',
  LinkMemories = 'link_memories',
  Skip = 'skip',
}

/** Configuration for the gate */
export interface GateConfig {
  duplicateThreshold: number;
  updateThreshold: number;
  mergeThreshold: number;
  minMemoriesForMerge: number;
  preferUpdate: boolean;
  detectContradictions: boolean;
}

/** Default gate configuration */
export const DEFAULT_GATE_CONFIG: GateConfig = {
  duplicateThreshold: DEFAULT_DUPLICATE_THRESHOLD,
  updateThreshold: DEFAULT_UPDATE_THRESHOLD,
  mergeThreshold: DEFAULT_MERGE_THRESHOLD,
  minMemoriesForMerge: MIN_MEMORIES_FOR_MERGE,
  preferUpdate: true,
  detectContradictions: true,
};

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Simple text-based similarity (Jaccard on words)
 */
export function textSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );
  const words2 = new Set(
    text2.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) intersection++;
  }

  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

/**
 * Detect potential contradiction between two texts
 */
export function detectContradiction(
  text1: string,
  text2: string
): { isContradiction: boolean; type?: ContradictionType } {
  const lower1 = text1.toLowerCase();
  const lower2 = text2.toLowerCase();

  // Check for direct negation patterns
  const negationPatterns = [
    ['is not', 'is'],
    ["isn't", 'is'],
    ['should not', 'should'],
    ["shouldn't", 'should'],
    ['cannot', 'can'],
    ["can't", 'can'],
    ['never', 'always'],
    ['false', 'true'],
    ['wrong', 'right'],
    ['incorrect', 'correct'],
  ];

  for (const [neg, pos] of negationPatterns) {
    if (
      (lower1.includes(neg!) && lower2.includes(pos!) && !lower2.includes(neg!)) ||
      (lower2.includes(neg!) && lower1.includes(pos!) && !lower1.includes(neg!))
    ) {
      return { isContradiction: true, type: ContradictionType.DirectNegation };
    }
  }

  // Check for value conflicts (numbers, versions, etc.)
  const numberPattern = /\b(\d+(?:\.\d+)?)\b/g;
  const numbers1 = lower1.match(numberPattern) ?? [];
  const numbers2 = lower2.match(numberPattern) ?? [];

  // If both have numbers and they differ, might be a conflict
  if (numbers1.length > 0 && numbers2.length > 0) {
    for (const num1 of numbers1) {
      for (const num2 of numbers2) {
        if (num1 !== num2 && textSimilarity(lower1, lower2) > 0.5) {
          return { isContradiction: true, type: ContradictionType.ValueConflict };
        }
      }
    }
  }

  return { isContradiction: false };
}

/**
 * Calculate prediction error based on similarity
 * High similarity = low prediction error = redundant
 * Low similarity = high prediction error = novel
 */
export function calculatePredictionError(maxSimilarity: number): number {
  return 1 - maxSimilarity;
}

/**
 * Prediction Error Gate
 *
 * Decides what to do with incoming information based on
 * comparison with existing memories.
 */
export class PredictionErrorGate {
  private config: GateConfig;
  private decisionHistory: GateResult[] = [];
  private maxHistorySize: number = 1000;

  constructor(config?: Partial<GateConfig>) {
    this.config = { ...DEFAULT_GATE_CONFIG, ...config };
  }

  /**
   * Decide what to do with incoming content
   */
  decide(
    incoming: IncomingContent,
    existingMemories: ExistingMemory[]
  ): GateResult {
    // Calculate similarities
    const similarities = this.calculateSimilarities(incoming, existingMemories);

    // Sort by similarity descending
    similarities.sort((a, b) => b.similarity - a.similarity);

    // Get the most similar memory
    const mostSimilar = similarities[0];
    const maxSimilarity = mostSimilar?.similarity ?? 0;

    // Calculate prediction error
    const predictionError = calculatePredictionError(maxSimilarity);

    // Make decision based on similarity levels
    let result: GateResult;

    if (maxSimilarity >= this.config.duplicateThreshold) {
      // Duplicate - skip
      result = this.createSkipResult(mostSimilar!, predictionError);
    } else if (mostSimilar?.isContradiction && this.config.detectContradictions) {
      // Contradiction detected
      result = this.createContradictionResult(mostSimilar, similarities, predictionError);
    } else if (maxSimilarity >= this.config.updateThreshold) {
      // Should update existing memory
      result = this.createUpdateResult(mostSimilar!, similarities, predictionError);
    } else if (this.shouldMerge(similarities)) {
      // Should merge multiple memories
      result = this.createMergeResult(similarities, predictionError);
    } else if (maxSimilarity >= this.config.mergeThreshold) {
      // Related but distinct - could update or create
      if (this.config.preferUpdate) {
        result = this.createUpdateResult(mostSimilar!, similarities, predictionError);
      } else {
        result = this.createCreateResult(similarities, predictionError);
      }
    } else {
      // Novel - create new memory
      result = this.createCreateResult(similarities, predictionError);
    }

    // Record decision
    this.recordDecision(result);

    return result;
  }

  /**
   * Calculate similarities between incoming content and existing memories
   */
  private calculateSimilarities(
    incoming: IncomingContent,
    existing: ExistingMemory[]
  ): SimilarityResult[] {
    return existing
      .filter(m => !m.superseded)
      .map(memory => {
        // Calculate similarity
        let similarity: number;
        if (incoming.embedding && memory.embedding) {
          similarity = cosineSimilarity(incoming.embedding, memory.embedding);
        } else {
          similarity = textSimilarity(incoming.content, memory.content);
        }

        // Check for contradiction
        const contradiction = this.config.detectContradictions
          ? detectContradiction(incoming.content, memory.content)
          : { isContradiction: false };

        return {
          memoryId: memory.id,
          similarity,
          isContradiction: contradiction.isContradiction,
          contradictionType: contradiction.type,
        };
      });
  }

  /**
   * Check if memories should be merged
   */
  private shouldMerge(similarities: SimilarityResult[]): boolean {
    const relatedCount = similarities.filter(
      s => s.similarity >= this.config.mergeThreshold
    ).length;
    return relatedCount >= this.config.minMemoriesForMerge;
  }

  /**
   * Create a skip result
   */
  private createSkipResult(
    similar: SimilarityResult,
    predictionError: number
  ): GateResult {
    return {
      decision: GateDecision.Skip,
      reason: createDecisionReason(
        GateDecision.Skip,
        `Too similar to existing memory (${(similar.similarity * 100).toFixed(1)}% match)`,
        similar.similarity,
        [similar.memoryId],
        1 - predictionError,
        { duplicateOf: similar.memoryId }
      ),
      targetMemoryIds: [similar.memoryId],
      suggestedActions: [
        {
          action: ActionType.Skip,
          description: 'Content is duplicate - no action needed',
          priority: 1,
        },
      ],
      predictionError,
    };
  }

  /**
   * Create an update result
   */
  private createUpdateResult(
    similar: SimilarityResult,
    allSimilarities: SimilarityResult[],
    predictionError: number
  ): GateResult {
    const relatedIds = allSimilarities
      .filter(s => s.similarity >= this.config.mergeThreshold && s.memoryId !== similar.memoryId)
      .map(s => s.memoryId);

    return {
      decision: GateDecision.Update,
      reason: createDecisionReason(
        GateDecision.Update,
        `Related to existing memory (${(similar.similarity * 100).toFixed(1)}% match)`,
        similar.similarity,
        [similar.memoryId, ...relatedIds],
        similar.similarity,
        { primaryMemory: similar.memoryId }
      ),
      targetMemoryIds: [similar.memoryId],
      suggestedActions: [
        {
          action: ActionType.AddContext,
          targetId: similar.memoryId,
          description: 'Add new information as context to existing memory',
          priority: 1,
        },
        ...(relatedIds.length > 0
          ? [
              {
                action: ActionType.LinkMemories,
                description: 'Link to related memories',
                priority: 2,
              } as SuggestedAction,
            ]
          : []),
      ],
      predictionError,
    };
  }

  /**
   * Create a merge result
   */
  private createMergeResult(
    similarities: SimilarityResult[],
    predictionError: number
  ): GateResult {
    const toMerge = similarities
      .filter(s => s.similarity >= this.config.mergeThreshold)
      .map(s => s.memoryId);

    const avgSimilarity =
      similarities
        .filter(s => s.similarity >= this.config.mergeThreshold)
        .reduce((sum, s) => sum + s.similarity, 0) / toMerge.length;

    return {
      decision: GateDecision.Merge,
      reason: createDecisionReason(
        GateDecision.Merge,
        `Related to ${toMerge.length} existing memories - consider consolidating`,
        avgSimilarity,
        toMerge,
        avgSimilarity,
        { memoriesToMerge: toMerge.length }
      ),
      targetMemoryIds: toMerge,
      suggestedActions: [
        {
          action: ActionType.MergeMemories,
          description: `Consolidate ${toMerge.length} related memories`,
          priority: 1,
        },
        {
          action: ActionType.CreateMemory,
          description: 'Alternatively, create new and link',
          priority: 2,
        },
      ],
      predictionError,
    };
  }

  /**
   * Create a create result
   */
  private createCreateResult(
    similarities: SimilarityResult[],
    predictionError: number
  ): GateResult {
    const relatedIds = similarities
      .filter(s => s.similarity >= this.config.mergeThreshold)
      .map(s => s.memoryId);

    const maxSimilarity = similarities[0]?.similarity ?? 0;

    return {
      decision: GateDecision.Create,
      reason: createDecisionReason(
        GateDecision.Create,
        maxSimilarity > 0
          ? `Novel information (max ${(maxSimilarity * 100).toFixed(1)}% similarity to existing)`
          : 'Completely novel information',
        maxSimilarity,
        relatedIds,
        predictionError,
        { novelty: predictionError }
      ),
      targetMemoryIds: [],
      suggestedActions: [
        {
          action: ActionType.CreateMemory,
          description: 'Create new memory',
          priority: 1,
        },
        ...(relatedIds.length > 0
          ? [
              {
                action: ActionType.LinkMemories,
                description: 'Link to related memories after creation',
                priority: 2,
              } as SuggestedAction,
            ]
          : []),
      ],
      predictionError,
    };
  }

  /**
   * Create a contradiction result
   */
  private createContradictionResult(
    similar: SimilarityResult,
    allSimilarities: SimilarityResult[],
    predictionError: number
  ): GateResult {
    return {
      decision: GateDecision.FlagContradiction,
      reason: createDecisionReason(
        GateDecision.FlagContradiction,
        `Contradicts existing memory: ${similar.contradictionType}`,
        similar.similarity,
        [similar.memoryId],
        0.8,
        { contradictionType: similar.contradictionType }
      ),
      targetMemoryIds: [similar.memoryId],
      suggestedActions: [
        {
          action: ActionType.AddContradictionFlag,
          targetId: similar.memoryId,
          description: 'Flag contradiction for review',
          priority: 1,
        },
        {
          action: ActionType.CreateMemory,
          description: 'Create new memory with contradiction note',
          priority: 2,
        },
        {
          action: ActionType.MarkSuperseded,
          targetId: similar.memoryId,
          description: 'Mark old memory as superseded if new info is more current',
          priority: 3,
        },
      ],
      predictionError,
    };
  }

  /**
   * Record a decision in history
   */
  private recordDecision(result: GateResult): void {
    this.decisionHistory.push(result);

    while (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory.shift();
    }
  }

  /**
   * Get decision statistics
   */
  getStats(): {
    totalDecisions: number;
    decisionCounts: Record<GateDecision, number>;
    avgPredictionError: number;
  } {
    const counts = {
      [GateDecision.Create]: 0,
      [GateDecision.Update]: 0,
      [GateDecision.Supersede]: 0,
      [GateDecision.Merge]: 0,
      [GateDecision.Skip]: 0,
      [GateDecision.FlagContradiction]: 0,
    };

    let totalError = 0;

    for (const result of this.decisionHistory) {
      counts[result.decision]++;
      totalError += result.predictionError;
    }

    return {
      totalDecisions: this.decisionHistory.length,
      decisionCounts: counts,
      avgPredictionError:
        this.decisionHistory.length > 0
          ? totalError / this.decisionHistory.length
          : 0,
    };
  }

  /**
   * Get recent decisions
   */
  getRecentDecisions(limit: number = 10): GateResult[] {
    return this.decisionHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<GateConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): GateConfig {
    return { ...this.config };
  }

  /**
   * Clear decision history
   */
  clearHistory(): void {
    this.decisionHistory = [];
  }
}
