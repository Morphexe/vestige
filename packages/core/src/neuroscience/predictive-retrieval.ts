/**
 * Predictive Retrieval Module
 *
 * Implements predictive memory retrieval based on:
 * - User interest modeling
 * - Temporal access patterns
 * - Co-access patterns (memories frequently retrieved together)
 * - Session context
 *
 * The goal is to proactively surface memories the user is likely to need
 * before they explicitly search for them.
 *
 * Based on:
 * - Predictive coding in the brain (Friston, 2010)
 * - Contextual memory retrieval (Tulving, 1983)
 */

import { nanoid } from 'nanoid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Reasons for predicting a memory
 */
export type PredictionReason =
  | 'interest_based'       // Matches user's tracked interests
  | 'query_pattern'        // Matches historical query patterns
  | 'temporal_pattern'     // Matches time-of-day/week patterns
  | 'session_context'      // Relevant to current work session
  | 'co_access'            // Often accessed with recently-viewed memories
  | 'semantic_similarity'; // Semantically similar to recent activity

/**
 * A predicted memory that the user might need
 */
export interface PredictedMemory {
  /** Memory ID */
  memoryId: string;
  /** Preview of content */
  contentPreview: string;
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Why this was predicted */
  reasoning: PredictionReason;
  /** When this prediction was made */
  predictedAt: Date;
  /** Tags associated with this memory */
  tags: string[];
}

/**
 * Record of a user query and its results
 */
export interface QueryPattern {
  /** The query string */
  query: string;
  /** Tags from matching results */
  tags: string[];
  /** When the query was made */
  timestamp: Date;
  /** Memory IDs that were accessed from results */
  accessedResults: string[];
  /** User satisfaction signal (0-1) */
  satisfaction: number;
}

/**
 * Temporal access patterns by time buckets
 */
export interface TemporalPatterns {
  /** 24 hourly buckets (0-23) */
  hourly: number[];
  /** 7 daily buckets (0=Sunday, 6=Saturday) */
  daily: number[];
  /** 12 monthly buckets (0=January, 11=December) */
  monthly: number[];
}

/**
 * Context about a user's project/codebase
 */
export interface ProjectContext {
  /** Project/codebase name */
  name: string;
  /** Root path if known */
  path?: string;
  /** Technologies/languages */
  technologies: string[];
  /** Active since timestamp */
  activeSince: Date;
}

/**
 * Context about the current work session
 */
export interface SessionContext {
  /** Topics being focused on */
  focus: string[];
  /** Files being worked on */
  activeFiles: string[];
  /** Memories accessed this session */
  accessedMemories: string[];
  /** Queries made this session */
  queries: string[];
  /** Current project context */
  project?: ProjectContext;
  /** When session started */
  startedAt: Date;
}

/**
 * User model for personalized predictions
 */
export interface UserModel {
  /** Topic interests with weights */
  interests: Map<string, number>;
  /** History of queries */
  queryHistory: QueryPattern[];
  /** Temporal access patterns */
  temporalPatterns: TemporalPatterns;
  /** Current session context */
  session: SessionContext;
  /** Co-access patterns: memoryId -> memoryIds often accessed with it */
  coAccessPatterns: Map<string, string[]>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Interest decay factor (EMA weight for new observations) */
export const INTEREST_DECAY_ALPHA = 0.1;

/** Daily decay factor for interests */
export const DAILY_DECAY_FACTOR = 0.98;

/** Maximum query history to retain */
export const MAX_QUERY_HISTORY = 500;

/** Maximum co-access pairs to track per memory */
export const MAX_CO_ACCESS_PER_MEMORY = 20;

/** Session timeout in milliseconds (30 minutes of inactivity) */
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/** Prediction weights for different sources */
export const PREDICTION_WEIGHTS = {
  interest: 0.3,
  temporal: 0.2,
  coAccess: 0.3,
  session: 0.2,
};

/** Minimum confidence threshold for predictions */
export const MIN_PREDICTION_CONFIDENCE = 0.2;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create empty temporal patterns
 */
export function createTemporalPatterns(): TemporalPatterns {
  return {
    hourly: new Array(24).fill(0),
    daily: new Array(7).fill(0),
    monthly: new Array(12).fill(0),
  };
}

/**
 * Create a new session context
 */
export function createSessionContext(project?: ProjectContext): SessionContext {
  return {
    focus: [],
    activeFiles: [],
    accessedMemories: [],
    queries: [],
    project,
    startedAt: new Date(),
  };
}

/**
 * Create a new user model
 */
export function createUserModel(): UserModel {
  return {
    interests: new Map(),
    queryHistory: [],
    temporalPatterns: createTemporalPatterns(),
    session: createSessionContext(),
    coAccessPatterns: new Map(),
  };
}

// ============================================================================
// PREDICTIVE RETRIEVAL SYSTEM
// ============================================================================

/**
 * Predictive Retrieval System
 *
 * Learns from user behavior to predict what memories they'll need.
 */
export class PredictiveRetrievalSystem {
  private model: UserModel;
  private lastInteraction: Date;
  private enabled: boolean = true;

