/**
 * Dreams & Consolidation Module
 *
 * Implements sleep-dependent memory consolidation:
 * - Memory replay during "sleep" cycles
 * - Insight generation through pattern detection
 * - Memory strengthening and integration
 *
 * Based on:
 * - Stickgold & Walker (2013) - Sleep-dependent memory triage
 * - Lewis & Durrant (2011) - Overlapping memory replay
 */

import { nanoid } from 'nanoid';

/** Dream/consolidation cycle phases */
export enum ConsolidationPhase {
  /** Light processing - initial memory selection */
  Light = 'light',
  /** Deep processing - memory strengthening */
  Deep = 'deep',
  /** REM processing - insight generation */
  REM = 'rem',
  /** Wake state - normal operation */
  Wake = 'wake',
}

/** Memory replay event */
export interface MemoryReplay {
  id: string;
  memoryId: string;
  phase: ConsolidationPhase;
  replayStrength: number;
  timestamp: Date;
  linkedMemories: string[];
  insightGenerated: boolean;
}

/** Insight discovered during consolidation */
export interface ConsolidationInsight {
  id: string;
  type: InsightType;
  sourceMemoryIds: string[];
  description: string;
  confidence: number;
  timestamp: Date;
  applied: boolean;
}

/** Types of insights */
export enum InsightType {
  /** Pattern detected across memories */
  PatternDetection = 'pattern_detection',
  /** Connection discovered between memories */
  ConnectionDiscovery = 'connection_discovery',
  /** Contradiction found */
  ContradictionDetected = 'contradiction_detected',
  /** Redundancy found */
  RedundancyDetected = 'redundancy_detected',
  /** Gap in knowledge identified */
  KnowledgeGap = 'knowledge_gap',
  /** Generalization formed */
  Generalization = 'generalization',
}

/** Consolidation cycle result */
export interface ConsolidationResult {
  cycleId: string;
  startTime: Date;
  endTime: Date;
  phase: ConsolidationPhase;
  memoriesReplayed: number;
  memoriesStrengthened: number;
  insightsGenerated: InsightType[];
  newConnections: number;
}

/** Configuration for consolidation */
export interface ConsolidationConfig {
  /** Minimum memories to process per cycle */
  minMemoriesPerCycle: number;
  /** Maximum memories to process per cycle */
  maxMemoriesPerCycle: number;
  /** Strength boost for replayed memories */
  replayStrengthBoost: number;
  /** Minimum similarity for connection detection */
  connectionThreshold: number;
  /** Minimum confidence for insight generation */
  insightConfidenceThreshold: number;
}

/** Default configuration */
export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  minMemoriesPerCycle: 5,
  maxMemoriesPerCycle: 50,
  replayStrengthBoost: 0.1,
  connectionThreshold: 0.6,
  insightConfidenceThreshold: 0.7,
};

/** Memory candidate for consolidation */
export interface ConsolidationCandidate {
  memoryId: string;
  content: string;
  importance: number;
  lastAccessed: Date;
  accessCount: number;
  embedding?: number[];
  tags: string[];
}

/**
 * Select memories for consolidation based on importance and recency
 */
export function selectForConsolidation(
  candidates: ConsolidationCandidate[],
  config: ConsolidationConfig = DEFAULT_CONSOLIDATION_CONFIG
): ConsolidationCandidate[] {
  // Score each candidate
  const scored = candidates.map(c => {
    // Prioritize:
    // 1. High importance (40%)
    // 2. Recent but not too recent (30%) - 1-7 days is optimal
    // 3. Low access count - hasn't been consolidated much (30%)
    const daysSinceAccess =
      (Date.now() - c.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);

    // Recency score: peaks at 1-3 days, decays after
    const recencyScore =
      daysSinceAccess < 1
        ? 0.5 // Too recent
        : daysSinceAccess < 7
          ? 1.0 // Optimal window
          : Math.max(0.2, 1 - (daysSinceAccess - 7) / 30); // Decay after 7 days

    // Access score: prioritize less-accessed memories
    const accessScore = 1 / (1 + c.accessCount * 0.1);

    const score = c.importance * 0.4 + recencyScore * 0.3 + accessScore * 0.3;

    return { candidate: c, score };
  });

  // Sort by score and select top candidates
  scored.sort((a, b) => b.score - a.score);

  const count = Math.min(
    config.maxMemoriesPerCycle,
    Math.max(config.minMemoriesPerCycle, Math.floor(candidates.length * 0.1))
  );

  return scored.slice(0, count).map(s => s.candidate);
}

/**
 * Detect patterns across a set of memories
 */
