/**
 * Speculative Memory Retrieval Module
 *
 * Predict what memories the user will need BEFORE they ask.
 * Uses pattern analysis, temporal modeling, and context understanding
 * to pre-warm the cache with likely-needed memories.
 *
 * How It Works:
 * 1. Analyzes current working context (files open, recent queries, project state)
 * 2. Learns from historical access patterns (what memories were accessed together)
 * 3. Predicts with confidence scores and reasoning
 * 4. Pre-fetches high-confidence predictions into fast cache
 * 5. Records actual usage to improve future predictions
 */

import { nanoid } from 'nanoid';

/** Maximum number of access patterns to track */
export const MAX_PATTERN_HISTORY = 10000;

/** Maximum predictions to return */
export const MAX_PREDICTIONS = 20;

/** Minimum confidence threshold for predictions */
export const MIN_CONFIDENCE = 0.3;

/** Decay factor for old patterns (per day) */
export const PATTERN_DECAY_RATE = 0.95;

/** What triggered a prediction */
export type PredictionTrigger =
  | { type: 'file_context'; filePath: string }
  | { type: 'co_access_pattern'; relatedMemoryId: string }
  | { type: 'temporal_pattern'; typicalTime: string }
  | { type: 'project_context'; projectName: string }
  | { type: 'intent_based'; intent: string }
  | { type: 'semantic_similarity'; query: string; similarity: number };

/** A predicted memory that the user is likely to need */
export interface PredictedMemory {
  memoryId: string;
  contentPreview: string;
  confidence: number;
  reasoning: string;
  trigger: PredictionTrigger;
  predictedAt: Date;
}

/** Context for making predictions */
export interface PredictionContext {
  openFiles: string[];
  recentEdits: string[];
  recentQueries: string[];
  recentMemoryIds: string[];
  projectPath: string | null;
  timestamp: Date;
}

/** Create a new prediction context */
export function createPredictionContext(): PredictionContext {
  return {
    openFiles: [],
    recentEdits: [],
    recentQueries: [],
    recentMemoryIds: [],
    projectPath: null,
    timestamp: new Date(),
  };
}

/** A learned co-access pattern */
export interface UsagePattern {
  triggerId: string;
  predictedId: string;
  frequency: number;
  successRate: number;
  lastSeen: Date;
  weight: number;
}

/** An access event for pattern learning */
export interface AccessEvent {
  memoryId: string;
  fileContext: string | null;
  queryContext: string | null;
  timestamp: Date;
  wasHelpful: boolean | null;
}

/**
 * Speculative Retriever
 *
 * Predicts and pre-fetches memories based on usage patterns.
 */
export class SpeculativeRetriever {
  private coAccessPatterns = new Map<string, UsagePattern[]>();
  private fileMemoryMap = new Map<string, string[]>();
  private accessSequence: AccessEvent[] = [];
  private pendingPredictions = new Map<string, PredictedMemory>();
  private predictionCache: PredictedMemory[] = [];

  /**
   * Predict memories that will be needed based on context
   */
  predictNeeded(context: PredictionContext): PredictedMemory[] {
    const now = context.timestamp;
    let predictions: PredictedMemory[] = [];

    // 1. File-based predictions
    predictions.push(...this.predictFromFiles(context, now));

    // 2. Co-access pattern predictions
    predictions.push(...this.predictFromPatterns(context, now));

    // 3. Query similarity predictions
    predictions.push(...this.predictFromQueries(context, now));

    // 4. Temporal pattern predictions
    predictions.push(...this.predictFromTime(now));

    // Deduplicate and sort by confidence
    predictions = this.deduplicatePredictions(predictions);
    predictions.sort((a, b) => b.confidence - a.confidence);
    predictions = predictions.slice(0, MAX_PREDICTIONS);

    // Filter by minimum confidence
    predictions = predictions.filter(p => p.confidence >= MIN_CONFIDENCE);

    // Store for outcome tracking
    this.storePendingPredictions(predictions);

    return predictions;
  }

  /**
   * Pre-warm cache with predicted memories
   */
  prefetch(context: PredictionContext): number {
    const predictions = this.predictNeeded(context);

    // Store predictions in cache
    this.predictionCache = predictions;

    return predictions.length;
  }