  /** Callback to get memory content preview */
  private getMemoryPreview?: (memoryId: string) => Promise<{ content: string; tags: string[] } | null>;

  constructor(model?: UserModel) {
    this.model = model ?? createUserModel();
    this.lastInteraction = new Date();
  }

  /**
   * Set callback for getting memory previews
   */
  setMemoryPreviewCallback(
    callback: (memoryId: string) => Promise<{ content: string; tags: string[] } | null>
  ): void {
    this.getMemoryPreview = callback;
  }

  /**
   * Enable or disable predictions
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if system is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ==========================================================================
  // INTEREST TRACKING
  // ==========================================================================

  /**
   * Update interest weight for a topic
   * Uses Exponential Moving Average: w = w×0.9 + new×0.1
   */
  updateInterest(topic: string, weight: number = 1.0): void {
    const normalizedTopic = topic.toLowerCase().trim();
    if (!normalizedTopic) return;

    const currentWeight = this.model.interests.get(normalizedTopic) ?? 0;
    const newWeight = currentWeight * (1 - INTEREST_DECAY_ALPHA) + weight * INTEREST_DECAY_ALPHA;
    this.model.interests.set(normalizedTopic, Math.min(1, Math.max(0, newWeight)));
    this.lastInteraction = new Date();
  }

  /**
   * Get current interest in a topic
   */
  getInterest(topic: string): number {
    return this.model.interests.get(topic.toLowerCase().trim()) ?? 0;
  }

