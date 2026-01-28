/**
 * Review Tool
 *
 * Review memories using FSRS-6 spaced repetition algorithm.
 * Ratings: 1=Again, 2=Hard, 3=Good, 4=Easy
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/review.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';
import {
  FSRSScheduler,
  type FSRSState,
  type ReviewGrade,
  deserializeFSRSState,
  serializeFSRSState,
} from '../../core/fsrs.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const ReviewInputSchema = z.object({
  id: z.string().describe('The ID of the memory to review'),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]).describe('Rating: 1=Again (forgot), 2=Hard (difficult recall), 3=Good (normal recall), 4=Easy (effortless recall)'),
});

export type ReviewInput = z.infer<typeof ReviewInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface FSRSMetrics {
  difficulty: number;
  stability: number;
  retrievability: number;
  state: string;
  reps: number;
  lapses: number;
  interval: number;
}

export interface ReviewOutput {
  success: boolean;
  nodeId: string;
  rating: string;
  fsrs: FSRSMetrics;
  nextReview: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const RATING_NAMES: Record<number, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
};

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const reviewToolDefinition = {
  name: 'review',
  description: 'Review a memory using spaced repetition (FSRS-6 algorithm). Rate how well you remembered: 1=Again (forgot), 2=Hard, 3=Good, 4=Easy. Returns next review date.',
  inputSchema: ReviewInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeReview(
  db: VestigeDatabase,
  args: ReviewInput
): Promise<ReviewOutput> {
  const { id, rating } = args;

  // Access internal db
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
        run: (...args: unknown[]) => void;
      };
    };
  });

  // Get the memory
  const row = internalDb.db.prepare(`
    SELECT
      id,
      content,
      retention_strength,
      stability_factor,
      sentiment_intensity,
      next_review_date,
      review_count,
      last_accessed_at,
      created_at
    FROM knowledge_nodes
    WHERE id = ?
  `).get(id) as {
    id: string;
    content: string;
    retention_strength: number;
    stability_factor: number;
    sentiment_intensity: number;
    next_review_date: string | null;
    review_count: number;
    last_accessed_at: string;
    created_at: string;
  } | undefined;

  if (!row) {
    throw new Error(`Memory not found: ${id}`);
  }

  // Create FSRS scheduler
  const scheduler = new FSRSScheduler({
    enableSentimentBoost: true,
    enableFuzz: true,
  });

  // Build current FSRS state from node data
  // If this is a first review, create new state
  let currentState: FSRSState;
  const lastReview = row.next_review_date
    ? new Date(row.next_review_date)
    : new Date(row.last_accessed_at);

  if (row.review_count === 0) {
    // First review - create new card state
    currentState = scheduler.newCard();
  } else {
    // Reconstruct state from stored values
    currentState = {
      difficulty: Math.max(1, Math.min(10, 5 + (1 - row.retention_strength) * 5)),
      stability: row.stability_factor,
      state: row.retention_strength >= 0.7 ? 'Review' : 'Learning',
      reps: row.review_count,
      lapses: 0, // Would need to track this separately
      lastReview,
      scheduledDays: 0,
    };
  }

  // Calculate elapsed days since last review
  const elapsedDays = (Date.now() - lastReview.getTime()) / (1000 * 60 * 60 * 24);

  // Process the review
  const result = scheduler.review(
    currentState,
    rating as ReviewGrade,
    elapsedDays,
    row.sentiment_intensity
  );

  // Calculate next review date
  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + Math.round(result.interval));

  // Update the node in database
  const newRetentionStrength = result.retrievability;
  const newStabilityFactor = result.state.stability;

  internalDb.db.prepare(`
    UPDATE knowledge_nodes
    SET
      retention_strength = ?,
      stability_factor = ?,
      next_review_date = ?,
      review_count = review_count + 1,
      last_accessed_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    newRetentionStrength,
    newStabilityFactor,
    nextReviewDate.toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    id
  );

  return {
    success: true,
    nodeId: id,
    rating: RATING_NAMES[rating] ?? String(rating),
    fsrs: {
      difficulty: result.state.difficulty,
      stability: result.state.stability,
      retrievability: result.retrievability,
      state: result.state.state,
      reps: result.state.reps,
      lapses: result.state.lapses,
      interval: result.interval,
    },
    nextReview: nextReviewDate.toISOString(),
  };
}