export function detectPatterns(
  memories: ConsolidationCandidate[]
): { pattern: string; memoryIds: string[]; confidence: number }[] {
  const patterns: { pattern: string; memoryIds: string[]; confidence: number }[] = [];

  // Simple pattern detection: common tags
  const tagCounts = new Map<string, string[]>();
  for (const m of memories) {
    for (const tag of m.tags) {
      const existing = tagCounts.get(tag) ?? [];
      existing.push(m.memoryId);
      tagCounts.set(tag, existing);
    }
  }

  // Tags appearing in multiple memories suggest patterns
  for (const [tag, memoryIds] of tagCounts) {
    if (memoryIds.length >= 3) {
      const confidence = Math.min(1, memoryIds.length / memories.length + 0.3);
      patterns.push({
        pattern: `Common topic: ${tag}`,
        memoryIds,
        confidence,
      });
    }
  }

  return patterns;
}

/**
 * Find potential connections between memories based on content overlap
 */
export function findPotentialConnections(
  memories: ConsolidationCandidate[],
  threshold: number = 0.6
): { sourceId: string; targetId: string; similarity: number }[] {
  const connections: { sourceId: string; targetId: string; similarity: number }[] = [];

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const m1 = memories[i]!;
      const m2 = memories[j]!;

      // Simple content similarity using word overlap
      const words1 = new Set(m1.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      const words2 = new Set(m2.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));

      if (words1.size === 0 || words2.size === 0) continue;

      let overlap = 0;
      for (const w of words1) {
        if (words2.has(w)) overlap++;
      }

      const similarity = (2 * overlap) / (words1.size + words2.size);

      if (similarity >= threshold) {
        connections.push({
          sourceId: m1.memoryId,
          targetId: m2.memoryId,
          similarity,
        });
      }
    }
  }

  // Sort by similarity
  connections.sort((a, b) => b.similarity - a.similarity);
  return connections;
}

/**
 * Generate insights from consolidation
 */
export function generateInsights(
  memories: ConsolidationCandidate[],
  config: ConsolidationConfig = DEFAULT_CONSOLIDATION_CONFIG
): ConsolidationInsight[] {
  const insights: ConsolidationInsight[] = [];

  // Pattern detection insights
  const patterns = detectPatterns(memories);
  for (const pattern of patterns) {
    if (pattern.confidence >= config.insightConfidenceThreshold) {
      insights.push({
        id: nanoid(),
        type: InsightType.PatternDetection,
        sourceMemoryIds: pattern.memoryIds,
        description: pattern.pattern,
        confidence: pattern.confidence,
        timestamp: new Date(),
        applied: false,
      });
    }
  }

  // Connection discovery insights
  const connections = findPotentialConnections(memories, config.connectionThreshold);
  for (const conn of connections.slice(0, 10)) { // Limit insights
    insights.push({
      id: nanoid(),
      type: InsightType.ConnectionDiscovery,
      sourceMemoryIds: [conn.sourceId, conn.targetId],
      description: `Potential connection (${(conn.similarity * 100).toFixed(0)}% similar)`,
      confidence: conn.similarity,
      timestamp: new Date(),
      applied: false,
    });
  }

  return insights;
}

/**
 * Consolidation Engine
 *
 * Runs memory consolidation cycles
 */
export class ConsolidationEngine {
  private config: ConsolidationConfig;
  private currentPhase: ConsolidationPhase = ConsolidationPhase.Wake;
  private cycleHistory: ConsolidationResult[] = [];
  private insights: ConsolidationInsight[] = [];
  private replays: MemoryReplay[] = [];

  constructor(config?: Partial<ConsolidationConfig>) {
    this.config = {
      ...DEFAULT_CONSOLIDATION_CONFIG,
      ...config,
    };
  }

  /**
   * Get current phase
   */
  getPhase(): ConsolidationPhase {
    return this.currentPhase;
  }

  /**
   * Start a consolidation cycle
   */
  startCycle(phase: ConsolidationPhase): void {
    this.currentPhase = phase;
  }

