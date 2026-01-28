/**
 * Memory Reconsolidation Module
 *
 * Implements Nader's reconsolidation theory: "Memories are rebuilt every time they're recalled."
 *
 * When a memory is accessed, it enters a "labile" (modifiable) state. During this window:
 * - New context can be integrated
 * - Connections can be strengthened
 * - Related information can be linked
 * - Emotional associations can be updated
 *
 * Based on:
 * - Nader (2000) - Memory reconsolidation research
 */

import { nanoid } from 'nanoid';

/** Default labile window duration in milliseconds (5 minutes) */
export const DEFAULT_LABILE_WINDOW_MS = 5 * 60 * 1000;

/** Maximum modifications per memory during labile window */
export const MAX_MODIFICATIONS_PER_WINDOW = 10;

/** How long to keep retrieval history (30 days) */
export const RETRIEVAL_HISTORY_DAYS = 30;

/** Snapshot of a memory's state before modification */
export interface MemorySnapshot {
  content: string;
  tags: string[];
  retentionStrength: number;
  storageStrength: number;
  retrievalStrength: number;
  connectionIds: string[];
  capturedAt: Date;
}

/** Create a memory snapshot */
export function createSnapshot(
  content: string,
  tags: string[],
  retentionStrength: number,
  storageStrength: number,
  retrievalStrength: number,
  connectionIds: string[]
): MemorySnapshot {
  return {
    content,
    tags,
    retentionStrength,
    storageStrength,
    retrievalStrength,
    connectionIds,
    capturedAt: new Date(),
  };
}

/** Types of relationships between memories */
export enum RelationshipType {
  Supports = 'supports',
  Contradicts = 'contradicts',
  Elaborates = 'elaborates',
  Generalizes = 'generalizes',
  Exemplifies = 'exemplifies',
  TemporallyRelated = 'temporally_related',
  Causes = 'causes',
  SimilarTo = 'similar_to',
}

/** Types of modifications that can be applied during the labile window */
export type Modification =
  | { type: 'add_context'; context: string }
  | { type: 'strengthen_connection'; targetMemoryId: string; boost: number }
  | { type: 'add_tag'; tag: string }
  | { type: 'remove_tag'; tag: string }
  | { type: 'update_emotion'; sentimentScore?: number; sentimentMagnitude?: number }
  | { type: 'link_memory'; relatedMemoryId: string; relationship: RelationshipType }
  | { type: 'update_content'; newContent?: string; isCorrection: boolean }
  | { type: 'add_source'; source: string }
  | { type: 'boost_retrieval'; boost: number };

/** Get description for a modification */
export function getModificationDescription(mod: Modification): string {
  switch (mod.type) {
    case 'add_context':
      return `Add context: ${mod.context.slice(0, 50)}`;
    case 'strengthen_connection':
      return `Strengthen connection to ${mod.targetMemoryId} by ${mod.boost.toFixed(2)}`;
    case 'add_tag':
      return `Add tag: ${mod.tag}`;
    case 'remove_tag':
      return `Remove tag: ${mod.tag}`;
    case 'update_emotion':
      return `Update emotion: score=${mod.sentimentScore}, magnitude=${mod.sentimentMagnitude}`;
    case 'link_memory':
      return `Link to ${mod.relatedMemoryId} (${mod.relationship})`;
    case 'update_content':
      return `Update content (correction=${mod.isCorrection})`;
    case 'add_source':
      return `Add source: ${mod.source.slice(0, 50)}`;
    case 'boost_retrieval':
      return `Boost retrieval by ${mod.boost.toFixed(2)}`;
  }
}

/** What triggered memory retrieval */
export enum AccessTrigger {
  Search = 'search',
  Automatic = 'automatic',
  ConsolidationReplay = 'consolidation_replay',
  LinkedRetrieval = 'linked_retrieval',
  DirectAccess = 'direct_access',
  Review = 'review',
}

/** Context about how/why a memory was accessed */
export interface AccessContext {
  trigger: AccessTrigger;
  query?: string;
  coRetrieved: string[];
  sessionId?: string;
}

/** State of a memory that has become labile */
export interface LabileState {
  memoryId: string;
  accessedAt: Date;
  originalState: MemorySnapshot;
  modifications: Modification[];
  accessContext?: AccessContext;
  reconsolidated: boolean;
}

/** Create a new labile state */
export function createLabileState(memoryId: string, original: MemorySnapshot): LabileState {
  return {
    memoryId,
    accessedAt: new Date(),
    originalState: original,
    modifications: [],
    accessContext: undefined,
    reconsolidated: false,
  };
}

/** Check if labile state is within window */
export function isWithinWindow(state: LabileState, windowMs: number = DEFAULT_LABILE_WINDOW_MS): boolean {
  return Date.now() - state.accessedAt.getTime() < windowMs;
}

/** A modification that was successfully applied */
export interface AppliedModification {
  modification: Modification;
  appliedAt: Date;
  success: boolean;
  error?: string;
}

