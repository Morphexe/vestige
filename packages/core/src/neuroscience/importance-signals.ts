/**
 * Importance Signals Module
 *
 * Multi-factor importance scoring for memories:
 * - Base importance (from content analysis)
 * - Usage importance (from retrieval patterns)
 * - Recency importance (time-based decay)
 * - Connection importance (from graph centrality)
 *
 * Based on memory accessibility and utility principles.
 */

import { nanoid } from 'nanoid';

/** Default configuration values */
export const DEFAULT_DECAY_RATE = 0.95; // 5% daily decay
export const MIN_IMPORTANCE = 0.01; // Never zero
export const MAX_IMPORTANCE = 1.0;
export const HELPFUL_BOOST = 1.15; // 15% boost for helpful retrieval
export const UNHELPFUL_PENALTY = 0.95; // 5% penalty for unhelpful
export const DEFAULT_GRACE_PERIOD_DAYS = 7;
export const DEFAULT_RECENCY_HALF_LIFE_DAYS = 14;

/** Importance score weights */
export const IMPORTANCE_WEIGHTS = {
  base: 0.2,
  usage: 0.4,
  recency: 0.25,
  connection: 0.15,
};

/** Usage event tracking */
export interface UsageEvent {
  id: string;
  memoryId: string;
  wasHelpful: boolean;
  context?: string;
  timestamp: Date;
}

/** Importance score for a memory */
export interface ImportanceScore {
  memoryId: string;
  baseImportance: number;
  usageImportance: number;
  recencyImportance: number;
  connectionImportance: number;
  finalScore: number;
  retrievalCount: number;
  helpfulCount: number;
  lastAccessed: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Configuration for importance decay */
export interface ImportanceDecayConfig {
  decayRate: number;
  minImportance: number;
  maxImportance: number;
  gracePeriodDays: number;
  recencyHalfLifeDays: number;
}

/**
 * Create a new importance score
 */
export function createImportanceScore(
  memoryId: string,
  baseImportance: number = 0.5
): ImportanceScore {
  const now = new Date();
  return {
    memoryId,
    baseImportance: Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, baseImportance)),
    usageImportance: 0.1, // Start low
    recencyImportance: 1.0, // Start high (just created)
    connectionImportance: 0,
    finalScore: calculateFinalScore(baseImportance, 0.1, 1.0, 0),
    retrievalCount: 0,
    helpfulCount: 0,
    lastAccessed: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Calculate final weighted score
 */
export function calculateFinalScore(
  baseImportance: number,
  usageImportance: number,
  recencyImportance: number,
  connectionImportance: number
): number {
  const weighted =
    baseImportance * IMPORTANCE_WEIGHTS.base +
    usageImportance * IMPORTANCE_WEIGHTS.usage +
    recencyImportance * IMPORTANCE_WEIGHTS.recency +
    connectionImportance * IMPORTANCE_WEIGHTS.connection;

  return Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, weighted));
}

/**
 * Update importance score after retrieval
 */
export function onRetrieved(
  score: ImportanceScore,
  wasHelpful: boolean
): ImportanceScore {
  const now = new Date();

  // Update usage importance
  let newUsageImportance = score.usageImportance;
  if (wasHelpful) {
    newUsageImportance = Math.min(MAX_IMPORTANCE, newUsageImportance * HELPFUL_BOOST);
  } else {
    newUsageImportance = Math.max(MIN_IMPORTANCE, newUsageImportance * UNHELPFUL_PENALTY);
  }

  // Reset recency to max
  const newRecencyImportance = 1.0;

  const newFinalScore = calculateFinalScore(
    score.baseImportance,
    newUsageImportance,
    newRecencyImportance,
    score.connectionImportance
  );

  return {
    ...score,
    usageImportance: newUsageImportance,
    recencyImportance: newRecencyImportance,
    finalScore: newFinalScore,
    retrievalCount: score.retrievalCount + 1,
    helpfulCount: wasHelpful ? score.helpfulCount + 1 : score.helpfulCount,
    lastAccessed: now,
    updatedAt: now,
  };
}

/**
 * Apply recency decay to importance
 */
