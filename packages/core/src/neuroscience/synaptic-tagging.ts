/**
 * Synaptic Tagging & Capture (STC) Module
 *
 * Implements the biological mechanism where:
 * 1. Weak memories create "synaptic tags" at encoding
 * 2. Later important events trigger Plasticity-Related Proteins (PRPs)
 * 3. PRPs "capture" tagged memories within a time window
 * 4. Captured memories become consolidated (important)
 *
 * Based on:
 * - Frey & Morris (1997) - Synaptic tagging hypothesis
 * - Redondo & Morris (2011) - Making memories last
 */

import { nanoid } from 'nanoid';

/** Tag decay function types */
export enum DecayFunction {
  /** Exponential decay (biological accuracy) */
  Exponential = 'exponential',
  /** Linear decay */
  Linear = 'linear',
  /** Power law decay (FSRS-6 matching) */
  Power = 'power',
  /** Logarithmic decay (slowest) */
  Logarithmic = 'logarithmic',
}

/** Default configuration values */
export const DEFAULT_BACKWARD_HOURS = 9; // Neuroscience: STC up to 9 hours backward
export const DEFAULT_FORWARD_HOURS = 2;
export const DEFAULT_TAG_LIFETIME_HOURS = 12;
export const DEFAULT_PRP_THRESHOLD = 0.7;
export const DEFAULT_MIN_TAG_STRENGTH = 0.3;
export const DEFAULT_MAX_CLUSTER_SIZE = 50;

/** Importance event types with base strengths */
export enum ImportanceEventType {
  /** User explicitly flags as important */
  UserFlag = 'user_flag',
  /** Novel information detected */
  NoveltySpike = 'novelty_spike',
  /** High emotional content */
  EmotionalContent = 'emotional_content',
  /** Repeatedly accessed */
  RepeatedAccess = 'repeated_access',
  /** Cross-referenced by other memories */
  CrossReference = 'cross_reference',
  /** Temporally proximate to important event */
  TemporalProximity = 'temporal_proximity',
}

/** Base strengths for each importance type */
export const IMPORTANCE_BASE_STRENGTHS: Record<ImportanceEventType, number> = {
  [ImportanceEventType.UserFlag]: 1.0,
  [ImportanceEventType.NoveltySpike]: 0.9,
  [ImportanceEventType.EmotionalContent]: 0.8,
  [ImportanceEventType.RepeatedAccess]: 0.75,
  [ImportanceEventType.CrossReference]: 0.6,
  [ImportanceEventType.TemporalProximity]: 0.5,
};

/** Capture radius multipliers for each type */
export const CAPTURE_RADIUS_MULTIPLIERS: Record<ImportanceEventType, number> = {
  [ImportanceEventType.UserFlag]: 1.5,
  [ImportanceEventType.NoveltySpike]: 1.2,
  [ImportanceEventType.EmotionalContent]: 1.3,
  [ImportanceEventType.RepeatedAccess]: 1.0,
  [ImportanceEventType.CrossReference]: 0.8,
  [ImportanceEventType.TemporalProximity]: 0.6,
};

/** Synaptic tag attached to a memory */
export interface SynapticTag {
  id: string;
  memoryId: string;
  createdAt: Date;
  tagStrength: number;
  initialStrength: number;
  captured: boolean;
  captureEvent: ImportanceEvent | null;
  capturedAt: Date | null;
  lifetimeHours: number;
  decayFunction: DecayFunction;
}

/** Importance event that triggers PRP */
export interface ImportanceEvent {
  id: string;
  type: ImportanceEventType;
  strength: number;
  timestamp: Date;
  sourceMemoryId?: string;
  metadata?: Record<string, unknown>;
}

/** Configuration for capture window */
export interface CaptureWindowConfig {
  backwardHours: number;
  forwardHours: number;
  decayFunction: DecayFunction;
}

/** Result of successful capture */
export interface CapturedMemory {
  memoryId: string;
  tagId: string;
  eventId: string;
  temporalDistanceHours: number; // Negative = forward, positive = backward
  consolidatedImportance: number;
  captureProbability: number;
  tagStrengthAtCapture: number;
  capturedAt: Date;
}

/** Cluster of related captured memories */
export interface ImportanceCluster {
  id: string;
  triggerEventId: string;
  memoryIds: string[];
  averageImportance: number;
  temporalSpanHours: number;
  createdAt: Date;
}

