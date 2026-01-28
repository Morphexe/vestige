/**
 * Memory States Module
 *
 * Implements cognitive science memory accessibility model:
 * - Active: Recently accessed, immediately retrievable
 * - Dormant: Accessible but requires some cue
 * - Silent: Difficult to access, needs strong cue
 * - Unavailable: Suppressed or inaccessible (retrieval-induced forgetting)
 *
 * Based on:
 * - Anderson et al. (1994) - Retrieval-induced forgetting
 * - Bjork & Bjork (1992) - New theory of disuse
 */

/** Memory accessibility states */
export enum MemoryState {
  /** Recently accessed, immediately retrievable */
  Active = 'active',
  /** Accessible but needs cue to retrieve */
  Dormant = 'dormant',
  /** Difficult to access, needs strong cue */
  Silent = 'silent',
  /** Suppressed or blocked (retrieval-induced forgetting) */
  Unavailable = 'unavailable',
}

/** Accessibility multipliers for each state */
export const STATE_ACCESSIBILITY: Record<MemoryState, number> = {
  [MemoryState.Active]: 1.0,
  [MemoryState.Dormant]: 0.7,
  [MemoryState.Silent]: 0.3,
  [MemoryState.Unavailable]: 0.05,
};

/** Default decay times */
export const DEFAULT_ACTIVE_DECAY_HOURS = 4;
export const DEFAULT_DORMANT_DECAY_DAYS = 30;
export const DEFAULT_SUPPRESSION_HOURS = 24;
export const COMPETITION_SIMILARITY_THRESHOLD = 0.6;
export const SUPPRESSION_STRENGTH_FACTOR = 0.15;
export const MAX_STATE_HISTORY_SIZE = 50;
export const STRONG_CUE_THRESHOLD = 0.8;

/** Reasons for state transitions */
export enum TransitionReason {
  Access = 'access',
  TimeDecay = 'time_decay',
  CueReactivation = 'cue_reactivation',
  CompetitionLoss = 'competition_loss',
  InterferenceResolved = 'interference_resolved',
  UserSuppression = 'user_suppression',
  SuppressionExpired = 'suppression_expired',
  ManualOverride = 'manual_override',
  SystemInit = 'system_init',
}