  /**
   * Get all interests sorted by weight
   */
  getInterests(): Array<{ topic: string; weight: number }> {
    return Array.from(this.model.interests.entries())
      .map(([topic, weight]) => ({ topic, weight }))
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * Apply daily decay to all interests
   */
  applyDecay(): void {
    for (const [topic, weight] of this.model.interests) {
      const newWeight = weight * DAILY_DECAY_FACTOR;
      if (newWeight < 0.01) {
        this.model.interests.delete(topic);
      } else {
        this.model.interests.set(topic, newWeight);
      }
    }
  }

  // ==========================================================================
  // QUERY RECORDING
  // ==========================================================================

  /**
   * Record a user query
   */
  recordQuery(query: string, tags: string[], accessedResults: string[], satisfaction: number = 0.8): void {
    const pattern: QueryPattern = {
      query,
      tags,
      timestamp: new Date(),
      accessedResults,
      satisfaction,
    };

    this.model.queryHistory.push(pattern);

    // Update interests from tags
    for (const tag of tags) {
      this.updateInterest(tag, satisfaction);
    }

    // Update session
    this.model.session.queries.push(query);

    // Trim history
    while (this.model.queryHistory.length > MAX_QUERY_HISTORY) {
      this.model.queryHistory.shift();
    }

    this.lastInteraction = new Date();
  }

  // ==========================================================================
  // MEMORY ACCESS TRACKING
  // ==========================================================================

  /**
   * Record a memory access
   */
  recordMemoryAccess(memoryId: string, tags: string[]): void {
    // Update session
    if (!this.model.session.accessedMemories.includes(memoryId)) {
      this.model.session.accessedMemories.push(memoryId);
    }

    // Update temporal patterns
    const now = new Date();
    this.model.temporalPatterns.hourly[now.getHours()] =
      (this.model.temporalPatterns.hourly[now.getHours()] ?? 0) + 1;
    this.model.temporalPatterns.daily[now.getDay()] =
      (this.model.temporalPatterns.daily[now.getDay()] ?? 0) + 1;
    this.model.temporalPatterns.monthly[now.getMonth()] =
      (this.model.temporalPatterns.monthly[now.getMonth()] ?? 0) + 1;

    // Update interests from tags
    for (const tag of tags) {
      this.updateInterest(tag, 0.5);
    }

    this.lastInteraction = new Date();
  }

  /**
   * Record co-access of multiple memories
   */
  recordCoAccess(memoryIds: string[]): void {
    if (memoryIds.length < 2) return;

    // Record pairwise co-access
    for (let i = 0; i < memoryIds.length; i++) {
      const sourceId = memoryIds[i]!;
      const coAccessList = this.model.coAccessPatterns.get(sourceId) ?? [];

      for (let j = 0; j < memoryIds.length; j++) {
        if (i !== j) {
          const targetId = memoryIds[j]!;
          if (!coAccessList.includes(targetId)) {
            coAccessList.push(targetId);
          }
        }
      }

      // Trim to max size (keep most recent)
      while (coAccessList.length > MAX_CO_ACCESS_PER_MEMORY) {
        coAccessList.shift();
      }

      this.model.coAccessPatterns.set(sourceId, coAccessList);
    }
  }

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================

  /**
   * Start a new session
   */
  startSession(project?: ProjectContext): void {
    this.model.session = createSessionContext(project);
    this.lastInteraction = new Date();
  }

  /**
   * Add focus topic to session
   */
  addSessionFocus(topic: string): void {
    if (!this.model.session.focus.includes(topic)) {
      this.model.session.focus.push(topic);
    }
    this.lastInteraction = new Date();
  }

  /**
   * Add active file to session
   */
  addActiveFile(filePath: string): void {
    if (!this.model.session.activeFiles.includes(filePath)) {
      this.model.session.activeFiles.push(filePath);
    }
    this.lastInteraction = new Date();
  }

  /**
   * Check if session has timed out
   */
  isSessionExpired(): boolean {
    return Date.now() - this.lastInteraction.getTime() > SESSION_TIMEOUT_MS;
  }

  /**
   * Get current session context
   */
  getSession(): SessionContext {
    return this.model.session;
  }

  // ==========================================================================
  // PREDICTION
  // ==========================================================================

  /**
   * Predict memories the user might need
   */
  async predictNeededMemories(limit: number = 10): Promise<PredictedMemory[]> {
    if (!this.enabled) return [];

    // Check for session timeout
    if (this.isSessionExpired()) {
      this.startSession(this.model.session.project);
    }

    // Gather predictions from all sources
    const predictions: PredictedMemory[][] = await Promise.all([
      this.predictFromInterests(),
      this.predictFromTemporal(),
      this.predictFromSession(),
    ]);

    // Add co-access predictions if we have recent memory accesses
    if (this.model.session.accessedMemories.length > 0) {
      const lastAccessedId = this.model.session.accessedMemories[
        this.model.session.accessedMemories.length - 1
      ];
      if (lastAccessedId) {
        predictions.push(await this.predictFromCoAccess(lastAccessedId));
      }
    }

    // Merge and deduplicate predictions
    return this.mergePredictions(predictions, limit);
  }

  /**
   * Predict based on user interests
   */
  async predictFromInterests(): Promise<PredictedMemory[]> {
    // This would normally query the database for memories matching top interests
    // For now, return empty array as this requires database integration
    const predictions: PredictedMemory[] = [];

    // Get top interests
    const topInterests = this.getInterests().slice(0, 5);

    // In a real implementation, query memories with these tags
    // and return them as predictions

    return predictions;
  }

  /**
   * Predict based on temporal patterns
   */
  async predictFromTemporal(): Promise<PredictedMemory[]> {
    // This would analyze which memories are typically accessed at this time
    // For now, return empty array as this requires database integration
    const predictions: PredictedMemory[] = [];

    // Get current temporal context
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    // Calculate temporal relevance
    // In a real implementation, find memories that were frequently accessed
    // at similar times

    return predictions;
  }

  /**
   * Predict based on co-access patterns
   */
  async predictFromCoAccess(currentMemoryId: string): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];
    const coAccessList = this.model.coAccessPatterns.get(currentMemoryId) ?? [];

