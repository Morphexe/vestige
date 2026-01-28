/**
 * FSRS-6 (Free Spaced Repetition Scheduler) Algorithm Implementation
 *
 * Based on the FSRS-6 algorithm - 20-30% more efficient than SM-2
 * Paper: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 *
 * FSRS-6 improvements over FSRS-5:
 * - New w17, w18, w19 weights for same-day review handling
 * - New w20 for personalizable forgetting curve decay
 * - Updated mean reversion formula with (10-D)/9 scaling
 * - Post-lapse stability cannot exceed pre-lapse stability
 *
 * This is a production-ready implementation with full TypeScript types,
 * sentiment integration for emotional memory boosting, and comprehensive
 * error handling.
 */

import { z } from 'zod';

// ============================================================================
// FSRS-6 CONSTANTS (21 Parameters)
// ============================================================================

/**
 * FSRS-6 default weights (w0 to w20)
 *
 * These weights are optimized from millions of Anki review records.
 * They control:
 * - w0-w3: Initial stability for each grade (Again, Hard, Good, Easy)
 * - w4-w5: Initial difficulty calculation
 * - w6-w7: Difficulty update parameters (w7 = mean reversion weight)
 * - w8-w10: Stability increase factors after successful recall
 * - w11-w14: Forgetting (lapse) stability calculation
 * - w15-w16: Hard penalty and Easy bonus
 * - w17-w19: Same-day review handling (NEW in FSRS-6)
 * - w20: Forgetting curve decay (NEW in FSRS-6 - PERSONALIZABLE)
 */
export const FSRS_WEIGHTS: readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number
] = [
  0.212,   // w0: Initial stability for Again
  1.2931,  // w1: Initial stability for Hard
  2.3065,  // w2: Initial stability for Good
  8.2956,  // w3: Initial stability for Easy
  6.4133,  // w4: Initial difficulty base
  0.8334,  // w5: Initial difficulty grade modifier
  3.0194,  // w6: Difficulty delta
  0.001,   // w7: Difficulty mean reversion weight
  1.8722,  // w8: Stability increase base
  0.1666,  // w9: Stability saturation
  0.796,   // w10: Retrievability influence on stability
  1.4835,  // w11: Forget stability base
  0.0614,  // w12: Forget difficulty influence
  0.2629,  // w13: Forget stability influence
  1.6483,  // w14: Forget retrievability influence
  0.6014,  // w15: Hard penalty
  1.8729,  // w16: Easy bonus
  0.5425,  // w17: Same-day review base (NEW in FSRS-6)
  0.0912,  // w18: Same-day review grade modifier (NEW in FSRS-6)
  0.0658,  // w19: Same-day review stability influence (NEW in FSRS-6)
  0.1542,  // w20: Forgetting curve decay (NEW in FSRS-6 - PERSONALIZABLE)
] as const;

/**
 * FSRS algorithm constants
 */
export const FSRS_CONSTANTS = {
  /** Maximum difficulty value */
  MAX_DIFFICULTY: 10,
  /** Minimum difficulty value */
  MIN_DIFFICULTY: 1,
  /** Minimum stability in days */
  MIN_STABILITY: 0.1,
  /** Maximum stability in days (approx 100 years) */
  MAX_STABILITY: 36500,
  /** Default desired retention rate */
  DEFAULT_RETENTION: 0.9,
  /** Default forgetting curve decay (w20) */
  DEFAULT_DECAY: 0.1542,
  /** Small epsilon for numerical stability */
  EPSILON: 1e-10,
} as const;

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

/**
 * Review grades in FSRS
 * - Again (1): Complete failure to recall
 * - Hard (2): Recalled with significant difficulty
 * - Good (3): Recalled with moderate effort
 * - Easy (4): Recalled effortlessly
 */
export const ReviewGradeSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);
export type ReviewGrade = z.infer<typeof ReviewGradeSchema>;

/**
 * Named constants for review grades
 */
export const Grade = {
  Again: 1,
  Hard: 2,
  Good: 3,
  Easy: 4,
} as const satisfies Record<string, ReviewGrade>;

/**
 * Learning states for FSRS cards
 * - New: Never reviewed
 * - Learning: In initial learning phase
 * - Review: In long-term review phase
 * - Relearning: Lapsed and relearning
 */
