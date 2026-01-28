/**
 * Time Travel Environment for Testing Decay
 *
 * Enables testing of time-dependent memory behavior:
 * - FSRS-6 scheduling and intervals
 * - Memory decay (retrieval strength degradation)
 * - Temporal validity periods
 * - Consolidation timing
 *
 * Uses a virtual clock that can be advanced without waiting.
 */

import { addDays, addHours, addMinutes, addSeconds, differenceInSeconds } from 'date-fns';

/**
 * Record of a time jump for debugging
 */
export interface TimeJump {
  from: Date;
  to: Date;
  reason: string;
}

/**
 * Environment for testing time-dependent memory behavior
 *
 * Provides a virtual clock that can be advanced to test:
 * - Memory decay over time
 * - FSRS-6 scheduling calculations
 * - Temporal validity windows
 * - Consolidation cycles
 *
 * @example
 * ```typescript
 * const env = new TimeTravelEnvironment();
 *
 * // Start at a known time
 * env.setTime(new Date());
 *
 * // Advance 30 days to test decay
 * env.advanceDays(30);
 *
 * // Check retrievability at this point
 * const elapsed = env.daysSince(originalTime);
 * ```
 */
export class TimeTravelEnvironment {
  private currentTime: Date;
  private readonly _startTime: Date;
  private timeHistory: TimeJump[];

  /**
   * Create a new time travel environment starting at the current time
   */
  constructor(startTime?: Date) {
    const time = startTime ?? new Date();
    this.currentTime = new Date(time);
    this._startTime = new Date(time);
    this.timeHistory = [];
  }

  /**
   * Create environment at a specific starting time
   */
  static at(time: Date): TimeTravelEnvironment {
    return new TimeTravelEnvironment(time);
  }

  /**
   * Get the current virtual time
   */
  now(): Date {
    return new Date(this.currentTime);
  }

  /**
   * Get the original start time
   */
  startTime(): Date {
    return new Date(this._startTime);
  }

  /**
   * Set the current time to a specific point
   */
  setTime(time: Date): void {
    const from = new Date(this.currentTime);
    this.timeHistory.push({
      from,
      to: new Date(time),
      reason: 'set_time',
    });
    this.currentTime = new Date(time);
  }

  /**
   * Advance time by a duration in milliseconds
   */
  advance(milliseconds: number): void {
    const from = new Date(this.currentTime);
    const to = new Date(this.currentTime.getTime() + milliseconds);
    this.timeHistory.push({
      from,
      to: new Date(to),
      reason: `advance ${milliseconds}ms`,
    });
    this.currentTime = to;
  }

  /**
   * Advance time by the specified number of days
   */
  advanceDays(days: number): void {
    const from = new Date(this.currentTime);
    const to = addDays(this.currentTime, days);
    this.timeHistory.push({
      from,
      to: new Date(to),
      reason: `advance_days ${days}`,
    });
    this.currentTime = to;
  }

  /**
   * Advance time by the specified number of hours
   */
  advanceHours(hours: number): void {
    const from = new Date(this.currentTime);
    const to = addHours(this.currentTime, hours);
    this.timeHistory.push({
      from,
      to: new Date(to),
      reason: `advance_hours ${hours}`,
    });
    this.currentTime = to;
  }

  /**
   * Advance time by the specified number of minutes
   */
  advanceMinutes(minutes: number): void {
    const from = new Date(this.currentTime);
    const to = addMinutes(this.currentTime, minutes);
    this.timeHistory.push({
      from,
      to: new Date(to),
      reason: `advance_minutes ${minutes}`,
    });
    this.currentTime = to;
  }

  /**
   * Advance time by the specified number of seconds
   */
  advanceSeconds(seconds: number): void {
    const from = new Date(this.currentTime);
    const to = addSeconds(this.currentTime, seconds);
    this.timeHistory.push({
      from,
      to: new Date(to),
      reason: `advance_seconds ${seconds}`,
    });
    this.currentTime = to;
  }