    for (const memoryId of coAccessList) {
      if (this.model.session.accessedMemories.includes(memoryId)) {
        continue; // Already accessed this session
      }

      // Get preview if callback is set
      let contentPreview = '';
      let tags: string[] = [];

      if (this.getMemoryPreview) {
        const preview = await this.getMemoryPreview(memoryId);
        if (preview) {
          contentPreview = preview.content.slice(0, 100);
          tags = preview.tags;
        }
      }

      predictions.push({
        memoryId,
        contentPreview,
        confidence: 0.6, // Co-access confidence
        reasoning: 'co_access',
        predictedAt: new Date(),
        tags,
      });
    }

    return predictions.slice(0, 5);
  }

  /**
   * Predict based on session context
   */
  async predictFromSession(): Promise<PredictedMemory[]> {
    const predictions: PredictedMemory[] = [];

    // In a real implementation, find memories relevant to:
    // - Session focus topics
    // - Active files (related documentation, past decisions)
    // - Project context

    return predictions;
  }

  /**
   * Merge predictions from multiple sources
   */
  mergePredictions(sources: PredictedMemory[][], limit: number): PredictedMemory[] {
    const merged = new Map<string, PredictedMemory>();

    for (const source of sources) {
      for (const prediction of source) {
        const existing = merged.get(prediction.memoryId);

        if (existing) {
          // Combine confidences (take max)
          if (prediction.confidence > existing.confidence) {
            merged.set(prediction.memoryId, prediction);
          }
        } else {
          merged.set(prediction.memoryId, prediction);
        }
      }
    }

    // Filter by minimum confidence and sort
    return Array.from(merged.values())
      .filter(p => p.confidence >= MIN_PREDICTION_CONFIDENCE)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);
  }

  /**
   * Calculate novelty signal for a set of tags
   * Higher value means the content is less familiar to the user
   */
  signalNovelty(tags: string[]): number {
    if (tags.length === 0) return 1.0;

    let totalInterest = 0;
    for (const tag of tags) {
      totalInterest += this.getInterest(tag);
    }

    const avgInterest = totalInterest / tags.length;
    return 1.0 - avgInterest;
  }

  // ==========================================================================
  // MODEL MANAGEMENT
  // ==========================================================================

  /**
   * Get the user model
   */
  getModel(): UserModel {
    return this.model;
  }

  /**
   * Export model for persistence
   */
  exportModel(): {
    interests: Array<[string, number]>;
    queryHistory: QueryPattern[];
    temporalPatterns: TemporalPatterns;
    coAccessPatterns: Array<[string, string[]]>;
  } {
    return {
      interests: Array.from(this.model.interests.entries()),
      queryHistory: this.model.queryHistory,
      temporalPatterns: this.model.temporalPatterns,
      coAccessPatterns: Array.from(this.model.coAccessPatterns.entries()),
    };
  }

  /**
   * Import model from persistence
   */
  importModel(data: {
    interests: Array<[string, number]>;
    queryHistory: QueryPattern[];
    temporalPatterns: TemporalPatterns;
    coAccessPatterns: Array<[string, string[]]>;
  }): void {
    this.model.interests = new Map(data.interests);
    this.model.queryHistory = data.queryHistory;
    this.model.temporalPatterns = data.temporalPatterns;
    this.model.coAccessPatterns = new Map(data.coAccessPatterns);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.model = createUserModel();
    this.lastInteraction = new Date();
  }

  /**
   * Get statistics
   */
  getStats(): {
    interestCount: number;
    queryCount: number;
    coAccessPairsCount: number;
    sessionMemoryCount: number;
    sessionDurationMs: number;
  } {
    return {
      interestCount: this.model.interests.size,
      queryCount: this.model.queryHistory.length,
      coAccessPairsCount: this.model.coAccessPatterns.size,
      sessionMemoryCount: this.model.session.accessedMemories.length,
      sessionDurationMs: Date.now() - this.model.session.startedAt.getTime(),
    };
  }
}