/** Summary of changes made during reconsolidation */
export interface ChangeSummary {
  tagsAdded: number;
  tagsRemoved: number;
  connectionsStrengthened: number;
  linksCreated: number;
  contentUpdated: boolean;
  emotionUpdated: boolean;
  retrievalBoost: number;
}

/** Check if changes were made */
export function hasChanges(summary: ChangeSummary): boolean {
  return (
    summary.tagsAdded > 0 ||
    summary.tagsRemoved > 0 ||
    summary.connectionsStrengthened > 0 ||
    summary.linksCreated > 0 ||
    summary.contentUpdated ||
    summary.emotionUpdated ||
    summary.retrievalBoost > 0
  );
}

/** Result of reconsolidating a memory */
export interface ReconsolidatedMemory {
  memoryId: string;
  reconsolidatedAt: Date;
  labileDurationMs: number;
  appliedModifications: AppliedModification[];
  wasModified: boolean;
  changeSummary: ChangeSummary;
  retrievalCount: number;
}

/** Record of a memory retrieval event */
export interface RetrievalRecord {
  memoryId: string;
  retrievedAt: Date;
  context?: AccessContext;
  wasModified: boolean;
  retrievalStrengthAtAccess: number;
}

/** Statistics about reconsolidation operations */
export interface ReconsolidationStats {
  totalMarkedLabile: number;
  totalReconsolidated: number;
  totalModified: number;
  totalModifications: number;
}

/**
 * Reconsolidation Manager
 *
 * Manages memory reconsolidation - the process where retrieved memories
 * become temporarily modifiable before being reconsolidated.
 */
export class ReconsolidationManager {
  private labileMemories: Map<string, LabileState> = new Map();
  private labileWindowMs: number;
  private retrievalHistory: RetrievalRecord[] = [];
  private stats: ReconsolidationStats = {
    totalMarkedLabile: 0,
    totalReconsolidated: 0,
    totalModified: 0,
    totalModifications: 0,
  };
  private enabled: boolean = true;

  constructor(labileWindowMs: number = DEFAULT_LABILE_WINDOW_MS) {
    this.labileWindowMs = labileWindowMs;
  }

  /**
   * Enable or disable reconsolidation
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if reconsolidation is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Mark a memory as labile (accessed)
   */
  markLabile(memoryId: string, snapshot: MemorySnapshot): void {
    if (!this.enabled) return;

    const state = createLabileState(memoryId, snapshot);
    this.labileMemories.set(memoryId, state);
    this.stats.totalMarkedLabile++;
  }

  /**
   * Mark a memory as labile with context
   */
  markLabileWithContext(memoryId: string, snapshot: MemorySnapshot, context: AccessContext): void {
    if (!this.enabled) return;

    const state = createLabileState(memoryId, snapshot);
    state.accessContext = context;
    this.labileMemories.set(memoryId, state);
    this.stats.totalMarkedLabile++;
  }

  /**
   * Check if a memory is currently labile
   */
  isLabile(memoryId: string): boolean {
    const state = this.labileMemories.get(memoryId);
    return state ? isWithinWindow(state, this.labileWindowMs) : false;
  }

  /**
   * Get the labile state for a memory
   */
  getLabileState(memoryId: string): LabileState | null {
    const state = this.labileMemories.get(memoryId);
    if (!state || !isWithinWindow(state, this.labileWindowMs)) {
      return null;
    }
    return state;
  }

  /**
   * Get remaining labile window time in milliseconds
   */
  remainingLabileTime(memoryId: string): number | null {
    const state = this.labileMemories.get(memoryId);
    if (!state) return null;

    const elapsed = Date.now() - state.accessedAt.getTime();
    if (elapsed >= this.labileWindowMs) return null;

    return this.labileWindowMs - elapsed;
  }

  /**
   * Apply a modification to a labile memory
   */
  applyModification(memoryId: string, modification: Modification): boolean {
    if (!this.enabled) return false;

    const state = this.labileMemories.get(memoryId);
    if (!state || !isWithinWindow(state, this.labileWindowMs)) {
      return false;
    }

    if (state.modifications.length >= MAX_MODIFICATIONS_PER_WINDOW) {
      return false;
    }

    state.modifications.push(modification);
    this.stats.totalModifications++;
    return true;
  }

  /**
   * Apply multiple modifications at once
   */
  applyModifications(memoryId: string, modifications: Modification[]): number {
    let applied = 0;
    for (const mod of modifications) {
      if (this.applyModification(memoryId, mod)) {
        applied++;
      }
    }
    return applied;
  }