export function applyRecencyDecay(
  score: ImportanceScore,
  halfLifeDays: number = DEFAULT_RECENCY_HALF_LIFE_DAYS
): ImportanceScore {
  if (!score.lastAccessed) {
    // Never accessed, use creation time
    const daysSinceCreation =
      (Date.now() - score.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const newRecency = Math.pow(0.5, daysSinceCreation / halfLifeDays);

    return {
      ...score,
      recencyImportance: Math.max(MIN_IMPORTANCE, newRecency),
      finalScore: calculateFinalScore(
        score.baseImportance,
        score.usageImportance,
        Math.max(MIN_IMPORTANCE, newRecency),
        score.connectionImportance
      ),
      updatedAt: new Date(),
    };
  }

  const daysSinceAccess =
    (Date.now() - score.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay with half-life
  const newRecency = Math.pow(0.5, daysSinceAccess / halfLifeDays);

  const newFinalScore = calculateFinalScore(
    score.baseImportance,
    score.usageImportance,
    Math.max(MIN_IMPORTANCE, newRecency),
    score.connectionImportance
  );

  return {
    ...score,
    recencyImportance: Math.max(MIN_IMPORTANCE, newRecency),
    finalScore: newFinalScore,
    updatedAt: new Date(),
  };
}

/**
 * Apply usage importance decay
 */
export function applyUsageDecay(
  score: ImportanceScore,
  config: ImportanceDecayConfig = {
    decayRate: DEFAULT_DECAY_RATE,
    minImportance: MIN_IMPORTANCE,
    maxImportance: MAX_IMPORTANCE,
    gracePeriodDays: DEFAULT_GRACE_PERIOD_DAYS,
    recencyHalfLifeDays: DEFAULT_RECENCY_HALF_LIFE_DAYS,
  }
): ImportanceScore {
  const lastActivity = score.lastAccessed ?? score.createdAt;
  const daysSinceActivity =
    (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

  // No decay during grace period
  if (daysSinceActivity <= config.gracePeriodDays) {
    return score;
  }

  // Days of decay after grace period
  const decayDays = daysSinceActivity - config.gracePeriodDays;
  const decayFactor = Math.pow(config.decayRate, decayDays);

  const newUsageImportance = Math.max(
    config.minImportance,
    score.usageImportance * decayFactor
  );

  const newFinalScore = calculateFinalScore(
    score.baseImportance,
    newUsageImportance,
    score.recencyImportance,
    score.connectionImportance
  );

  return {
    ...score,
    usageImportance: newUsageImportance,
    finalScore: newFinalScore,
    updatedAt: new Date(),
  };
}

/**
 * Set base importance from content analysis
 */
export function setBaseImportance(
  score: ImportanceScore,
  baseImportance: number
): ImportanceScore {
  const newBase = Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, baseImportance));
  const newFinalScore = calculateFinalScore(
    newBase,
    score.usageImportance,
    score.recencyImportance,
    score.connectionImportance
  );

  return {
    ...score,
    baseImportance: newBase,
    finalScore: newFinalScore,
    updatedAt: new Date(),
  };
}

/**
 * Set connection importance from graph centrality
 */
export function setConnectionImportance(
  score: ImportanceScore,
  connectionImportance: number
): ImportanceScore {
  const newConnection = Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, connectionImportance));
  const newFinalScore = calculateFinalScore(
    score.baseImportance,
    score.usageImportance,
    score.recencyImportance,
    newConnection
  );

  return {
    ...score,
    connectionImportance: newConnection,
    finalScore: newFinalScore,
    updatedAt: new Date(),
  };
}

/**
 * Importance Tracker
 *
 * Manages importance scores for all memories
 */
export class ImportanceTracker {
  private scores: Map<string, ImportanceScore> = new Map();
  private recentEvents: UsageEvent[] = [];
  private maxRecentEvents: number;
  private decayConfig: ImportanceDecayConfig;

  constructor(config?: Partial<ImportanceDecayConfig>, maxRecentEvents: number = 1000) {
    this.maxRecentEvents = maxRecentEvents;
    this.decayConfig = {
      decayRate: config?.decayRate ?? DEFAULT_DECAY_RATE,
      minImportance: config?.minImportance ?? MIN_IMPORTANCE,
      maxImportance: config?.maxImportance ?? MAX_IMPORTANCE,
      gracePeriodDays: config?.gracePeriodDays ?? DEFAULT_GRACE_PERIOD_DAYS,
      recencyHalfLifeDays: config?.recencyHalfLifeDays ?? DEFAULT_RECENCY_HALF_LIFE_DAYS,
    };
  }

  /**
   * Initialize or get importance score for a memory
   */
  getOrCreate(memoryId: string, baseImportance?: number): ImportanceScore {
    const existing = this.scores.get(memoryId);
    if (existing) return existing;

    const score = createImportanceScore(memoryId, baseImportance);
    this.scores.set(memoryId, score);
    return score;
  }

  /**
   * Get importance score for a memory
   */
  getImportance(memoryId: string): ImportanceScore | null {
    return this.scores.get(memoryId) ?? null;
  }