/** Statistics for the tagging system */
export interface TaggingStatistics {
  totalTagsCreated: number;
  totalTagsCaptured: number;
  totalTagsExpired: number;
  averageCaptureTime: number;
  captureRate: number;
  clusterCount: number;
}

/**
 * Apply decay function to tag strength
 */
export function applyDecay(
  initialStrength: number,
  hoursElapsed: number,
  lifetimeHours: number,
  decayFunction: DecayFunction
): number {
  if (hoursElapsed <= 0) return initialStrength;
  if (hoursElapsed >= lifetimeHours) return 0;

  const t = hoursElapsed / lifetimeHours;

  switch (decayFunction) {
    case DecayFunction.Exponential:
      // strength * e^(-lambda * t) where lambda gives 0.01 at end
      const lambda = -Math.log(0.01);
      return initialStrength * Math.exp(-lambda * t);

    case DecayFunction.Linear:
      return initialStrength * (1 - t);

    case DecayFunction.Power:
      // Power law: (1 + t)^(-alpha) where alpha=2 gives reasonable decay
      const alpha = 2;
      return initialStrength * Math.pow(1 + t * 10, -alpha);

    case DecayFunction.Logarithmic:
      // Slowest decay: 1 / (1 + ln(1 + t*e))
      return initialStrength / (1 + Math.log(1 + t * Math.E));

    default:
      return initialStrength * (1 - t);
  }
}

/**
 * Calculate capture probability based on temporal distance
 */
export function calculateCaptureProbability(
  memoryTime: Date,
  eventTime: Date,
  config: CaptureWindowConfig
): number | null {
  const diffMs = eventTime.getTime() - memoryTime.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  // Check if within window
  if (diffHours < -config.forwardHours || diffHours > config.backwardHours) {
    return null; // Outside window
  }

  // Calculate probability based on distance
  // Peak probability at 0 distance, decays toward edges
  const normalizedDistance = diffHours >= 0
    ? diffHours / config.backwardHours
    : Math.abs(diffHours) / config.forwardHours;

  // Apply decay function to probability
  const probability = applyDecay(1.0, normalizedDistance, 1.0, config.decayFunction);

  return Math.max(0, Math.min(1, probability));
}

/**
 * Create a new synaptic tag
 */
export function createTag(
  memoryId: string,
  initialStrength: number = 1.0,
  lifetimeHours: number = DEFAULT_TAG_LIFETIME_HOURS,
  decayFunction: DecayFunction = DecayFunction.Exponential
): SynapticTag {
  return {
    id: nanoid(),
    memoryId,
    createdAt: new Date(),
    tagStrength: initialStrength,
    initialStrength,
    captured: false,
    captureEvent: null,
    capturedAt: null,
    lifetimeHours,
    decayFunction,
  };
}

/**
 * Update tag strength based on elapsed time
 */
export function updateTagStrength(tag: SynapticTag): SynapticTag {
  if (tag.captured) return tag; // Captured tags don't decay

  const hoursElapsed = (Date.now() - tag.createdAt.getTime()) / (1000 * 60 * 60);
  const newStrength = applyDecay(
    tag.initialStrength,
    hoursElapsed,
    tag.lifetimeHours,
    tag.decayFunction
  );

  return {
    ...tag,
    tagStrength: newStrength,
  };
}

/**
 * Check if tag is still active (not expired and not captured)
 */
export function isTagActive(tag: SynapticTag): boolean {
  if (tag.captured) return false;

  const hoursElapsed = (Date.now() - tag.createdAt.getTime()) / (1000 * 60 * 60);
  return hoursElapsed < tag.lifetimeHours;
}

/**
 * Check if tag is eligible for capture
 */
export function isTagEligible(tag: SynapticTag, minStrength: number = DEFAULT_MIN_TAG_STRENGTH): boolean {
  if (tag.captured) return false;

  const updated = updateTagStrength(tag);
  return updated.tagStrength >= minStrength;
}

/**
 * Synaptic Tagging System
 *
 * Manages the complete STC lifecycle:
 * - Tag creation on memory encoding
 * - Tag decay over time
 * - PRP triggering and memory capture
 * - Cluster formation
 */