  /**
   * Reconsolidate a memory (finalize modifications)
   */
  reconsolidate(memoryId: string): ReconsolidatedMemory | null {
    const state = this.labileMemories.get(memoryId);
    if (!state || state.reconsolidated) {
      return null;
    }

    this.labileMemories.delete(memoryId);

    const labileDurationMs = Date.now() - state.accessedAt.getTime();

    // Build change summary
    const changeSummary: ChangeSummary = {
      tagsAdded: 0,
      tagsRemoved: 0,
      connectionsStrengthened: 0,
      linksCreated: 0,
      contentUpdated: false,
      emotionUpdated: false,
      retrievalBoost: 0,
    };

    const appliedModifications: AppliedModification[] = state.modifications.map(mod => {
      // Update summary
      switch (mod.type) {
        case 'add_tag':
          changeSummary.tagsAdded++;
          break;
        case 'remove_tag':
          changeSummary.tagsRemoved++;
          break;
        case 'strengthen_connection':
          changeSummary.connectionsStrengthened++;
          break;
        case 'link_memory':
          changeSummary.linksCreated++;
          break;
        case 'update_content':
          changeSummary.contentUpdated = true;
          break;
        case 'update_emotion':
          changeSummary.emotionUpdated = true;
          break;
        case 'boost_retrieval':
          changeSummary.retrievalBoost += mod.boost;
          break;
      }

      return {
        modification: mod,
        appliedAt: new Date(),
        success: true,
        error: undefined,
      };
    });

    const wasModified = hasChanges(changeSummary);

    // Record retrieval
    this.recordRetrieval({
      memoryId,
      retrievedAt: state.accessedAt,
      context: state.accessContext,
      wasModified,
      retrievalStrengthAtAccess: state.originalState.retrievalStrength,
    });

    this.stats.totalReconsolidated++;
    if (wasModified) {
      this.stats.totalModified++;
    }

    return {
      memoryId,
      reconsolidatedAt: new Date(),
      labileDurationMs,
      appliedModifications,
      wasModified,
      changeSummary,
      retrievalCount: this.getRetrievalCount(memoryId),
    };
  }

  /**
   * Force reconsolidation of all expired labile memories
   */
  reconsolidateExpired(): ReconsolidatedMemory[] {
    const expiredIds: string[] = [];

    for (const [id, state] of this.labileMemories) {
      if (!isWithinWindow(state, this.labileWindowMs)) {
        expiredIds.push(id);
      }
    }

    return expiredIds
      .map(id => this.reconsolidate(id))
      .filter((r): r is ReconsolidatedMemory => r !== null);
  }

  /**
   * Get all currently labile memory IDs
   */
  getLabileMemoryIds(): string[] {
    const ids: string[] = [];
    for (const [id, state] of this.labileMemories) {
      if (isWithinWindow(state, this.labileWindowMs)) {
        ids.push(id);
      }
    }
    return ids;
  }

  /**
   * Record a retrieval event
   */
  private recordRetrieval(record: RetrievalRecord): void {
    this.retrievalHistory.push(record);

    // Trim old records
    const cutoff = Date.now() - RETRIEVAL_HISTORY_DAYS * 24 * 60 * 60 * 1000;
    this.retrievalHistory = this.retrievalHistory.filter(
      r => r.retrievedAt.getTime() >= cutoff
    );
  }

  /**
   * Get retrieval count for a memory
   */
  getRetrievalCount(memoryId: string): number {
    return this.retrievalHistory.filter(r => r.memoryId === memoryId).length;
  }

  /**
   * Get retrieval history for a memory
   */
  getRetrievalHistory(memoryId: string): RetrievalRecord[] {
    return this.retrievalHistory.filter(r => r.memoryId === memoryId);
  }

  /**
   * Get most recently retrieved memories
   */
  getRecentRetrievals(limit: number = 10): RetrievalRecord[] {
    return [...this.retrievalHistory]
      .sort((a, b) => b.retrievedAt.getTime() - a.retrievedAt.getTime())
      .slice(0, limit);
  }

  /**
   * Get memories frequently retrieved together
   */
  getCoRetrievedMemories(memoryId: string): Map<string, number> {
    const coRetrieved = new Map<string, number>();

    for (const record of this.retrievalHistory) {
      if (record.memoryId === memoryId && record.context?.coRetrieved) {
        for (const coId of record.context.coRetrieved) {
          if (coId !== memoryId) {
            coRetrieved.set(coId, (coRetrieved.get(coId) ?? 0) + 1);
          }
        }
      }
    }

    return coRetrieved;
  }

  /**
   * Get reconsolidation statistics
   */
  getStats(): ReconsolidationStats {
    return { ...this.stats };
  }

  /**
   * Get modification rate
   */
  getModificationRate(): number {
    if (this.stats.totalMarkedLabile === 0) return 0;
    return this.stats.totalModifications / this.stats.totalMarkedLabile;
  }

  /**
   * Get modified rate
   */
  getModifiedRate(): number {
    if (this.stats.totalReconsolidated === 0) return 0;
    return this.stats.totalModified / this.stats.totalReconsolidated;
  }

  /**
   * Get current labile window duration
   */
  getLabileWindow(): number {
    return this.labileWindowMs;
  }

  /**
   * Set labile window duration
   */
  setLabileWindow(windowMs: number): void {
    this.labileWindowMs = windowMs;
  }

  /**
   * Clear all labile states
   */
  clearLabileStates(): void {
    this.labileMemories.clear();
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.labileMemories.clear();
    this.retrievalHistory = [];
    this.stats = {
      totalMarkedLabile: 0,
      totalReconsolidated: 0,
      totalModified: 0,
      totalModifications: 0,
    };
  }
}