  /**
   * Run consolidation on a set of memories
   */
  consolidate(
    candidates: ConsolidationCandidate[]
  ): ConsolidationResult {
    const startTime = new Date();
    const cycleId = nanoid();

    // Select memories for processing
    const selected = selectForConsolidation(candidates, this.config);

    // Create replay events
    const replays: MemoryReplay[] = selected.map(m => ({
      id: nanoid(),
      memoryId: m.memoryId,
      phase: this.currentPhase,
      replayStrength: this.config.replayStrengthBoost,
      timestamp: new Date(),
      linkedMemories: [],
      insightGenerated: false,
    }));
    this.replays.push(...replays);

    // Generate insights
    const newInsights = generateInsights(selected, this.config);
    this.insights.push(...newInsights);

    // Find connections
    const connections = findPotentialConnections(selected, this.config.connectionThreshold);

    // Update replays with linked memories
    for (const conn of connections) {
      const sourceReplay = replays.find(r => r.memoryId === conn.sourceId);
      const targetReplay = replays.find(r => r.memoryId === conn.targetId);
      if (sourceReplay) sourceReplay.linkedMemories.push(conn.targetId);
      if (targetReplay) targetReplay.linkedMemories.push(conn.sourceId);
    }

    // Mark replays that generated insights
    for (const insight of newInsights) {
      for (const memId of insight.sourceMemoryIds) {
        const replay = replays.find(r => r.memoryId === memId);
        if (replay) replay.insightGenerated = true;
      }
    }

    const result: ConsolidationResult = {
      cycleId,
      startTime,
      endTime: new Date(),
      phase: this.currentPhase,
      memoriesReplayed: selected.length,
      memoriesStrengthened: replays.filter(r => r.replayStrength > 0).length,
      insightsGenerated: newInsights.map(i => i.type),
      newConnections: connections.length,
    };

    this.cycleHistory.push(result);
    return result;
  }

  /**
   * End consolidation cycle
   */
  endCycle(): void {
    this.currentPhase = ConsolidationPhase.Wake;
  }

  /**
   * Get all generated insights
   */
  getInsights(): ConsolidationInsight[] {
    return [...this.insights];
  }

  /**
   * Get pending (unapplied) insights
   */
  getPendingInsights(): ConsolidationInsight[] {
    return this.insights.filter(i => !i.applied);
  }

  /**
   * Mark an insight as applied
   */
  markInsightApplied(insightId: string): boolean {
    const insight = this.insights.find(i => i.id === insightId);
    if (!insight) return false;

    insight.applied = true;
    return true;
  }

  /**
   * Get cycle history
   */
  getCycleHistory(): ConsolidationResult[] {
    return [...this.cycleHistory];
  }

  /**
   * Get replay history
   */
  getReplayHistory(): MemoryReplay[] {
    return [...this.replays];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCycles: number;
    totalMemoriesReplayed: number;
    totalInsightsGenerated: number;
    insightsApplied: number;
    avgMemoriesPerCycle: number;
  } {
    const totalCycles = this.cycleHistory.length;
    const totalMemoriesReplayed = this.cycleHistory.reduce(
      (sum, c) => sum + c.memoriesReplayed,
      0
    );

    return {
      totalCycles,
      totalMemoriesReplayed,
      totalInsightsGenerated: this.insights.length,
      insightsApplied: this.insights.filter(i => i.applied).length,
      avgMemoriesPerCycle: totalCycles > 0 ? totalMemoriesReplayed / totalCycles : 0,
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.cycleHistory = [];
    this.replays = [];
    // Keep insights as they may still be pending
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.cycleHistory = [];
    this.replays = [];
    this.insights = [];
    this.currentPhase = ConsolidationPhase.Wake;
  }
}

/**
 * Calculate optimal consolidation timing based on memory age distribution
 */
export function calculateOptimalConsolidationTime(
  memories: ConsolidationCandidate[]
): Date {
  if (memories.length === 0) {
    // Default: 8 hours from now
    return new Date(Date.now() + 8 * 60 * 60 * 1000);
  }

  // Find memories in the optimal 1-7 day window
  const now = Date.now();
  const optimalMemories = memories.filter(m => {
    const days = (now - m.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    return days >= 1 && days <= 7;
  });

  if (optimalMemories.length >= 5) {
    // Enough memories ready - consolidate soon
    return new Date(now + 1 * 60 * 60 * 1000); // 1 hour
  }

  // Find when enough memories will be ready
  const recentMemories = memories.filter(m => {
    const days = (now - m.lastAccessed.getTime()) / (1000 * 60 * 60 * 24);
    return days < 1;
  });

  if (recentMemories.length > 0) {
    // Wait for recent memories to age
    const oldest = recentMemories.reduce((oldest, m) =>
      m.lastAccessed < oldest.lastAccessed ? m : oldest
    );
    const hoursUntilReady = 24 - (now - oldest.lastAccessed.getTime()) / (1000 * 60 * 60);
    return new Date(now + Math.max(1, hoursUntilReady) * 60 * 60 * 1000);
  }

  // Default: 8 hours
  return new Date(now + 8 * 60 * 60 * 1000);
}