/** State transition record */
export interface StateTransition {
  fromState: MemoryState;
  toState: MemoryState;
  reason: TransitionReason;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/** Time accumulator for analytics */
export interface StateTimeAccumulator {
  activeMs: number;
  dormantMs: number;
  silentMs: number;
  unavailableMs: number;
}

/** Memory lifecycle tracking */
export interface MemoryLifecycle {
  memoryId: string;
  state: MemoryState;
  lastAccess: Date;
  accessCount: number;
  stateHistory: StateTransition[];
  suppressionUntil: Date | null;
  timeInStates: StateTimeAccumulator;
  createdAt: Date;
  lastStateChange: Date;
}

/** Competition result */
export interface CompetitionResult {
  winnerId: string;
  loserIds: string[];
  similarity: number;
  timestamp: Date;
}

/** Memory candidate for competition */
export interface MemoryCandidate {
  id: string;
  similarity: number;
  strength: number;
  lifecycle: MemoryLifecycle;
}

/**
 * Get accessibility multiplier for a state
 */
export function getAccessibilityMultiplier(state: MemoryState): number {
  return STATE_ACCESSIBILITY[state];
}

/**
 * Check if memory is retrievable (accessibility > 0.1)
 */
export function isRetrievable(state: MemoryState): boolean {
  return STATE_ACCESSIBILITY[state] >= 0.1;
}

/**
 * Check if memory requires a strong cue for retrieval
 */
export function requiresStrongCue(state: MemoryState): boolean {
  return state === MemoryState.Silent || state === MemoryState.Unavailable;
}

/**
 * Check if memory is blocked (suppressed)
 */
export function isBlocked(lifecycle: MemoryLifecycle): boolean {
  if (!lifecycle.suppressionUntil) return false;
  return lifecycle.suppressionUntil.getTime() > Date.now();
}

/**
 * Create a new memory lifecycle
 */
export function createLifecycle(memoryId: string): MemoryLifecycle {
  const now = new Date();
  return {
    memoryId,
    state: MemoryState.Active,
    lastAccess: now,
    accessCount: 1,
    stateHistory: [{
      fromState: MemoryState.Active,
      toState: MemoryState.Active,
      reason: TransitionReason.SystemInit,
      timestamp: now,
    }],
    suppressionUntil: null,
    timeInStates: {
      activeMs: 0,
      dormantMs: 0,
      silentMs: 0,
      unavailableMs: 0,
    },
    createdAt: now,
    lastStateChange: now,
  };
}

/**
 * Record an access to a memory (reactivates to Active state)
 */
export function recordAccess(lifecycle: MemoryLifecycle): MemoryLifecycle {
  const now = new Date();
  const previousState = lifecycle.state;

  // Update time in previous state
  const timeInPreviousState = now.getTime() - lifecycle.lastStateChange.getTime();
  const updatedTimeInStates = { ...lifecycle.timeInStates };
  switch (previousState) {
    case MemoryState.Active:
      updatedTimeInStates.activeMs += timeInPreviousState;
      break;
    case MemoryState.Dormant:
      updatedTimeInStates.dormantMs += timeInPreviousState;
      break;
    case MemoryState.Silent:
      updatedTimeInStates.silentMs += timeInPreviousState;
      break;
    case MemoryState.Unavailable:
      updatedTimeInStates.unavailableMs += timeInPreviousState;
      break;
  }

  // Add transition if state changed
  const newHistory = [...lifecycle.stateHistory];
  if (previousState !== MemoryState.Active) {
    newHistory.push({
      fromState: previousState,
      toState: MemoryState.Active,
      reason: TransitionReason.Access,
      timestamp: now,
    });

    // Trim history if too long
    while (newHistory.length > MAX_STATE_HISTORY_SIZE) {
      newHistory.shift();
    }
  }

  return {
    ...lifecycle,
    state: MemoryState.Active,
    lastAccess: now,
    accessCount: lifecycle.accessCount + 1,
    stateHistory: newHistory,
    suppressionUntil: null, // Clear suppression on access
    timeInStates: updatedTimeInStates,
    lastStateChange: previousState !== MemoryState.Active ? now : lifecycle.lastStateChange,
  };
}

/**
 * Transition memory to a new state
 */
export function transitionTo(
  lifecycle: MemoryLifecycle,
  newState: MemoryState,
  reason: TransitionReason,
  metadata?: Record<string, unknown>
): MemoryLifecycle {
  if (lifecycle.state === newState) {
    return lifecycle;
  }

  const now = new Date();

  // Update time in previous state
  const timeInPreviousState = now.getTime() - lifecycle.lastStateChange.getTime();
  const updatedTimeInStates = { ...lifecycle.timeInStates };
  switch (lifecycle.state) {
    case MemoryState.Active:
      updatedTimeInStates.activeMs += timeInPreviousState;
      break;
    case MemoryState.Dormant:
      updatedTimeInStates.dormantMs += timeInPreviousState;
      break;
    case MemoryState.Silent:
      updatedTimeInStates.silentMs += timeInPreviousState;
      break;
    case MemoryState.Unavailable:
      updatedTimeInStates.unavailableMs += timeInPreviousState;
      break;
  }

  const newHistory = [
    ...lifecycle.stateHistory,
    {
      fromState: lifecycle.state,
      toState: newState,
      reason,
      timestamp: now,
      metadata,
    },
  ];

  // Trim history
  while (newHistory.length > MAX_STATE_HISTORY_SIZE) {
    newHistory.shift();
  }

  return {
    ...lifecycle,
    state: newState,
    stateHistory: newHistory,
    timeInStates: updatedTimeInStates,
    lastStateChange: now,
  };
}

/**
 * Suppress memory from competition (retrieval-induced forgetting)
 */
export function suppressFromCompetition(
  lifecycle: MemoryLifecycle,
  suppressionHours: number = DEFAULT_SUPPRESSION_HOURS
): MemoryLifecycle {
  const suppressionUntil = new Date(Date.now() + suppressionHours * 60 * 60 * 1000);

  return {
    ...transitionTo(lifecycle, MemoryState.Unavailable, TransitionReason.CompetitionLoss),
    suppressionUntil,
  };
}

/**
 * Try to reactivate a silent memory with a strong cue
 */
export function tryReactivateWithCue(
  lifecycle: MemoryLifecycle,
  cueStrength: number
): MemoryLifecycle | null {
  // Only silent memories can be reactivated with cue
  if (lifecycle.state !== MemoryState.Silent) {
    return null;
  }

  // Need strong enough cue
  if (cueStrength < STRONG_CUE_THRESHOLD) {
    return null;
  }

  return transitionTo(
    lifecycle,
    MemoryState.Dormant,
    TransitionReason.CueReactivation,
    { cueStrength }
  );
}

/**
 * Apply time-based state decay
 */
export function applyTimeDecay(
  lifecycle: MemoryLifecycle,
  activeDecayHours: number = DEFAULT_ACTIVE_DECAY_HOURS,
  dormantDecayDays: number = DEFAULT_DORMANT_DECAY_DAYS
): MemoryLifecycle {
  const now = Date.now();
  const hoursSinceAccess = (now - lifecycle.lastAccess.getTime()) / (1000 * 60 * 60);
  const daysSinceAccess = hoursSinceAccess / 24;

  // Check if suppression has expired
  if (lifecycle.suppressionUntil && lifecycle.suppressionUntil.getTime() <= now) {
    return transitionTo(
      { ...lifecycle, suppressionUntil: null },
      MemoryState.Silent,
      TransitionReason.SuppressionExpired
    );
  }

  // Don't decay suppressed memories
  if (isBlocked(lifecycle)) {
    return lifecycle;
  }

  switch (lifecycle.state) {
    case MemoryState.Active:
      if (hoursSinceAccess >= activeDecayHours) {
        return transitionTo(lifecycle, MemoryState.Dormant, TransitionReason.TimeDecay);
      }
      break;

    case MemoryState.Dormant:
      if (daysSinceAccess >= dormantDecayDays) {
        return transitionTo(lifecycle, MemoryState.Silent, TransitionReason.TimeDecay);
      }
      break;

    // Silent memories don't decay further through time
    case MemoryState.Silent:
    case MemoryState.Unavailable:
      break;
  }

  return lifecycle;
}

/**
 * Calculate memory accessibility score
 *
 * Combines:
 * - State multiplier (base accessibility)
 * - Recency boost (recent access bonus)
 * - Frequency boost (access count bonus)
 */
export function calculateAccessibility(
  lifecycle: MemoryLifecycle,
  recencyDecayHours: number = 24,
  frequencyWeight: number = 0.1
): number {
  const stateMultiplier = getAccessibilityMultiplier(lifecycle.state);

  // Recency boost: exponential decay from last access
  const hoursSinceAccess = (Date.now() - lifecycle.lastAccess.getTime()) / (1000 * 60 * 60);
  const recencyBoost = Math.exp(-hoursSinceAccess / recencyDecayHours);

  // Frequency boost: logarithmic based on access count
  const frequencyBoost = Math.log10(lifecycle.accessCount + 1) * frequencyWeight;

  // Combine factors
  const rawScore = stateMultiplier * (0.6 + 0.3 * recencyBoost + 0.1 * Math.min(frequencyBoost, 0.3));

  return Math.max(0, Math.min(1, rawScore));
}

/**
 * Competition Manager for Retrieval-Induced Forgetting
 */
export class CompetitionManager {
  private competitionHistory: CompetitionResult[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 100) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Run competition among similar memories
   *
   * The winner (highest strength * similarity) is strengthened,
   * losers are suppressed for a period.
   */
  runCompetition(
    targetMemoryId: string,
    candidates: MemoryCandidate[],
    suppressionHours: number = DEFAULT_SUPPRESSION_HOURS
  ): { winner: MemoryLifecycle; losers: MemoryLifecycle[] } | null {
    // Filter to similar enough candidates
    const competitors = candidates.filter(c =>
      c.similarity >= COMPETITION_SIMILARITY_THRESHOLD && c.id !== targetMemoryId
    );

    if (competitors.length === 0) {
      return null;
    }

    // Find target candidate
    const target = candidates.find(c => c.id === targetMemoryId);
    if (!target) {
      return null;
    }

    // All competitors including target
    const allCompetitors = [target, ...competitors];

    // Calculate competition scores
    const scored = allCompetitors.map(c => ({
      candidate: c,
      score: c.strength * c.similarity,
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const winner = scored[0]!.candidate;
    const losers = scored.slice(1).map(s => s.candidate);

    // Record competition
    this.competitionHistory.push({
      winnerId: winner.id,
      loserIds: losers.map(l => l.id),
      similarity: Math.max(...competitors.map(c => c.similarity)),
      timestamp: new Date(),
    });

    // Trim history
    while (this.competitionHistory.length > this.maxHistorySize) {
      this.competitionHistory.shift();
    }

    // Strengthen winner (reactivate)
    const winnerLifecycle = recordAccess(winner.lifecycle);

    // Suppress losers
    const loserLifecycles = losers.map(l =>
      suppressFromCompetition(l.lifecycle, suppressionHours)
    );

    return {
      winner: winnerLifecycle,
      losers: loserLifecycles,
    };
  }

  /**
   * Get competition history
   */
  getHistory(): CompetitionResult[] {
    return [...this.competitionHistory];
  }

  /**
   * Check if a memory recently lost a competition
   */
  recentlyLost(memoryId: string, withinHours: number = 24): boolean {
    const cutoff = Date.now() - withinHours * 60 * 60 * 1000;
    return this.competitionHistory.some(
      c => c.loserIds.includes(memoryId) && c.timestamp.getTime() > cutoff
    );
  }

  /**
   * Clear competition history
   */
  clearHistory(): void {
    this.competitionHistory = [];
  }
}

/**
 * Batch update memory lifecycles
 */
export function batchUpdateLifecycles(
  lifecycles: MemoryLifecycle[],
  activeDecayHours?: number,
  dormantDecayDays?: number
): MemoryLifecycle[] {
  return lifecycles.map(l => applyTimeDecay(l, activeDecayHours, dormantDecayDays));
}

/**
 * Get state statistics from a lifecycle
 */
export function getStateStats(lifecycle: MemoryLifecycle): {
  currentState: MemoryState;
  accessibility: number;
  totalTimeActive: number;
  totalTimeDormant: number;
  totalTimeSilent: number;
  totalTimeUnavailable: number;
  transitionCount: number;
  isBlocked: boolean;
} {
  return {
    currentState: lifecycle.state,
    accessibility: calculateAccessibility(lifecycle),
    totalTimeActive: lifecycle.timeInStates.activeMs / 1000 / 60 / 60, // hours
    totalTimeDormant: lifecycle.timeInStates.dormantMs / 1000 / 60 / 60,
    totalTimeSilent: lifecycle.timeInStates.silentMs / 1000 / 60 / 60,
    totalTimeUnavailable: lifecycle.timeInStates.unavailableMs / 1000 / 60 / 60,
    transitionCount: lifecycle.stateHistory.length,
    isBlocked: isBlocked(lifecycle),
  };
}