  /**
   * Record a retrieval event
   */
  onRetrieved(memoryId: string, wasHelpful: boolean, context?: string): ImportanceScore {
    const score = this.getOrCreate(memoryId);
    const updated = onRetrieved(score, wasHelpful);
    this.scores.set(memoryId, updated);

    // Record event
    const event: UsageEvent = {
      id: nanoid(),
      memoryId,
      wasHelpful,
      context,
      timestamp: new Date(),
    };
    this.recentEvents.push(event);

    // Trim events
    while (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    return updated;
  }

  /**
   * Apply decay to all scores
   */
  applyDecay(): number {
    let updatedCount = 0;

    for (const [memoryId, score] of this.scores) {
      let updated = applyRecencyDecay(score, this.decayConfig.recencyHalfLifeDays);
      updated = applyUsageDecay(updated, this.decayConfig);

      if (updated.finalScore !== score.finalScore) {
        this.scores.set(memoryId, updated);
        updatedCount++;
      }
    }

    return updatedCount;
  }

  /**
   * Set base importance for a memory
   */
  setBaseImportance(memoryId: string, baseImportance: number): ImportanceScore {
    const score = this.getOrCreate(memoryId);
    const updated = setBaseImportance(score, baseImportance);
    this.scores.set(memoryId, updated);
    return updated;
  }

  /**
   * Set connection importance for a memory
   */
  setConnectionImportance(memoryId: string, connectionImportance: number): ImportanceScore {
    const score = this.getOrCreate(memoryId);
    const updated = setConnectionImportance(score, connectionImportance);
    this.scores.set(memoryId, updated);
    return updated;
  }

  /**
   * Weight search results by importance
   */
  weightByImportance<T extends { memoryId: string; score: number }>(
    results: T[]
  ): T[] {
    return results
      .map(r => {
        const importance = this.scores.get(r.memoryId);
        const importanceWeight = importance?.finalScore ?? 0.5;
        return {
          ...r,
          score: r.score * (0.5 + 0.5 * importanceWeight),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get top memories by importance
   */
  getTopByImportance(limit: number = 10): ImportanceScore[] {
    const all = Array.from(this.scores.values());
    all.sort((a, b) => b.finalScore - a.finalScore);
    return all.slice(0, limit);
  }

  /**
   * Get neglected memories (high base importance but low usage)
   */
  getNeglectedMemories(
    minBaseImportance: number = 0.6,
    maxUsageImportance: number = 0.3,
    limit: number = 10
  ): ImportanceScore[] {
    const neglected = Array.from(this.scores.values()).filter(
      s => s.baseImportance >= minBaseImportance && s.usageImportance <= maxUsageImportance
    );

    neglected.sort((a, b) => b.baseImportance - a.baseImportance);
    return neglected.slice(0, limit);
  }

  /**
   * Get memories that should be reviewed (declining usage)
   */
  getForReview(limit: number = 10): ImportanceScore[] {
    const forReview = Array.from(this.scores.values()).filter(s => {
      // High base importance but declining recency
      return s.baseImportance >= 0.5 && s.recencyImportance < 0.5;
    });

    // Sort by how much they've declined
    forReview.sort((a, b) => {
      const declineA = a.baseImportance - a.recencyImportance;
      const declineB = b.baseImportance - b.recencyImportance;
      return declineB - declineA;
    });

    return forReview.slice(0, limit);
  }

  /**
   * Get recent usage events
   */
  getRecentEvents(limit: number = 100): UsageEvent[] {
    return this.recentEvents.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalTracked: number;
    avgFinalScore: number;
    avgUsageImportance: number;
    totalRetrievals: number;
    helpfulRate: number;
  } {
    const scores = Array.from(this.scores.values());
    if (scores.length === 0) {
      return {
        totalTracked: 0,
        avgFinalScore: 0,
        avgUsageImportance: 0,
        totalRetrievals: 0,
        helpfulRate: 0,
      };
    }

    const totalFinalScore = scores.reduce((sum, s) => sum + s.finalScore, 0);
    const totalUsageImportance = scores.reduce((sum, s) => sum + s.usageImportance, 0);
    const totalRetrievals = scores.reduce((sum, s) => sum + s.retrievalCount, 0);
    const totalHelpful = scores.reduce((sum, s) => sum + s.helpfulCount, 0);

    return {
      totalTracked: scores.length,
      avgFinalScore: totalFinalScore / scores.length,
      avgUsageImportance: totalUsageImportance / scores.length,
      totalRetrievals,
      helpfulRate: totalRetrievals > 0 ? totalHelpful / totalRetrievals : 0,
    };
  }

  /**
   * Remove a memory from tracking
   */
  remove(memoryId: string): boolean {
    return this.scores.delete(memoryId);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.scores.clear();
    this.recentEvents = [];
  }

  /**
   * Export all scores
   */
  export(): ImportanceScore[] {
    return Array.from(this.scores.values());
  }

  /**
   * Import scores
   */
  import(scores: ImportanceScore[]): void {
    for (const score of scores) {
      this.scores.set(score.memoryId, score);
    }
  }
}

/**
 * Calculate novelty score based on similarity to existing memories
 */
export function calculateNoveltyScore(
  similarities: number[],
  threshold: number = 0.7
): number {
  if (similarities.length === 0) return 1.0; // Completely novel

  // Find max similarity to any existing memory
  const maxSimilarity = Math.max(...similarities);

  // If very similar to something, not novel
  if (maxSimilarity >= threshold) {
    return 1 - maxSimilarity;
  }

  // Otherwise, novelty based on average dissimilarity
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  return 1 - avgSimilarity;
}

/**
 * Calculate emotional importance from sentiment
 */
export function calculateEmotionalImportance(
  sentimentIntensity: number,
  maxBoost: number = 0.3
): number {
  // Higher absolute sentiment = more important
  const intensity = Math.abs(sentimentIntensity);
  return Math.min(maxBoost, intensity * maxBoost);
}