export class SynapticTaggingSystem {
  private tags: Map<string, SynapticTag> = new Map();
  private tagsByMemory: Map<string, string> = new Map(); // memoryId -> tagId
  private capturedMemories: CapturedMemory[] = [];
  private clusters: ImportanceCluster[] = [];
  private events: ImportanceEvent[] = [];
  private stats: TaggingStatistics = {
    totalTagsCreated: 0,
    totalTagsCaptured: 0,
    totalTagsExpired: 0,
    averageCaptureTime: 0,
    captureRate: 0,
    clusterCount: 0,
  };

  private config: {
    captureWindow: CaptureWindowConfig;
    prpThreshold: number;
    minTagStrength: number;
    maxClusterSize: number;
  };

  constructor(config?: Partial<{
    captureWindow: Partial<CaptureWindowConfig>;
    prpThreshold: number;
    minTagStrength: number;
    maxClusterSize: number;
  }>) {
    this.config = {
      captureWindow: {
        backwardHours: config?.captureWindow?.backwardHours ?? DEFAULT_BACKWARD_HOURS,
        forwardHours: config?.captureWindow?.forwardHours ?? DEFAULT_FORWARD_HOURS,
        decayFunction: config?.captureWindow?.decayFunction ?? DecayFunction.Exponential,
      },
      prpThreshold: config?.prpThreshold ?? DEFAULT_PRP_THRESHOLD,
      minTagStrength: config?.minTagStrength ?? DEFAULT_MIN_TAG_STRENGTH,
      maxClusterSize: config?.maxClusterSize ?? DEFAULT_MAX_CLUSTER_SIZE,
    };
  }

  /**
   * Tag a memory for potential future capture
   */
  tagMemory(memoryId: string, initialStrength: number = 1.0): SynapticTag {
    // Remove existing tag if present
    const existingTagId = this.tagsByMemory.get(memoryId);
    if (existingTagId) {
      this.tags.delete(existingTagId);
    }

    const tag = createTag(
      memoryId,
      initialStrength,
      DEFAULT_TAG_LIFETIME_HOURS,
      this.config.captureWindow.decayFunction
    );

    this.tags.set(tag.id, tag);
    this.tagsByMemory.set(memoryId, tag.id);
    this.stats.totalTagsCreated++;

    return tag;
  }

  /**
   * Trigger PRP with an importance event
   *
   * Searches for tagged memories within the capture window
   * and captures those with sufficient strength.
   */
  triggerPRP(event: ImportanceEvent): CapturedMemory[] {
    // Check if event is strong enough to trigger PRP
    if (event.strength < this.config.prpThreshold) {
      return [];
    }

    this.events.push(event);

    // Get capture radius multiplier for this event type
    const radiusMultiplier = CAPTURE_RADIUS_MULTIPLIERS[event.type];
    const effectiveBackward = this.config.captureWindow.backwardHours * radiusMultiplier;
    const effectiveForward = this.config.captureWindow.forwardHours * radiusMultiplier;

    const captured: CapturedMemory[] = [];

    // Sweep for eligible tags
    for (const [tagId, tag] of this.tags) {
      if (tag.captured) continue;
      if (!isTagActive(tag)) continue;

      // Calculate capture probability
      const probability = calculateCaptureProbability(
        tag.createdAt,
        event.timestamp,
        {
          backwardHours: effectiveBackward,
          forwardHours: effectiveForward,
          decayFunction: this.config.captureWindow.decayFunction,
        }
      );

      if (probability === null) continue;

      // Update tag strength
      const updatedTag = updateTagStrength(tag);
      if (updatedTag.tagStrength < this.config.minTagStrength) continue;

      // Calculate capture score
      const captureScore = updatedTag.tagStrength * probability * event.strength;
      if (captureScore < this.config.minTagStrength) continue;

      // Calculate consolidated importance
      const consolidatedImportance = Math.min(1.0, captureScore * 0.6 + event.strength * 0.4);

      // Calculate temporal distance
      const temporalDistanceHours =
        (event.timestamp.getTime() - tag.createdAt.getTime()) / (1000 * 60 * 60);

      // Mark tag as captured
      const capturedTag: SynapticTag = {
        ...updatedTag,
        captured: true,
        captureEvent: event,
        capturedAt: new Date(),
      };
      this.tags.set(tagId, capturedTag);

      // Record captured memory
      const capturedMemory: CapturedMemory = {
        memoryId: tag.memoryId,
        tagId: tag.id,
        eventId: event.id,
        temporalDistanceHours,
        consolidatedImportance,
        captureProbability: probability,
        tagStrengthAtCapture: updatedTag.tagStrength,
        capturedAt: new Date(),
      };

      captured.push(capturedMemory);
      this.capturedMemories.push(capturedMemory);
      this.stats.totalTagsCaptured++;
    }

    // Create cluster if multiple memories captured
    if (captured.length > 1) {
      this.createCluster(event, captured);
    }

    // Update statistics
    this.updateStats();

    return captured;
  }