export const LearningStateSchema = z.enum([
  'New',
  'Learning',
  'Review',
  'Relearning',
]);
export type LearningState = z.infer<typeof LearningStateSchema>;

/**
 * FSRS card state - represents the memory state of a single item
 */
export const FSRSStateSchema = z.object({
  /** Current difficulty (1-10, higher = harder) */
  difficulty: z.number().min(FSRS_CONSTANTS.MIN_DIFFICULTY).max(FSRS_CONSTANTS.MAX_DIFFICULTY),
  /** Current stability in days (higher = more stable memory) */
  stability: z.number().min(FSRS_CONSTANTS.MIN_STABILITY).max(FSRS_CONSTANTS.MAX_STABILITY),
  /** Current learning state */
  state: LearningStateSchema,
  /** Number of times reviewed */
  reps: z.number().int().min(0),
  /** Number of lapses (times "Again" was pressed in Review state) */
  lapses: z.number().int().min(0),
  /** Timestamp of last review */
  lastReview: z.date(),
  /** Scheduled next review date */
  scheduledDays: z.number().min(0),
});
export type FSRSState = z.infer<typeof FSRSStateSchema>;

/**
 * Input type for FSRSState (for creating new states)
 */
export type FSRSStateInput = z.input<typeof FSRSStateSchema>;

/**
 * Result of a review operation
 */