  /**
   * Record what was actually used to improve predictions
   */
  recordUsage(predicted: string[], actuallyUsed: string[]): void {
    // Update pending predictions with outcomes
    for (const id of actuallyUsed) {
      if (this.pendingPredictions.has(id)) {
        this.strengthenPattern(id, 1.0);
        this.pendingPredictions.delete(id);
      }
    }

    // Weaken patterns for predictions that weren't used
    for (const [id] of this.pendingPredictions) {
      this.weakenPattern(id, 0.9);
    }
    this.pendingPredictions.clear();

    // Learn new co-access patterns
    this.learnCoAccessPatterns(actuallyUsed);
  }

  /**
   * Record a memory access event
   */
  recordAccess(
    memoryId: string,
    fileContext: string | null = null,
    queryContext: string | null = null,
    wasHelpful: boolean | null = null
  ): void {
    const event: AccessEvent = {
      memoryId,
      fileContext,
      queryContext,
      timestamp: new Date(),
      wasHelpful,
    };

    this.accessSequence.push(event);

    // Trim old events
    while (this.accessSequence.length > MAX_PATTERN_HISTORY) {
      this.accessSequence.shift();
    }

    // Update file-memory associations
    if (fileContext) {
      const memories = this.fileMemoryMap.get(fileContext) ?? [];
      if (!memories.includes(memoryId)) {
        memories.push(memoryId);
        this.fileMemoryMap.set(fileContext, memories);
      }
    }
  }

  /**
   * Get cached predictions
   */
  getCachedPredictions(): PredictedMemory[] {
    return [...this.predictionCache];
  }