  /**
   * Create an importance cluster from captured memories
   */
  private createCluster(event: ImportanceEvent, captured: CapturedMemory[]): ImportanceCluster {
    const memoryIds = captured.map(c => c.memoryId);
    const avgImportance = captured.reduce((sum, c) => sum + c.consolidatedImportance, 0) / captured.length;

    const timestamps = captured.map(c => c.temporalDistanceHours);
    const temporalSpan = Math.max(...timestamps) - Math.min(...timestamps);

    const cluster: ImportanceCluster = {
      id: nanoid(),
      triggerEventId: event.id,
      memoryIds: memoryIds.slice(0, this.config.maxClusterSize),
      averageImportance: avgImportance,
      temporalSpanHours: temporalSpan,
      createdAt: new Date(),
    };

    this.clusters.push(cluster);
    this.stats.clusterCount = this.clusters.length;

    return cluster;
  }

  /**
   * Decay all active tags and remove expired ones
   */
  decayTags(): number {
    let expiredCount = 0;

    for (const [tagId, tag] of this.tags) {
      if (tag.captured) continue;

      if (!isTagActive(tag)) {
        this.tags.delete(tagId);
        this.tagsByMemory.delete(tag.memoryId);
        expiredCount++;
        this.stats.totalTagsExpired++;
      } else {
        // Update strength
        const updated = updateTagStrength(tag);
        this.tags.set(tagId, updated);
      }
    }

    return expiredCount;
  }

  /**
   * Get all active tags
   */
  getActiveTags(): SynapticTag[] {
    return Array.from(this.tags.values())
      .filter(t => !t.captured && isTagActive(t))
      .map(updateTagStrength);
  }

  /**
   * Get all captured tags
   */
  getCapturedTags(): SynapticTag[] {
    return Array.from(this.tags.values()).filter(t => t.captured);
  }

  /**
   * Get tag for a specific memory
   */
  getTagForMemory(memoryId: string): SynapticTag | null {
    const tagId = this.tagsByMemory.get(memoryId);
    if (!tagId) return null;

    const tag = this.tags.get(tagId);
    if (!tag) return null;

    return updateTagStrength(tag);
  }

  /**
   * Get captured memories
   */
  getCapturedMemories(): CapturedMemory[] {
    return [...this.capturedMemories];
  }

  /**
   * Get clusters
   */
  getClusters(): ImportanceCluster[] {
    return [...this.clusters];
  }

  /**
   * Get statistics
   */
  getStatistics(): TaggingStatistics {
    return { ...this.stats };
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    if (this.stats.totalTagsCreated > 0) {
      this.stats.captureRate = this.stats.totalTagsCaptured / this.stats.totalTagsCreated;
    }

    if (this.capturedMemories.length > 0) {
      const totalCaptureTime = this.capturedMemories.reduce(
        (sum, c) => sum + Math.abs(c.temporalDistanceHours),
        0
      );
      this.stats.averageCaptureTime = totalCaptureTime / this.capturedMemories.length;
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.tags.clear();
    this.tagsByMemory.clear();
    this.capturedMemories = [];
    this.clusters = [];
    this.events = [];
    this.stats = {
      totalTagsCreated: 0,
      totalTagsCaptured: 0,
      totalTagsExpired: 0,
      averageCaptureTime: 0,
      captureRate: 0,
      clusterCount: 0,
    };
  }
}

/**
 * Create an importance event
 */
export function createImportanceEvent(
  type: ImportanceEventType,
  strength?: number,
  sourceMemoryId?: string,
  metadata?: Record<string, unknown>
): ImportanceEvent {
  return {
    id: nanoid(),
    type,
    strength: strength ?? IMPORTANCE_BASE_STRENGTHS[type],
    timestamp: new Date(),
    sourceMemoryId,
    metadata,
  };
}