export const ReviewResultSchema = z.object({
  /** Updated FSRS state */
  state: FSRSStateSchema,
  /** Calculated retrievability at time of review */
  retrievability: z.number().min(0).max(1),
  /** Next review interval in days */
  interval: z.number().min(0),
  /** Whether this was a lapse */
  isLapse: z.boolean(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

/**
 * Type for the 21-element FSRS-6 weights tuple
 */
export type FSRSWeightsTuple = readonly [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number
];

/**
 * Zod schema for FSRS-6 weights
 */
const FSRSWeightsSchema = z.array(z.number()).length(21);

/**
 * Configuration for FSRS scheduler
 */
export const FSRSConfigSchema = z.object({
  /** Desired retention rate (0.7-0.99) */
  desiredRetention: z.number().min(0.7).max(0.99).default(0.9),
  /** Maximum interval in days */
  maximumInterval: z.number().min(1).max(36500).default(36500),
  /** Custom weights (must be exactly 21 values for FSRS-6) */
  weights: FSRSWeightsSchema.optional(),
  /** Enable sentiment boost for emotional memories */
  enableSentimentBoost: z.boolean().default(true),
  /** Maximum sentiment boost multiplier (1.0-3.0) */
  maxSentimentBoost: z.number().min(1).max(3).default(2),
  /** Enable interval fuzzing to prevent clustering */
  enableFuzz: z.boolean().default(false),
});

/**
 * Configuration type for FSRS scheduler
 */
export interface FSRSConfig {
  /** Desired retention rate (0.7-0.99) */
  desiredRetention?: number;
  /** Maximum interval in days */
  maximumInterval?: number;
  /** Custom weights (must be exactly 21 values for FSRS-6) */
  weights?: readonly number[];
  /** Enable sentiment boost for emotional memories */
  enableSentimentBoost?: boolean;
  /** Maximum sentiment boost multiplier (1.0-3.0) */
  maxSentimentBoost?: number;
  /** Enable interval fuzzing to prevent clustering */
  enableFuzz?: boolean;
}

/**
 * Resolved (required) configuration type
 */
export interface ResolvedFSRSConfig {
  desiredRetention: number;
  maximumInterval: number;
  weights: readonly number[] | undefined;
  enableSentimentBoost: boolean;
  maxSentimentBoost: number;
  enableFuzz: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate forgetting curve factor based on w20
 * FSRS-6: factor = 0.9^(-1/w20) - 1
 */
export function forgettingFactor(w20: number): number {
  return Math.pow(0.9, -1 / w20) - 1;
}

// ============================================================================
// CORE FSRS-6 FUNCTIONS
// ============================================================================

/**
 * Calculate initial difficulty for a new card based on first rating
 *
 * Formula: D0(G) = w4 - e^(w5*(G-1)) + 1
 *
 * @param grade - First review grade (1-4)
 * @param weights - FSRS weights array
 * @returns Initial difficulty (1-10)
 */
export function initialDifficulty(
  grade: ReviewGrade,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  const w4 = weights[4] ?? FSRS_WEIGHTS[4];
  const w5 = weights[5] ?? FSRS_WEIGHTS[5];

  // D0(G) = w4 - e^(w5*(G-1)) + 1
  const d = w4 - Math.exp(w5 * (grade - 1)) + 1;

  // Clamp to valid range
  return clamp(d, FSRS_CONSTANTS.MIN_DIFFICULTY, FSRS_CONSTANTS.MAX_DIFFICULTY);
}

/**
 * Calculate initial stability for a new card based on first rating
 *
 * Formula: S0(G) = w[G-1] (direct lookup from weights 0-3)
 *
 * Note: FSRS-6 uses the first 4 weights as initial stability values
 * for grades 1-4 respectively.
 *
 * @param grade - First review grade (1-4)
 * @param weights - FSRS weights array
 * @returns Initial stability in days
 */
export function initialStability(
  grade: ReviewGrade,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  // FSRS-6: S0(G) = w[G-1]
  const index = grade - 1;
  const s = weights[index] ?? FSRS_WEIGHTS[index] ?? FSRS_WEIGHTS[0];

  // Ensure minimum stability
  return Math.max(FSRS_CONSTANTS.MIN_STABILITY, s);
}

/**
 * Calculate retrievability (probability of recall) based on stability and elapsed time
 *
 * FSRS-6 formula: R = (1 + factor * t / S)^(-w20)
 * where factor = 0.9^(-1/w20) - 1
 *
 * This is the power forgetting curve - more accurate than exponential
 * for modeling human memory.
 *
 * @param stability - Current stability in days
 * @param elapsedDays - Days since last review
 * @returns Retrievability (0-1)
 */
export function retrievability(stability: number, elapsedDays: number): number {
  return retrievabilityWithDecay(stability, elapsedDays, FSRS_CONSTANTS.DEFAULT_DECAY);
}

/**
 * Calculate retrievability with custom decay parameter (for personalization)
 *
 * FSRS-6 formula: R = (1 + factor * t / S)^(-w20)
 *
 * @param stability - Current stability in days
 * @param elapsedDays - Days since last review
 * @param w20 - Forgetting curve decay parameter
 * @returns Retrievability (0-1)
 */
export function retrievabilityWithDecay(
  stability: number,
  elapsedDays: number,
  w20: number
): number {
  if (stability <= 0) {
    return 0;
  }

  if (elapsedDays <= 0) {
    return 1;
  }

  const factor = forgettingFactor(w20);
  const r = Math.pow(1 + (factor * elapsedDays) / stability, -w20);

  return clamp(r, 0, 1);
}

/**
 * Calculate next difficulty after a review
 *
 * FSRS-6 formula with mean reversion:
 * D' = w7 * D0(4) + (1 - w7) * (D + delta * ((10 - D) / 9))
 * where delta = -w6 * (G - 3)
 *
 * The ((10 - D) / 9) term provides mean reversion scaling:
 * - High difficulty (D=10): scaling = 0, so difficulty stays high
 * - Low difficulty (D=1): scaling = 1, full delta applied
 *
 * @param currentD - Current difficulty (1-10)
 * @param grade - Review grade (1-4)
 * @param weights - FSRS weights array
 * @returns New difficulty (1-10)
 */
export function nextDifficulty(
  currentD: number,
  grade: ReviewGrade,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  const w6 = weights[6] ?? FSRS_WEIGHTS[6];
  const w7 = weights[7] ?? FSRS_WEIGHTS[7];

  // FSRS-6 spec: Mean reversion target is D0(4) = initial difficulty for Easy
  const d0 = initialDifficulty(Grade.Easy, weights);

  // Delta based on grade deviation from "Good" (3)
  // Negative grade (Again=1, Hard=2) increases difficulty
  // Positive grade (Easy=4) decreases difficulty
  const delta = -w6 * (grade - 3);

  // FSRS-6: Apply mean reversion scaling ((10 - D) / 9)
  const meanReversionScale = (10 - currentD) / 9;
  const newD = currentD + delta * meanReversionScale;

  // Convex combination with initial difficulty for stability
  const finalD = w7 * d0 + (1 - w7) * newD;

  return clamp(finalD, FSRS_CONSTANTS.MIN_DIFFICULTY, FSRS_CONSTANTS.MAX_DIFFICULTY);
}

/**
 * Calculate next stability after a successful recall
 *
 * FSRS-6 recall stability formula:
 * S' = S * (e^w8 * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1) * HP * EB + 1)
 *
 * This is the full FSRS-6 stability increase formula that accounts for:
 * - Current stability (S)
 * - Difficulty (D)
 * - Retrievability at time of review (R)
 * - Hard penalty (HP) for grade 2
 * - Easy bonus (EB) for grade 4
 *
 * @param currentS - Current stability in days
 * @param difficulty - Current difficulty (1-10)
 * @param retrievabilityR - Retrievability at time of review (0-1)
 * @param grade - Review grade (2, 3, or 4 - not 1, which is a lapse)
 * @param weights - FSRS weights array
 * @returns New stability in days
 */
export function nextRecallStability(
  currentS: number,
  difficulty: number,
  retrievabilityR: number,
  grade: ReviewGrade,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  if (grade === Grade.Again) {
    // Lapse - use forget stability instead
    return nextForgetStability(difficulty, currentS, retrievabilityR, weights);
  }

  const w8 = weights[8] ?? FSRS_WEIGHTS[8];
  const w9 = weights[9] ?? FSRS_WEIGHTS[9];
  const w10 = weights[10] ?? FSRS_WEIGHTS[10];
  const w15 = weights[15] ?? FSRS_WEIGHTS[15];
  const w16 = weights[16] ?? FSRS_WEIGHTS[16];

  // Hard penalty (grade = 2)
  const hardPenalty = grade === Grade.Hard ? w15 : 1;

  // Easy bonus (grade = 4)
  const easyBonus = grade === Grade.Easy ? w16 : 1;

  // FSRS-6 recall stability formula
  // S' = S * (e^w8 * (11-D) * S^(-w9) * (e^(w10*(1-R)) - 1) * HP * EB + 1)
  const factor =
    Math.exp(w8) *
    (11 - difficulty) *
    Math.pow(currentS, -w9) *
    (Math.exp(w10 * (1 - retrievabilityR)) - 1) *
    hardPenalty *
    easyBonus +
    1;

  const newS = currentS * factor;

  return clamp(newS, FSRS_CONSTANTS.MIN_STABILITY, FSRS_CONSTANTS.MAX_STABILITY);
}

/**
 * Calculate stability after a lapse (forgotten/Again rating)
 *
 * FSRS-6 forget stability formula:
 * S'f = w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R))
 *
 * IMPORTANT: FSRS-6 spec says post-lapse stability cannot exceed pre-lapse stability
 *
 * @param difficulty - Current difficulty (1-10)
 * @param currentS - Current stability before lapse
 * @param retrievabilityR - Retrievability at time of review
 * @param weights - FSRS weights array
 * @returns New stability after lapse in days
 */
export function nextForgetStability(
  difficulty: number,
  currentS: number,
  retrievabilityR: number = 0.5,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  const w11 = weights[11] ?? FSRS_WEIGHTS[11];
  const w12 = weights[12] ?? FSRS_WEIGHTS[12];
  const w13 = weights[13] ?? FSRS_WEIGHTS[13];
  const w14 = weights[14] ?? FSRS_WEIGHTS[14];

  // S'f = w11 * D^(-w12) * ((S+1)^w13 - 1) * e^(w14*(1-R))
  let newS =
    w11 *
    Math.pow(difficulty, -w12) *
    (Math.pow(currentS + 1, w13) - 1) *
    Math.exp(w14 * (1 - retrievabilityR));

  // FSRS-6 spec: Post-lapse stability cannot exceed pre-lapse stability
  newS = Math.min(newS, currentS);

  return clamp(newS, FSRS_CONSTANTS.MIN_STABILITY, FSRS_CONSTANTS.MAX_STABILITY);
}

/**
 * Calculate stability for same-day reviews (NEW in FSRS-6)
 *
 * Formula: S'(S,G) = S * e^(w17 * (G - 3 + w18)) * S^(-w19)
 *
 * This handles the case where a card is reviewed multiple times in the same day,
 * which was not well-modeled in FSRS-5.
 *
 * @param currentS - Current stability in days
 * @param grade - Review grade (1-4)
 * @param weights - FSRS weights array
 * @returns New stability for same-day review
 */
export function sameDayStability(
  currentS: number,
  grade: ReviewGrade,
  weights: readonly number[] = FSRS_WEIGHTS
): number {
  const w17 = weights[17] ?? FSRS_WEIGHTS[17];
  const w18 = weights[18] ?? FSRS_WEIGHTS[18];
  const w19 = weights[19] ?? FSRS_WEIGHTS[19];

  const g = grade as number;
  const newS = currentS * Math.exp(w17 * (g - 3 + w18)) * Math.pow(currentS, -w19);

  return clamp(newS, FSRS_CONSTANTS.MIN_STABILITY, FSRS_CONSTANTS.MAX_STABILITY);
}

/**
 * Calculate next review interval based on stability and desired retention
 *
 * FSRS-6 formula (inverse of retrievability):
 * t = S / factor * (R^(-1/w20) - 1)
 *
 * @param stability - Current stability in days
 * @param desiredRetention - Target retention rate (default 0.9)
 * @param w20 - Forgetting curve decay (default 0.1542)
 * @returns Interval in days until next review
 */
export function nextInterval(
  stability: number,
  desiredRetention: number = FSRS_CONSTANTS.DEFAULT_RETENTION,
  w20: number = FSRS_CONSTANTS.DEFAULT_DECAY
): number {
  if (stability <= 0) {
    return 0;
  }

  if (desiredRetention >= 1) {
    return 0; // If we want 100% retention, review immediately
  }

  if (desiredRetention <= 0) {
    return FSRS_CONSTANTS.MAX_STABILITY; // If we don't care about retention
  }

  const factor = forgettingFactor(w20);
  const interval = (stability / factor) * (Math.pow(desiredRetention, -1 / w20) - 1);

  return Math.max(0, Math.round(interval));
}

/**
 * Apply interval fuzzing to prevent review clustering
 *
 * Uses deterministic fuzzing based on a seed to ensure reproducibility.
 *
 * @param interval - Base interval in days
 * @param seed - Seed for deterministic fuzzing
 * @returns Fuzzed interval
 */
export function fuzzInterval(interval: number, seed: number): number {
  if (interval <= 2) {
    return interval;
  }

  // Use simple LCG for deterministic fuzzing
  const fuzzRange = Math.max(1, Math.floor(interval * 0.05));
  const random = ((seed * 1103515245 + 12345) >>> 0) % 32768;
  const offset = (random % (2 * fuzzRange + 1)) - fuzzRange;

  return Math.max(1, interval + offset);
}

/**
 * Apply sentiment boost to stability
 *
 * Emotional memories are encoded more strongly and decay more slowly.
 * This function applies a multiplier to stability based on sentiment intensity.
 *
 * @param stability - Base stability in days
 * @param sentimentIntensity - Sentiment intensity (0-1, where 1 = highly emotional)
 * @param maxBoost - Maximum boost multiplier (default 2.0)
 * @returns Boosted stability in days
 */
export function applySentimentBoost(
  stability: number,
  sentimentIntensity: number,
  maxBoost: number = 2.0
): number {
  // Validate inputs
  const clampedSentiment = clamp(sentimentIntensity, 0, 1);
  const clampedMaxBoost = clamp(maxBoost, 1, 3);

  // Linear interpolation: boost = 1 + (maxBoost - 1) * sentimentIntensity
  const boost = 1 + (clampedMaxBoost - 1) * clampedSentiment;

  return stability * boost;
}

// ============================================================================
// FSRS SCHEDULER CLASS
// ============================================================================

/**
 * FSRSScheduler - Main class for FSRS-6 spaced repetition scheduling
 *
 * Usage:
 * ```typescript
 * const scheduler = new FSRSScheduler();
 *
 * // Create initial state for a new card
 * const state = scheduler.newCard();
 *
 * // Process a review
 * const result = scheduler.review(state, Grade.Good, 1);
 *
 * // Get the next review date
 * const nextReview = new Date();
 * nextReview.setDate(nextReview.getDate() + result.interval);
 * ```
 */
export class FSRSScheduler {
  private readonly config: ResolvedFSRSConfig;
  private readonly weights: readonly number[];

  /**
   * Create a new FSRS scheduler
   *
   * @param config - Optional configuration overrides
   */
  constructor(config: FSRSConfig = {}) {
    const parsed = FSRSConfigSchema.parse({
      desiredRetention: config.desiredRetention ?? 0.9,
      maximumInterval: config.maximumInterval ?? 36500,
      weights: config.weights ? [...config.weights] : undefined,
      enableSentimentBoost: config.enableSentimentBoost ?? true,
      maxSentimentBoost: config.maxSentimentBoost ?? 2,
      enableFuzz: config.enableFuzz ?? false,
    });

    // Extract weights as a readonly number array (or undefined)
    const parsedWeights: readonly number[] | undefined = parsed.weights
      ? [...parsed.weights]
      : undefined;

    this.config = {
      desiredRetention: parsed.desiredRetention ?? 0.9,
      maximumInterval: parsed.maximumInterval ?? 36500,
      weights: parsedWeights,
      enableSentimentBoost: parsed.enableSentimentBoost ?? true,
      maxSentimentBoost: parsed.maxSentimentBoost ?? 2,
      enableFuzz: parsed.enableFuzz ?? false,
    };

    this.weights = this.config.weights ?? FSRS_WEIGHTS;
  }

  /**
   * Create initial state for a new card
   *
   * @returns Initial FSRS state
   */
  newCard(): FSRSState {
    return {
      difficulty: initialDifficulty(Grade.Good, this.weights),
      stability: initialStability(Grade.Good, this.weights),
      state: 'New',
      reps: 0,
      lapses: 0,
      lastReview: new Date(),
      scheduledDays: 0,
    };
  }

  /**
   * Process a review and calculate next state
   *
   * @param currentState - Current FSRS state
   * @param grade - Review grade (1-4)
   * @param elapsedDays - Days since last review (0 for first review)
   * @param sentimentBoost - Optional sentiment intensity for emotional memories (0-1)
   * @returns Review result with updated state and next interval
   */
  review(
    currentState: FSRSState,
    grade: ReviewGrade,
    elapsedDays: number = 0,
    sentimentBoost?: number
  ): ReviewResult {
    // Validate grade
    const validatedGrade = ReviewGradeSchema.parse(grade);

    // Determine if this is a same-day review
    const isSameDay = elapsedDays < 1;

    // Calculate retrievability at time of review
    const r = currentState.state === 'New'
      ? 1
      : retrievability(currentState.stability, Math.max(0, elapsedDays));

    let newState: FSRSState;
    let isLapse = false;

    if (currentState.state === 'New') {
      // First review - initialize based on grade
      newState = this.handleFirstReview(currentState, validatedGrade);
    } else if (validatedGrade === Grade.Again) {
      // Lapse - memory failed
      isLapse = currentState.state === 'Review' || currentState.state === 'Relearning';
      newState = this.handleLapse(currentState, r);
    } else if (isSameDay && currentState.reps > 0) {
      // Same-day review (not first review)
      newState = this.handleSameDayReview(currentState, validatedGrade);
    } else {
      // Successful recall
      newState = this.handleRecall(currentState, validatedGrade, r);
    }

    // Apply sentiment boost if enabled and provided
    if (
      this.config.enableSentimentBoost &&
      sentimentBoost !== undefined &&
      sentimentBoost > 0
    ) {
      newState.stability = applySentimentBoost(
        newState.stability,
        sentimentBoost,
        this.config.maxSentimentBoost
      );
    }

    // Calculate next interval
    let interval = nextInterval(newState.stability, this.config.desiredRetention);

    // Apply fuzzing if enabled
    if (this.config.enableFuzz && interval > 2) {
      interval = fuzzInterval(interval, Date.now());
    }

    // Apply maximum interval limit
    interval = Math.min(interval, this.config.maximumInterval);

    newState.scheduledDays = interval;
    newState.lastReview = new Date();

    return {
      state: newState,
      retrievability: r,
      interval,
      isLapse,
    };
  }

  /**
   * Handle first review of a new card
   */
  private handleFirstReview(currentState: FSRSState, grade: ReviewGrade): FSRSState {
    const d = initialDifficulty(grade, this.weights);
    const s = initialStability(grade, this.weights);

    return {
      ...currentState,
      difficulty: d,
      stability: s,
      state: grade === Grade.Again ? 'Learning' : grade === Grade.Hard ? 'Learning' : 'Review',
      reps: 1,
      lapses: grade === Grade.Again ? 1 : 0,
    };
  }

  /**
   * Handle a lapse (Again rating)
   */
  private handleLapse(currentState: FSRSState, retrievabilityR: number): FSRSState {
    const newS = nextForgetStability(
      currentState.difficulty,
      currentState.stability,
      retrievabilityR,
      this.weights
    );

    // Difficulty increases on lapse
    const newD = nextDifficulty(currentState.difficulty, Grade.Again, this.weights);

    return {
      ...currentState,
      difficulty: newD,
      stability: newS,
      state: 'Relearning',
      reps: currentState.reps + 1,
      lapses: currentState.lapses + 1,
    };
  }

  /**
   * Handle a successful recall (Hard, Good, or Easy)
   */
  private handleRecall(
    currentState: FSRSState,
    grade: ReviewGrade,
    retrievabilityR: number
  ): FSRSState {
    const newS = nextRecallStability(
      currentState.stability,
      currentState.difficulty,
      retrievabilityR,
      grade,
      this.weights
    );

    const newD = nextDifficulty(currentState.difficulty, grade, this.weights);

    return {
      ...currentState,
      difficulty: newD,
      stability: newS,
      state: 'Review',
      reps: currentState.reps + 1,
    };
  }

  /**
   * Handle same-day review (NEW in FSRS-6)
   */
  private handleSameDayReview(currentState: FSRSState, grade: ReviewGrade): FSRSState {
    const newS = sameDayStability(currentState.stability, grade, this.weights);
    const newD = nextDifficulty(currentState.difficulty, grade, this.weights);

    return {
      ...currentState,
      difficulty: newD,
      stability: newS,
      state: currentState.state === 'New' ? 'Learning' : currentState.state,
      reps: currentState.reps + 1,
    };
  }

  /**
   * Get the current retrievability for a state
   *
   * @param state - FSRS state
   * @param elapsedDays - Days since last review (optional, calculated from lastReview if not provided)
   * @returns Current retrievability (0-1)
   */
  getRetrievability(state: FSRSState, elapsedDays?: number): number {
    const days = elapsedDays ?? this.daysSinceReview(state.lastReview);
    return retrievability(state.stability, days);
  }

  /**
   * Preview all possible review outcomes without modifying state
   *
   * @param state - Current FSRS state
   * @param elapsedDays - Days since last review
   * @returns Object with results for each grade
   */
  previewReviews(
    state: FSRSState,
    elapsedDays: number = 0
  ): Record<'again' | 'hard' | 'good' | 'easy', ReviewResult> {
    return {
      again: this.review({ ...state }, Grade.Again, elapsedDays),
      hard: this.review({ ...state }, Grade.Hard, elapsedDays),
      good: this.review({ ...state }, Grade.Good, elapsedDays),
      easy: this.review({ ...state }, Grade.Easy, elapsedDays),
    };
  }

  /**
   * Calculate days since a review date
   */
  private daysSinceReview(lastReview: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - lastReview.getTime();
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get scheduler configuration
   */
  getConfig(): Readonly<ResolvedFSRSConfig> {
    return { ...this.config };
  }

  /**
   * Get scheduler weights
   */
  getWeights(): readonly number[] {
    return [...this.weights];
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Convert FSRSState to a JSON-serializable format
 */
export function serializeFSRSState(state: FSRSState): string {
  return JSON.stringify({
    ...state,
    lastReview: state.lastReview.toISOString(),
  });
}

/**
 * Parse a serialized FSRSState from JSON
 */
export function deserializeFSRSState(json: string): FSRSState {
  const parsed = JSON.parse(json) as Record<string, unknown>;

  return FSRSStateSchema.parse({
    ...parsed,
    lastReview: new Date(parsed['lastReview'] as string),
  });
}

/**
 * Calculate optimal review time based on forgetting index
 *
 * @param state - Current FSRS state
 * @param targetRetention - Target retention rate at review time (default 0.9)
 * @returns Days until optimal review
 */
export function optimalReviewTime(
  state: FSRSState,
  targetRetention: number = FSRS_CONSTANTS.DEFAULT_RETENTION
): number {
  return nextInterval(state.stability, targetRetention);
}

/**
 * Determine if a review is due
 *
 * @param state - Current FSRS state
 * @param currentRetention - Optional minimum retention threshold (default: use scheduledDays)
 * @returns True if review is due
 */
export function isReviewDue(state: FSRSState, currentRetention?: number): boolean {
  const daysSinceReview =
    (new Date().getTime() - state.lastReview.getTime()) / (1000 * 60 * 60 * 24);

  if (currentRetention !== undefined) {
    const r = retrievability(state.stability, daysSinceReview);
    return r < currentRetention;
  }

  return daysSinceReview >= state.scheduledDays;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default FSRSScheduler;