  /**
   * Apply decay to old patterns
   */
  applyPatternDecay(): void {
    const now = new Date();

    for (const [, patterns] of this.coAccessPatterns) {
      for (const pattern of patterns) {
        const daysOld = (now.getTime() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
        pattern.weight *= Math.pow(PATTERN_DECAY_RATE, daysOld);
      }

      // Remove very weak patterns
      const strongPatterns = patterns.filter(p => p.weight > 0.01);
      patterns.length = 0;
      patterns.push(...strongPatterns);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    totalFileAssociations: number;
    accessHistorySize: number;
    cachedPredictions: number;
  } {
    let totalPatterns = 0;
    for (const patterns of this.coAccessPatterns.values()) {
      totalPatterns += patterns.length;
    }

    return {
      totalPatterns,
      totalFileAssociations: this.fileMemoryMap.size,
      accessHistorySize: this.accessSequence.length,
      cachedPredictions: this.predictionCache.length,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.coAccessPatterns.clear();
    this.fileMemoryMap.clear();
    this.accessSequence = [];
    this.pendingPredictions.clear();
    this.predictionCache = [];
  }

  // Private methods

  private predictFromFiles(context: PredictionContext, now: Date): PredictedMemory[] {
    const predictions: PredictedMemory[] = [];

    for (const file of context.openFiles) {
      const memoryIds = this.fileMemoryMap.get(file) ?? [];
      const fileName = file.split('/').pop() ?? file;

      for (const memoryId of memoryIds) {
        predictions.push({
          memoryId,
          contentPreview: '',
          confidence: 0.7,
          reasoning: `You're working on ${fileName}, and this memory was useful for that file before`,
          trigger: { type: 'file_context', filePath: file },
          predictedAt: now,
        });
      }
    }

    return predictions;
  }

  private predictFromPatterns(context: PredictionContext, now: Date): PredictedMemory[] {
    const predictions: PredictedMemory[] = [];

    for (const recentId of context.recentMemoryIds) {
      const patterns = this.coAccessPatterns.get(recentId) ?? [];

      for (const pattern of patterns) {
        const confidence = pattern.weight * pattern.successRate;
        if (confidence >= MIN_CONFIDENCE) {
          predictions.push({
            memoryId: pattern.predictedId,
            contentPreview: '',
            confidence,
            reasoning: `You accessed a related memory, and these are often used together (${Math.round(pattern.successRate * 100)}% of the time)`,
            trigger: { type: 'co_access_pattern', relatedMemoryId: recentId },
            predictedAt: now,
          });
        }
      }
    }

    return predictions;
  }

  private predictFromQueries(context: PredictionContext, now: Date): PredictedMemory[] {
    const predictions: PredictedMemory[] = [];

    for (const query of context.recentQueries) {
      // Find memories accessed after similar queries
      for (const event of this.accessSequence.slice(-100).reverse()) {
        if (event.queryContext) {
          const lower1 = event.queryContext.toLowerCase();
          const lower2 = query.toLowerCase();

          if (lower1.includes(lower2) || lower2.includes(lower1)) {
            predictions.push({
              memoryId: event.memoryId,
              contentPreview: '',
              confidence: 0.6,
              reasoning: 'This memory was helpful when you searched for similar terms before',
              trigger: { type: 'semantic_similarity', query, similarity: 0.8 },
              predictedAt: now,
            });
          }
        }
      }
    }

    return predictions;
  }

  private predictFromTime(now: Date): PredictedMemory[] {
    const predictions: PredictedMemory[] = [];
    const hour = now.getHours();

    // Find memories frequently accessed at this time
    const timeCounts = new Map<string, number>();

    for (const event of this.accessSequence) {
      if (Math.abs(event.timestamp.getHours() - hour) <= 1) {
        timeCounts.set(event.memoryId, (timeCounts.get(event.memoryId) ?? 0) + 1);
      }
    }

    for (const [memoryId, count] of timeCounts) {
      if (count >= 3) {
        const confidence = Math.min(count / 10, 0.5);
        predictions.push({
          memoryId,
          contentPreview: '',
          confidence,
          reasoning: `You often access this memory around ${hour}:00`,
          trigger: { type: 'temporal_pattern', typicalTime: `${hour}:00` },
          predictedAt: now,
        });
      }
    }

    return predictions;
  }

  private deduplicatePredictions(predictions: PredictedMemory[]): PredictedMemory[] {
    const seen = new Map<string, PredictedMemory>();

    for (const pred of predictions) {
      const existing = seen.get(pred.memoryId);
      if (!existing || pred.confidence > existing.confidence) {
        seen.set(pred.memoryId, pred);
      }
    }

    return Array.from(seen.values());
  }

  private storePendingPredictions(predictions: PredictedMemory[]): void {
    this.pendingPredictions.clear();
    for (const pred of predictions) {
      this.pendingPredictions.set(pred.memoryId, pred);
    }
  }

  private strengthenPattern(memoryId: string, factor: number): void {
    for (const patterns of this.coAccessPatterns.values()) {
      for (const pattern of patterns) {
        if (pattern.predictedId === memoryId) {
          pattern.weight = Math.min(pattern.weight * factor, 1.0);
          pattern.frequency++;
          pattern.successRate = pattern.successRate * 0.9 + 0.1;
          pattern.lastSeen = new Date();
        }
      }
    }
  }

  private weakenPattern(memoryId: string, factor: number): void {
    for (const patterns of this.coAccessPatterns.values()) {
      for (const pattern of patterns) {
        if (pattern.predictedId === memoryId) {
          pattern.weight *= factor;
          pattern.successRate *= 0.95;
        }
      }
    }
  }

  private learnCoAccessPatterns(memoryIds: string[]): void {
    if (memoryIds.length < 2) return;

    // Create patterns between each pair
    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = 0; j < memoryIds.length; j++) {
        if (i !== j) {
          const trigger = memoryIds[i]!;
          const predicted = memoryIds[j]!;

          const patterns = this.coAccessPatterns.get(trigger) ?? [];

          const existing = patterns.find(p => p.predictedId === predicted);
          if (existing) {
            existing.frequency++;
            existing.weight = Math.min(existing.weight + 0.1, 1.0);
            existing.lastSeen = new Date();
          } else {
            patterns.push({
              triggerId: trigger,
              predictedId: predicted,
              frequency: 1,
              successRate: 0.5,
              lastSeen: new Date(),
              weight: 0.5,
            });
          }

          this.coAccessPatterns.set(trigger, patterns);
        }
      }
    }
  }
}
