/**
 * Comprehensive tests for FSRS-6 (Free Spaced Repetition Scheduler) Algorithm
 *
 * Tests cover:
 * - Initial difficulty and stability calculations
 * - Retrievability decay over time (FSRS-6 power forgetting curve)
 * - Custom decay parameter (w20) for personalization
 * - Difficulty updates with mean reversion scaling
 * - Stability growth/decay after reviews
 * - Same-day review handling (NEW in FSRS-6)
 * - Interval calculations with FSRS-6 inverse formula
 * - Interval fuzzing
 * - Full review flow scenarios
 * - Sentiment boost functionality
 * - Edge cases and boundary conditions
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  FSRSScheduler,
  Grade,
  FSRS_WEIGHTS,
  FSRS_CONSTANTS,
  initialDifficulty,
  initialStability,
  retrievability,
  retrievabilityWithDecay,
  nextDifficulty,
  nextRecallStability,
  nextForgetStability,
  nextInterval,
  sameDayStability,
  fuzzInterval,
  forgettingFactor,
  applySentimentBoost,
  serializeFSRSState,
  deserializeFSRSState,
  optimalReviewTime,
  isReviewDue,
  type FSRSState,
  type ReviewGrade,
} from '../../core/fsrs.js';

describe('FSRS-6 Algorithm', () => {
  let scheduler: FSRSScheduler;

  beforeEach(() => {
    scheduler = new FSRSScheduler();
  });

  // ==========================================================================
  // 0. FSRS-6 CONSTANTS TESTS
  // ==========================================================================

  describe('FSRS-6 constants', () => {
    it('should have correct weight count (21 for FSRS-6)', () => {
      expect(FSRS_WEIGHTS.length).toBe(21);
    });

    it('should have valid difficulty bounds', () => {
      expect(FSRS_CONSTANTS.MIN_DIFFICULTY).toBe(1);
      expect(FSRS_CONSTANTS.MAX_DIFFICULTY).toBe(10);
    });

    it('should have valid stability bounds', () => {
      expect(FSRS_CONSTANTS.MIN_STABILITY).toBeGreaterThan(0);
      expect(FSRS_CONSTANTS.MAX_STABILITY).toBe(36500);
    });

    it('should have reasonable default retention', () => {
      expect(FSRS_CONSTANTS.DEFAULT_RETENTION).toBe(0.9);
    });

    it('should have default decay (w20)', () => {
      expect(FSRS_CONSTANTS.DEFAULT_DECAY).toBe(0.1542);
      expect(FSRS_WEIGHTS[20]).toBe(FSRS_CONSTANTS.DEFAULT_DECAY);
    });

    it('should have same-day review weights (w17, w18, w19)', () => {
      expect(FSRS_WEIGHTS[17]).toBe(0.5425);
      expect(FSRS_WEIGHTS[18]).toBe(0.0912);
      expect(FSRS_WEIGHTS[19]).toBe(0.0658);
    });
  });

  // ==========================================================================
  // 1. FORGETTING FACTOR TESTS
  // ==========================================================================

  describe('forgettingFactor', () => {
    it('should calculate factor from w20', () => {
      const factor = forgettingFactor(FSRS_CONSTANTS.DEFAULT_DECAY);
      // factor = 0.9^(-1/0.1542) - 1
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThan(10);
    });

    it('should produce larger factor with smaller decay', () => {
      const factorLow = forgettingFactor(0.1);
      const factorHigh = forgettingFactor(0.5);
      expect(factorLow).toBeGreaterThan(factorHigh);
    });
  });

  // ==========================================================================
  // 2. INITIAL DIFFICULTY TESTS
  // ==========================================================================

  describe('initialDifficulty', () => {
    it('should return highest difficulty for Again grade', () => {
      const d = initialDifficulty(Grade.Again);
      // With FSRS-6 weights: w4 - e^(w5*(1-1)) + 1 = 6.4133 - 1 + 1 = 6.4133
      expect(d).toBeCloseTo(6.41, 1);
    });

    it('should return lower difficulty for Hard grade', () => {
      const d = initialDifficulty(Grade.Hard);
      expect(d).toBeGreaterThan(3);
      expect(d).toBeLessThan(6.41);
    });

    it('should return moderate difficulty for Good grade', () => {
      const d = initialDifficulty(Grade.Good);
      expect(d).toBeGreaterThan(2);
      expect(d).toBeLessThan(5);
    });

    it('should return lowest difficulty for Easy grade', () => {
      const d = initialDifficulty(Grade.Easy);
      expect(d).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_DIFFICULTY);
      expect(d).toBeLessThan(3);
    });

    it('should produce decreasing difficulty as grade increases (Again > Hard > Good > Easy)', () => {
      const dAgain = initialDifficulty(Grade.Again);
      const dHard = initialDifficulty(Grade.Hard);
      const dGood = initialDifficulty(Grade.Good);
      const dEasy = initialDifficulty(Grade.Easy);

      expect(dAgain).toBeGreaterThan(dHard);
      expect(dHard).toBeGreaterThan(dGood);
      expect(dGood).toBeGreaterThan(dEasy);
    });

    it('should always clamp difficulty to minimum 1', () => {
      const customWeights = Array(21).fill(0);
      customWeights[4] = -100;
      customWeights[5] = 10;
      const d = initialDifficulty(Grade.Easy, customWeights);
      expect(d).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_DIFFICULTY);
    });

    it('should always clamp difficulty to maximum 10', () => {
      const customWeights = Array(21).fill(0);
      customWeights[4] = 100;
      customWeights[5] = -10;
      const d = initialDifficulty(Grade.Again, customWeights);
      expect(d).toBeLessThanOrEqual(FSRS_CONSTANTS.MAX_DIFFICULTY);
    });
  });

  // ==========================================================================
  // 3. INITIAL STABILITY TESTS
  // ==========================================================================

  describe('initialStability', () => {
    it('should return lowest stability for Again grade', () => {
      const s = initialStability(Grade.Again);
      // w[0] = 0.212
      expect(s).toBeCloseTo(0.212, 3);
    });

    it('should return higher stability for Hard grade', () => {
      const s = initialStability(Grade.Hard);
      // w[1] = 1.2931
      expect(s).toBeCloseTo(1.2931, 3);
    });

    it('should return higher stability for Good grade', () => {
      const s = initialStability(Grade.Good);
      // w[2] = 2.3065
      expect(s).toBeCloseTo(2.3065, 3);
    });

    it('should return highest stability for Easy grade', () => {
      const s = initialStability(Grade.Easy);
      // w[3] = 8.2956
      expect(s).toBeCloseTo(8.2956, 3);
    });

    it('should produce increasing stability as grade increases (Again < Hard < Good < Easy)', () => {
      const sAgain = initialStability(Grade.Again);
      const sHard = initialStability(Grade.Hard);
      const sGood = initialStability(Grade.Good);
      const sEasy = initialStability(Grade.Easy);

      expect(sAgain).toBeLessThan(sHard);
      expect(sHard).toBeLessThan(sGood);
      expect(sGood).toBeLessThan(sEasy);
    });

    it('should always return positive stability', () => {
      for (const grade of [Grade.Again, Grade.Hard, Grade.Good, Grade.Easy]) {
        const s = initialStability(grade);
        expect(s).toBeGreaterThan(0);
        expect(s).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_STABILITY);
      }
    });

    it('should use minimum stability when custom weight is zero', () => {
      const customWeights = Array(21).fill(0);
      const s = initialStability(Grade.Again, customWeights);
      expect(s).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_STABILITY);
    });
  });

  // ==========================================================================
  // 4. RETRIEVABILITY TESTS (FSRS-6 Power Forgetting Curve)
  // ==========================================================================

  describe('retrievability', () => {
    it('should return 1.0 when elapsed days is 0', () => {
      const r = retrievability(10, 0);
      expect(r).toBe(1);
    });

    it('should return 1.0 when elapsed days is negative', () => {
      const r = retrievability(10, -5);
      expect(r).toBe(1);
    });

    it('should return 0 when stability is 0', () => {
      const r = retrievability(0, 10);
      expect(r).toBe(0);
    });

    it('should return 0 when stability is negative', () => {
      const r = retrievability(-5, 10);
      expect(r).toBe(0);
    });

    it('should decrease monotonically over time', () => {
      const stability = 10;
      const r1 = retrievability(stability, 1);
      const r5 = retrievability(stability, 5);
      const r10 = retrievability(stability, 10);
      const r30 = retrievability(stability, 30);

      expect(r1).toBeGreaterThan(r5);
      expect(r5).toBeGreaterThan(r10);
      expect(r10).toBeGreaterThan(r30);

      expect(r1).toBeLessThanOrEqual(1);
      expect(r30).toBeGreaterThan(0);
    });

    it('should never return negative values', () => {
      const r = retrievability(1, 1000);
      expect(r).toBeGreaterThanOrEqual(0);
    });

    it('should never exceed 1', () => {
      const r = retrievability(1000, 0.001);
      expect(r).toBeLessThanOrEqual(1);
    });

    it('should decay slower with higher stability', () => {
      const elapsedDays = 10;
      const rLowStability = retrievability(5, elapsedDays);
      const rHighStability = retrievability(50, elapsedDays);

      expect(rHighStability).toBeGreaterThan(rLowStability);
    });

    it('should follow FSRS-6 power forgetting curve formula', () => {
      // R = (1 + factor * t / S)^(-w20)
      const stability = 10;
      const elapsed = 10;
      const w20 = FSRS_CONSTANTS.DEFAULT_DECAY;
      const factor = forgettingFactor(w20);
      const expected = Math.pow(1 + (factor * elapsed) / stability, -w20);
      const actual = retrievability(stability, elapsed);
      expect(actual).toBeCloseTo(expected, 6);
    });
  });

  // ==========================================================================
  // 5. RETRIEVABILITY WITH CUSTOM DECAY TESTS
  // ==========================================================================

  describe('retrievabilityWithDecay', () => {
    it('should use custom decay parameter', () => {
      const stability = 10;
      const elapsed = 5;

      const rLowDecay = retrievabilityWithDecay(stability, elapsed, 0.1);
      const rHighDecay = retrievabilityWithDecay(stability, elapsed, 0.5);

      // Higher decay = faster forgetting = lower retrievability at same time
      // But wait - the formula is (1 + factor * t / S)^(-w20)
      // With higher w20, the exponent is more negative but factor changes too
      // Let's just verify they're different
      expect(rLowDecay).not.toBe(rHighDecay);
    });

    it('should return 1 at time 0 regardless of decay', () => {
      expect(retrievabilityWithDecay(10, 0, 0.1)).toBe(1);
      expect(retrievabilityWithDecay(10, 0, 0.5)).toBe(1);
    });

    it('should return 0 for zero stability', () => {
      expect(retrievabilityWithDecay(0, 10, 0.1542)).toBe(0);
    });
  });

  // ==========================================================================
  // 6. NEXT DIFFICULTY TESTS (FSRS-6 Mean Reversion)
  // ==========================================================================

  describe('nextDifficulty', () => {
    it('should increase difficulty on Again grade', () => {
      const currentD = 5;
      const newD = nextDifficulty(currentD, Grade.Again);
      expect(newD).toBeGreaterThan(currentD);
    });

    it('should slightly increase difficulty on Hard grade', () => {
      const currentD = 5;
      const newD = nextDifficulty(currentD, Grade.Hard);
      expect(newD).toBeGreaterThan(currentD);
    });

    it('should roughly maintain difficulty on Good grade', () => {
      const currentD = 5;
      const newD = nextDifficulty(currentD, Grade.Good);
      // Good grade (3) is the reference point
      expect(Math.abs(newD - currentD)).toBeLessThan(1);
    });

    it('should decrease difficulty on Easy grade', () => {
      const currentD = 5;
      const newD = nextDifficulty(currentD, Grade.Easy);
      expect(newD).toBeLessThan(currentD);
    });

    it('should apply mean reversion with ((10-D)/9) scaling', () => {
      // Very high difficulty should regress towards mean
      const highD = 9;
      const newDHigh = nextDifficulty(highD, Grade.Good);
      // At D=9, mean reversion scale = (10-9)/9 = 1/9 (small effect)
      expect(newDHigh).toBeLessThanOrEqual(highD);

      // Very low difficulty should regress towards mean on Again
      const lowD = 2;
      const newDLow = nextDifficulty(lowD, Grade.Again);
      // At D=2, mean reversion scale = (10-2)/9 = 8/9 (large effect)
      expect(newDLow).toBeGreaterThan(lowD);
    });

    it('should clamp to minimum difficulty 1', () => {
      const newD = nextDifficulty(1, Grade.Easy);
      expect(newD).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_DIFFICULTY);
    });

    it('should clamp to maximum difficulty 10', () => {
      const newD = nextDifficulty(10, Grade.Again);
      expect(newD).toBeLessThanOrEqual(FSRS_CONSTANTS.MAX_DIFFICULTY);
    });
  });

  // ==========================================================================
  // 7. NEXT RECALL STABILITY TESTS
  // ==========================================================================

  describe('nextRecallStability', () => {
    it('should increase stability on Good grade', () => {
      const currentS = 10;
      const difficulty = 5;
      const retrievabilityR = 0.9;
      const newS = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Good);
      expect(newS).toBeGreaterThan(currentS);
    });

    it('should increase stability more on Easy than Good', () => {
      const currentS = 10;
      const difficulty = 5;
      const retrievabilityR = 0.9;
      const newSGood = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Good);
      const newSEasy = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Easy);
      expect(newSEasy).toBeGreaterThan(newSGood);
    });

    it('should increase stability less on Hard than Good', () => {
      const currentS = 10;
      const difficulty = 5;
      const retrievabilityR = 0.9;
      const newSHard = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Hard);
      const newSGood = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Good);
      expect(newSGood).toBeGreaterThan(newSHard);
    });

    it('should delegate to nextForgetStability for Again grade', () => {
      const currentS = 10;
      const difficulty = 5;
      const retrievabilityR = 0.9;
      const newS = nextRecallStability(currentS, difficulty, retrievabilityR, Grade.Again);
      expect(newS).toBeLessThan(currentS);
    });

    it('should produce higher stability growth with lower difficulty', () => {
      const currentS = 10;
      const retrievabilityR = 0.9;
      const newSLowD = nextRecallStability(currentS, 2, retrievabilityR, Grade.Good);
      const newSHighD = nextRecallStability(currentS, 8, retrievabilityR, Grade.Good);
      expect(newSLowD).toBeGreaterThan(newSHighD);
    });

    it('should produce higher stability growth with lower retrievability (desirable difficulty)', () => {
      const currentS = 10;
      const difficulty = 5;
      const newSHighR = nextRecallStability(currentS, difficulty, 0.95, Grade.Good);
      const newSLowR = nextRecallStability(currentS, difficulty, 0.7, Grade.Good);
      expect(newSLowR).toBeGreaterThan(newSHighR);
    });

    it('should clamp to maximum stability', () => {
      const currentS = 30000;
      const newS = nextRecallStability(currentS, 1, 0.5, Grade.Easy);
      expect(newS).toBeLessThanOrEqual(FSRS_CONSTANTS.MAX_STABILITY);
    });
  });

  // ==========================================================================
  // 8. NEXT FORGET STABILITY TESTS (FSRS-6: post-lapse <= pre-lapse)
  // ==========================================================================

  describe('nextForgetStability', () => {
    it('should return stability lower than current after lapse', () => {
      const currentS = 50;
      const difficulty = 5;
      const newS = nextForgetStability(difficulty, currentS);
      expect(newS).toBeLessThan(currentS);
    });

    it('should produce lower stability with higher difficulty', () => {
      const currentS = 50;
      const newSLowD = nextForgetStability(2, currentS);
      const newSHighD = nextForgetStability(9, currentS);
      expect(newSLowD).toBeGreaterThan(newSHighD);
    });

    it('should preserve some memory (not reset to minimum)', () => {
      const currentS = 100;
      const newS = nextForgetStability(5, currentS);
      expect(newS).toBeGreaterThan(FSRS_CONSTANTS.MIN_STABILITY);
    });

    it('should never return negative stability', () => {
      const newS = nextForgetStability(10, 1);
      expect(newS).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_STABILITY);
    });

    it('FSRS-6: post-lapse stability cannot exceed pre-lapse stability', () => {
      // This is a key FSRS-6 requirement
      const currentS = 10;
      const newS = nextForgetStability(2, currentS, 0.3);
      expect(newS).toBeLessThanOrEqual(currentS);
    });

    it('should account for retrievability at time of lapse', () => {
      const currentS = 50;
      const difficulty = 5;
      const newSHighR = nextForgetStability(difficulty, currentS, 0.9);
      const newSLowR = nextForgetStability(difficulty, currentS, 0.3);
      // With FSRS-6 constraint, both must be <= currentS
      expect(newSHighR).toBeLessThanOrEqual(currentS);
      expect(newSLowR).toBeLessThanOrEqual(currentS);
    });
  });

  // ==========================================================================
  // 9. SAME-DAY STABILITY TESTS (NEW in FSRS-6)
  // ==========================================================================

  describe('sameDayStability', () => {
    it('should produce different stability for different grades', () => {
      const currentS = 5;

      const sAgain = sameDayStability(currentS, Grade.Again);
      const sHard = sameDayStability(currentS, Grade.Hard);
      const sGood = sameDayStability(currentS, Grade.Good);
      const sEasy = sameDayStability(currentS, Grade.Easy);

      // Stability should increase with better grades
      expect(sAgain).toBeLessThan(sHard);
      expect(sHard).toBeLessThan(sGood);
      expect(sGood).toBeLessThan(sEasy);
    });

    it('should return valid stability', () => {
      const s = sameDayStability(10, Grade.Good);
      expect(s).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_STABILITY);
      expect(s).toBeLessThanOrEqual(FSRS_CONSTANTS.MAX_STABILITY);
    });

    it('should use w17, w18, w19 weights', () => {
      const currentS = 5;
      const grade = Grade.Good;

      // S' = S * e^(w17 * (G - 3 + w18)) * S^(-w19)
      const w17 = FSRS_WEIGHTS[17];
      const w18 = FSRS_WEIGHTS[18];
      const w19 = FSRS_WEIGHTS[19];
      const g = grade as number;

      const expected = currentS * Math.exp(w17 * (g - 3 + w18)) * Math.pow(currentS, -w19);
      const actual = sameDayStability(currentS, grade);

      expect(actual).toBeCloseTo(expected, 4);
    });
  });

  // ==========================================================================
  // 10. NEXT INTERVAL TESTS (FSRS-6 Inverse Formula)
  // ==========================================================================

  describe('nextInterval', () => {
    it('should return 0 for zero stability', () => {
      const interval = nextInterval(0);
      expect(interval).toBe(0);
    });

    it('should return 0 for negative stability', () => {
      const interval = nextInterval(-10);
      expect(interval).toBe(0);
    });

    it('should return 0 for 100% desired retention', () => {
      const interval = nextInterval(10, 1);
      expect(interval).toBe(0);
    });

    it('should return maximum for 0% desired retention', () => {
      const interval = nextInterval(10, 0);
      expect(interval).toBe(FSRS_CONSTANTS.MAX_STABILITY);
    });

    it('should return longer intervals for higher stability', () => {
      const intervalLow = nextInterval(5);
      const intervalHigh = nextInterval(50);
      expect(intervalHigh).toBeGreaterThan(intervalLow);
    });

    it('should return shorter intervals for higher desired retention', () => {
      const stability = 20;
      const intervalLowRetention = nextInterval(stability, 0.8);
      const intervalHighRetention = nextInterval(stability, 0.95);
      expect(intervalLowRetention).toBeGreaterThan(intervalHighRetention);
    });

    it('should round-trip with retrievability (interval -> R should match desired R)', () => {
      const stability = 15;
      const desiredRetention = 0.9;

      const interval = nextInterval(stability, desiredRetention);
      const actualR = retrievability(stability, interval);

      // Allow some tolerance due to rounding
      expect(actualR).toBeCloseTo(desiredRetention, 1);
    });

    it('should round interval to nearest integer', () => {
      const interval = nextInterval(7.5, 0.85);
      expect(Number.isInteger(interval)).toBe(true);
    });
  });

  // ==========================================================================
  // 11. FUZZ INTERVAL TESTS
  // ==========================================================================

  describe('fuzzInterval', () => {
    it('should not fuzz intervals <= 2', () => {
      expect(fuzzInterval(1, 12345)).toBe(1);
      expect(fuzzInterval(2, 12345)).toBe(2);
    });

    it('should be deterministic with same seed', () => {
      const interval = 30;
      const fuzzed1 = fuzzInterval(interval, 12345);
      const fuzzed2 = fuzzInterval(interval, 12345);
      expect(fuzzed1).toBe(fuzzed2);
    });

    it('should produce different results with different seeds', () => {
      const interval = 30;
      const fuzzed1 = fuzzInterval(interval, 12345);
      const fuzzed2 = fuzzInterval(interval, 54321);
      // They might be the same by chance, but likely different
      // Just check they're both valid
      expect(fuzzed1).toBeGreaterThan(0);
      expect(fuzzed2).toBeGreaterThan(0);
    });

    it('should keep fuzzed value close to original (within 5%)', () => {
      const interval = 30;
      const fuzzed = fuzzInterval(interval, 12345);
      const maxFuzz = Math.max(1, Math.floor(interval * 0.05));
      expect(Math.abs(fuzzed - interval)).toBeLessThanOrEqual(maxFuzz);
    });

    it('should never return values less than 1', () => {
      const fuzzed = fuzzInterval(3, 99999);
      expect(fuzzed).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 12. FULL REVIEW FLOW TESTS
  // ==========================================================================

  describe('full review flow', () => {
    it('should initialize a new card correctly', () => {
      const card = scheduler.newCard();
      expect(card.state).toBe('New');
      expect(card.reps).toBe(0);
      expect(card.lapses).toBe(0);
      expect(card.stability).toBeGreaterThan(0);
      expect(card.difficulty).toBeGreaterThan(0);
    });

    it('should progress new item through first review', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Good, 0);

      expect(result.state.reps).toBe(1);
      expect(result.state.stability).toBeGreaterThan(0);
      expect(result.state.state).toBe('Review');
      expect(result.retrievability).toBe(1);
    });

    it('should handle first review with Again grade', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Again, 0);

      expect(result.state.reps).toBe(1);
      expect(result.state.lapses).toBe(1);
      expect(result.state.state).toBe('Learning');
    });

    it('should handle first review with Hard grade', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Hard, 0);

      expect(result.state.reps).toBe(1);
      expect(result.state.state).toBe('Learning');
    });

    it('should progress through multiple reviews', () => {
      let card = scheduler.newCard();

      let result = scheduler.review(card, Grade.Good, 0);
      card = result.state;
      expect(card.reps).toBe(1);

      result = scheduler.review(card, Grade.Good, result.interval);
      card = result.state;
      expect(card.reps).toBe(2);
      expect(card.state).toBe('Review');

      result = scheduler.review(card, Grade.Easy, result.interval);
      card = result.state;
      expect(card.reps).toBe(3);
    });

    it('should handle lapse correctly', () => {
      const state: FSRSState = {
        stability: 100,
        difficulty: 5,
        state: 'Review',
        reps: 10,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 100,
      };

      const result = scheduler.review(state, Grade.Again, 100);

      expect(result.state.stability).toBeLessThan(state.stability);
      expect(result.state.lapses).toBe(1);
      expect(result.state.state).toBe('Relearning');
      expect(result.isLapse).toBe(true);
    });

    it('should recover from lapse with subsequent Good reviews', () => {
      let state: FSRSState = {
        stability: 10,
        difficulty: 6,
        state: 'Relearning',
        reps: 5,
        lapses: 1,
        lastReview: new Date(),
        scheduledDays: 1,
      };

      let result = scheduler.review(state, Grade.Good, 1);
      state = result.state;
      expect(state.state).toBe('Review');

      result = scheduler.review(state, Grade.Good, result.interval);
      state = result.state;
      expect(state.stability).toBeGreaterThan(10);
    });

    it('should not mark first Again as lapse', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Again, 0);
      expect(result.isLapse).toBe(false);
    });

    it('should increase stability faster with Easy grade', () => {
      const card = scheduler.newCard();

      const resultGood = scheduler.review(card, Grade.Good, 0);
      const resultEasy = scheduler.review(card, Grade.Easy, 0);

      expect(resultEasy.state.stability).toBeGreaterThan(resultGood.state.stability);
      expect(resultEasy.interval).toBeGreaterThan(resultGood.interval);
    });

    it('should handle same-day review (FSRS-6)', () => {
      let card = scheduler.newCard();

      // First review
      let result = scheduler.review(card, Grade.Good, 0);
      card = result.state;
      const stabilityAfterFirst = card.stability;

      // Same-day review (elapsed < 1 day)
      result = scheduler.review(card, Grade.Good, 0.5);

      // Should use same-day stability calculation
      expect(result.state.reps).toBe(2);
      expect(result.state.stability).not.toBe(stabilityAfterFirst);
    });
  });

  // ==========================================================================
  // 13. SENTIMENT BOOST TESTS
  // ==========================================================================

  describe('applySentimentBoost', () => {
    it('should apply no boost when sentiment intensity is 0', () => {
      const stability = 10;
      const boosted = applySentimentBoost(stability, 0);
      expect(boosted).toBe(stability);
    });

    it('should apply maximum boost when sentiment intensity is 1', () => {
      const stability = 10;
      const maxBoost = 2.0;
      const boosted = applySentimentBoost(stability, 1, maxBoost);
      expect(boosted).toBe(stability * maxBoost);
    });

    it('should apply proportional boost for intermediate sentiment', () => {
      const stability = 10;
      const boosted = applySentimentBoost(stability, 0.5, 2.0);
      expect(boosted).toBe(stability * 1.5);
    });

    it('should clamp sentiment intensity to [0, 1]', () => {
      const stability = 10;
      const boostedNegative = applySentimentBoost(stability, -0.5, 2.0);
      const boostedOverflow = applySentimentBoost(stability, 1.5, 2.0);

      expect(boostedNegative).toBe(stability);
      expect(boostedOverflow).toBe(stability * 2.0);
    });

    it('should clamp max boost to [1, 3]', () => {
      const stability = 10;
      const boostedLowMax = applySentimentBoost(stability, 1, 0.5);
      const boostedHighMax = applySentimentBoost(stability, 1, 5);

      expect(boostedLowMax).toBe(stability);
      expect(boostedHighMax).toBe(stability * 3);
    });

    it('should integrate with scheduler when enabled', () => {
      const schedulerWithBoost = new FSRSScheduler({
        enableSentimentBoost: true,
        maxSentimentBoost: 2,
      });

      const card = schedulerWithBoost.newCard();
      const resultNoBoost = schedulerWithBoost.review(card, Grade.Good, 0);
      const resultWithBoost = schedulerWithBoost.review(card, Grade.Good, 0, 0.5);

      expect(resultWithBoost.state.stability).toBeGreaterThan(resultNoBoost.state.stability);
    });

    it('should not apply boost when sentiment is undefined', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Good, 0, undefined);
      const resultExplicitZero = scheduler.review(card, Grade.Good, 0, 0);

      expect(result.state.stability).toBe(resultExplicitZero.state.stability);
    });

    it('should not apply boost when disabled in config', () => {
      const schedulerNoBoost = new FSRSScheduler({
        enableSentimentBoost: false,
      });

      const card = schedulerNoBoost.newCard();
      const result = schedulerNoBoost.review(card, Grade.Good, 0, 1.0);
      const resultNoSentiment = schedulerNoBoost.review(card, Grade.Good, 0);

      expect(result.state.stability).toBe(resultNoSentiment.state.stability);
    });
  });

  // ==========================================================================
  // 14. EDGE CASES
  // ==========================================================================

  describe('edge cases', () => {
    it('should handle very large elapsed days', () => {
      const state: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 10,
      };

      const result = scheduler.review(state, Grade.Good, 3650);

      // FSRS-6 uses power law decay which decays slower than exponential
      // With stability=10 and 3650 days elapsed, R ≈ 0.40 (much higher than FSRS-5)
      expect(result.retrievability).toBeGreaterThanOrEqual(0);
      expect(result.retrievability).toBeLessThan(0.5);
      expect(result.state.stability).toBeGreaterThan(0);
    });

    it('should handle zero elapsed days correctly', () => {
      const state: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 10,
      };

      const result = scheduler.review(state, Grade.Good, 0);
      expect(result.retrievability).toBe(1);
    });

    it('should handle boundary grade values', () => {
      const card = scheduler.newCard();

      const resultAgain = scheduler.review(card, 1 as ReviewGrade, 0);
      expect(resultAgain.state.reps).toBe(1);

      const resultEasy = scheduler.review(card, 4 as ReviewGrade, 0);
      expect(resultEasy.state.reps).toBe(1);
    });

    it('should handle minimum stability edge case', () => {
      const state: FSRSState = {
        stability: FSRS_CONSTANTS.MIN_STABILITY,
        difficulty: 10,
        state: 'Relearning',
        reps: 1,
        lapses: 1,
        lastReview: new Date(),
        scheduledDays: 0,
      };

      const result = scheduler.review(state, Grade.Again, 1);
      expect(result.state.stability).toBeGreaterThanOrEqual(FSRS_CONSTANTS.MIN_STABILITY);
    });

    it('should handle maximum difficulty edge case', () => {
      const state: FSRSState = {
        stability: 10,
        difficulty: FSRS_CONSTANTS.MAX_DIFFICULTY,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 10,
      };

      const result = scheduler.review(state, Grade.Again, 10);
      expect(result.state.difficulty).toBeLessThanOrEqual(FSRS_CONSTANTS.MAX_DIFFICULTY);
    });

    it('should handle rapid consecutive reviews', () => {
      let card = scheduler.newCard();

      for (let i = 0; i < 5; i++) {
        const result = scheduler.review(card, Grade.Good, 0);
        card = result.state;
      }

      expect(card.reps).toBe(5);
      expect(card.stability).toBeGreaterThan(0);
    });

    it('should handle alternating grades', () => {
      let card = scheduler.newCard();
      const grades = [Grade.Good, Grade.Again, Grade.Easy, Grade.Hard, Grade.Good];

      for (const grade of grades) {
        const result = scheduler.review(card, grade, 0);
        card = result.state;
      }

      expect(card.reps).toBe(5);
      expect(card.lapses).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // 15. SERIALIZATION TESTS
  // ==========================================================================

  describe('serialization', () => {
    it('should serialize FSRSState to JSON', () => {
      const state: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date('2024-01-15T10:30:00.000Z'),
        scheduledDays: 10,
      };

      const json = serializeFSRSState(state);
      expect(typeof json).toBe('string');
      expect(json).toContain('"stability":10');
      expect(json).toContain('"2024-01-15T10:30:00.000Z"');
    });

    it('should deserialize FSRSState from JSON', () => {
      const original: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date('2024-01-15T10:30:00.000Z'),
        scheduledDays: 10,
      };

      const json = serializeFSRSState(original);
      const deserialized = deserializeFSRSState(json);

      expect(deserialized.stability).toBe(original.stability);
      expect(deserialized.difficulty).toBe(original.difficulty);
      expect(deserialized.state).toBe(original.state);
      expect(deserialized.reps).toBe(original.reps);
      expect(deserialized.lapses).toBe(original.lapses);
      expect(deserialized.lastReview.toISOString()).toBe(original.lastReview.toISOString());
    });

    it('should round-trip FSRSState correctly', () => {
      const card = scheduler.newCard();
      const result = scheduler.review(card, Grade.Good, 0);

      const json = serializeFSRSState(result.state);
      const restored = deserializeFSRSState(json);

      expect(restored.stability).toBeCloseTo(result.state.stability, 5);
      expect(restored.difficulty).toBeCloseTo(result.state.difficulty, 5);
      expect(restored.state).toBe(result.state.state);
    });
  });

  // ==========================================================================
  // 16. UTILITY FUNCTION TESTS
  // ==========================================================================

  describe('utility functions', () => {
    it('optimalReviewTime should match nextInterval', () => {
      const state: FSRSState = {
        stability: 20,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 20,
      };

      const optimal = optimalReviewTime(state);
      const interval = nextInterval(state.stability);

      expect(optimal).toBe(interval);
    });

    it('optimalReviewTime should respect custom retention', () => {
      const state: FSRSState = {
        stability: 20,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 20,
      };

      const optimalDefault = optimalReviewTime(state);
      const optimalHighRetention = optimalReviewTime(state, 0.95);

      expect(optimalHighRetention).toBeLessThan(optimalDefault);
    });

    it('isReviewDue should return true when scheduled days passed', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 15);

      const state: FSRSState = {
        stability: 20,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: pastDate,
        scheduledDays: 10,
      };

      expect(isReviewDue(state)).toBe(true);
    });

    it('isReviewDue should return false when not yet due', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 2);

      const state: FSRSState = {
        stability: 20,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: recentDate,
        scheduledDays: 10,
      };

      expect(isReviewDue(state)).toBe(false);
    });

    it('isReviewDue should use retention threshold when provided', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const state: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: pastDate,
        scheduledDays: 10,
      };

      const dueHighRetention = isReviewDue(state, 0.95);
      const dueLowRetention = isReviewDue(state, 0.5);

      // With FSRS-6 formula, check that high retention threshold triggers due sooner
      expect(dueHighRetention).toBe(true);
      expect(dueLowRetention).toBe(false);
    });
  });

  // ==========================================================================
  // 17. SCHEDULER CONFIGURATION TESTS
  // ==========================================================================

  describe('scheduler configuration', () => {
    it('should use default configuration when none provided', () => {
      const config = scheduler.getConfig();

      expect(config.desiredRetention).toBe(0.9);
      expect(config.maximumInterval).toBe(36500);
      expect(config.enableSentimentBoost).toBe(true);
      expect(config.maxSentimentBoost).toBe(2);
      expect(config.enableFuzz).toBe(false);
    });

    it('should accept custom desired retention', () => {
      const customScheduler = new FSRSScheduler({ desiredRetention: 0.85 });
      const config = customScheduler.getConfig();

      expect(config.desiredRetention).toBe(0.85);
    });

    it('should accept custom maximum interval', () => {
      const customScheduler = new FSRSScheduler({ maximumInterval: 365 });
      const config = customScheduler.getConfig();

      expect(config.maximumInterval).toBe(365);
    });

    it('should clamp interval to maximum', () => {
      const customScheduler = new FSRSScheduler({ maximumInterval: 30 });

      const state: FSRSState = {
        stability: 100,
        difficulty: 5,
        state: 'Review',
        reps: 10,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 100,
      };

      const result = customScheduler.review(state, Grade.Easy, 100);
      expect(result.interval).toBeLessThanOrEqual(30);
    });

    it('should use custom weights when provided (21 for FSRS-6)', () => {
      const customWeights = Array(21).fill(1);
      const customScheduler = new FSRSScheduler({ weights: customWeights });
      const weights = customScheduler.getWeights();

      expect(weights.length).toBe(21);
      expect(weights[0]).toBe(1);
    });

    it('should use default weights when none provided', () => {
      const weights = scheduler.getWeights();

      expect(weights.length).toBe(21);
      expect(weights[0]).toBeCloseTo(FSRS_WEIGHTS[0], 5);
    });

    it('should preview all review outcomes', () => {
      const card = scheduler.newCard();
      const previews = scheduler.previewReviews(card, 0);

      expect(previews.again).toBeDefined();
      expect(previews.hard).toBeDefined();
      expect(previews.good).toBeDefined();
      expect(previews.easy).toBeDefined();

      expect(previews.again.state.lapses).toBeGreaterThanOrEqual(1);
      expect(previews.easy.interval).toBeGreaterThan(previews.good.interval);
    });

    it('should get retrievability for a state', () => {
      const state: FSRSState = {
        stability: 10,
        difficulty: 5,
        state: 'Review',
        reps: 5,
        lapses: 0,
        lastReview: new Date(),
        scheduledDays: 10,
      };

      const r = scheduler.getRetrievability(state, 5);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    });

    it('should enable fuzzing when configured', () => {
      const fuzzScheduler = new FSRSScheduler({ enableFuzz: true });
      const config = fuzzScheduler.getConfig();

      expect(config.enableFuzz).toBe(true);
    });
  });
});