  /**
   * Calculate days elapsed since a reference time
   */
  daysSince(reference: Date): number {
    const seconds = differenceInSeconds(this.currentTime, reference);
    return seconds / 86400;
  }

  /**
   * Calculate days elapsed since the start time
   */
  daysSinceStart(): number {
    return this.daysSince(this._startTime);
  }

  /**
   * Calculate hours elapsed since a reference time
   */
  hoursSince(reference: Date): number {
    const seconds = differenceInSeconds(this.currentTime, reference);
    return seconds / 3600;
  }

  /**
   * Get time history for debugging
   */
  getHistory(): TimeJump[] {
    return [...this.timeHistory];
  }

  /**
   * Clear time history
   */
  clearHistory(): void {
    this.timeHistory = [];
  }

  /**
   * Reset to start time
   */
  reset(): void {
    const from = new Date(this.currentTime);
    this.timeHistory.push({
      from,
      to: new Date(this._startTime),
      reason: 'reset',
    });
    this.currentTime = new Date(this._startTime);
  }

  // ========================================================================
  // DECAY TESTING HELPERS
  // ========================================================================

  /**
   * Calculate expected FSRS-6 retrievability at current time
   *
   * Uses FSRS-6 power forgetting curve:
   * R = (1 + factor * t / S)^(-w20)
   *
   * @param stability - Memory stability in days
   * @param lastReview - When the memory was last reviewed
   * @param w20 - Forgetting curve decay parameter (default: 0.1542)
   */
  expectedRetrievability(
    stability: number,
    lastReview: Date,
    w20: number = 0.1542
  ): number {
    const elapsedDays = this.daysSince(lastReview);
    if (stability <= 0) return 0;
    if (elapsedDays <= 0) return 1;

    // FSRS-6 formula: R = (1 + factor * t / S)^(-w20)
    const factor = Math.pow(0.9, -1 / w20) - 1;
    const r = Math.pow(1 + (factor * elapsedDays) / stability, -w20);
    return Math.max(0, Math.min(1, r));
  }

  /**
   * Check if a memory would be due for review at current time
   */
  isDue(nextReview: Date): boolean {
    return this.currentTime >= nextReview;
  }

  /**
   * Calculate how overdue a memory is (negative if not yet due)
   */
  daysOverdue(nextReview: Date): number {
    return this.daysSince(nextReview);
  }

  // ========================================================================
  // SCHEDULING HELPERS
  // ========================================================================

  /**
   * Advance to when a memory would be due
   */
  advanceToDue(nextReview: Date): void {
    const from = new Date(this.currentTime);
    this.timeHistory.push({
      from,
      to: new Date(nextReview),
      reason: 'advance_to_due',
    });
    this.currentTime = new Date(nextReview);
  }

  /**
   * Advance past due date by specified days
   */
  advancePastDue(nextReview: Date, daysOverdue: number): void {
    const target = addDays(nextReview, daysOverdue);
    const from = new Date(this.currentTime);
    this.timeHistory.push({
      from,
      to: new Date(target),
      reason: `advance_past_due +${daysOverdue} days`,
    });
    this.currentTime = target;
  }

  // ========================================================================
  // TEMPORAL VALIDITY HELPERS
  // ========================================================================

  /**
   * Check if a time is within a validity window
   */
  isWithinValidity(validFrom?: Date, validUntil?: Date): boolean {
    const afterStart = validFrom ? this.currentTime >= validFrom : true;
    const beforeEnd = validUntil ? this.currentTime <= validUntil : true;
    return afterStart && beforeEnd;
  }

  /**
   * Advance to just before validity starts
   */
  advanceToBeforeValidity(validFrom: Date): void {
    const target = addSeconds(validFrom, -1);
    this.setTime(target);
  }

  /**
   * Advance to just after validity ends
   */
  advanceToAfterValidity(validUntil: Date): void {
    const target = addSeconds(validUntil, 1);
    this.setTime(target);
  }
}

export default TimeTravelEnvironment;
