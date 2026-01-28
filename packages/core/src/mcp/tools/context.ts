/**
 * Context Tool
 *
 * Retrieve memories relevant to a specific context.
 * Uses multi-factor scoring: temporal, topical, project, and mood.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/context.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const ContextInputSchema = z.object({
  query: z.string().min(1).describe('The context query or description'),
  topics: z.array(z.string()).optional().describe('Related topics to boost'),
  project: z.string().optional().describe('Current project/codebase name'),
  mood: z.enum(['positive', 'negative', 'neutral']).optional().describe('Current mood context'),
  timeWeight: z.number().min(0).max(1).default(0.3).describe('Weight for temporal relevance'),
  topicWeight: z.number().min(0).max(1).default(0.4).describe('Weight for topic matching'),
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum results'),
});

export type ContextInput = z.infer<typeof ContextInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface ContextResultItem {
  id: string;
  content: string;
  summary: string | null;
  relevanceScore: number;
  temporalScore: number;
  topicScore: number;
  projectScore: number;
  moodScore: number;
  tags: string[];
  sourceType: string;
  createdAt: string;
}

export interface ContextOutput {
  query: string;
  context: {
    topics: string[];
    project: string | null;
    mood: string | null;
  };
  total: number;
  results: ContextResultItem[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default scoring weights */
const SCORE_WEIGHTS = {
  temporal: 0.3,
  topical: 0.4,
  project: 0.2,
  mood: 0.1,
};

/** Temporal decay half-life in days */
const TEMPORAL_HALF_LIFE_DAYS = 14;

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const contextToolDefinition = {
  name: 'context',
  description: 'Retrieve memories relevant to a specific context. Considers temporal relevance, topic matching, project context, and mood.',
  inputSchema: ContextInputSchema.shape,
};

// ============================================================================
// SCORING FUNCTIONS
// ============================================================================

function calculateTemporalScore(createdAt: Date): number {
  const now = Date.now();
  const daysSinceCreation = (now - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay with 14-day half-life
  return Math.pow(0.5, daysSinceCreation / TEMPORAL_HALF_LIFE_DAYS);
}

function calculateTopicScore(tags: string[], queryTopics: string[]): number {
  if (queryTopics.length === 0) return 0;

  const tagsLower = tags.map(t => t.toLowerCase());
  let matches = 0;

  for (const topic of queryTopics) {
    const topicLower = topic.toLowerCase();
    if (tagsLower.some(t => t.includes(topicLower) || topicLower.includes(t))) {
      matches++;
    }
  }

  return matches / queryTopics.length;
}

function calculateProjectScore(content: string, tags: string[], project: string | undefined): number {
  if (!project) return 0;

  const projectLower = project.toLowerCase();
  const contentLower = content.toLowerCase();
  const tagsLower = tags.map(t => t.toLowerCase());

  // Check if project name appears in content or tags
  if (contentLower.includes(projectLower)) return 1.0;
  if (tagsLower.some(t => t.includes(projectLower))) return 0.8;

  return 0;
}

function calculateMoodScore(sentimentIntensity: number, mood: string | undefined): number {
  if (!mood) return 0;

  // Map mood to expected sentiment
  // positive = high positive sentiment, negative = high negative sentiment
  // neutral = low sentiment either way
  switch (mood) {
    case 'positive':
      return sentimentIntensity; // High intensity positive content matches positive mood
    case 'negative':
      return sentimentIntensity; // High intensity content also relevant for negative mood
    case 'neutral':
      return 1 - sentimentIntensity; // Low intensity matches neutral mood
    default:
      return 0;
  }
}

// ============================================================================
// EXECUTE FUNCTION
// ============================================================================

export async function executeContext(
  db: VestigeDatabase,
  args: ContextInput
): Promise<ContextOutput> {
  const { query, topics, project, mood, timeWeight, topicWeight, limit } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
      };
    };
    updateNodeAccess: (id: string) => void;
  });

  // Calculate adjusted weights
  const totalWeight = timeWeight + topicWeight + SCORE_WEIGHTS.project + SCORE_WEIGHTS.mood;
  const normalizedWeights = {
    temporal: timeWeight / totalWeight,
    topical: topicWeight / totalWeight,
    project: SCORE_WEIGHTS.project / totalWeight,
    mood: SCORE_WEIGHTS.mood / totalWeight,
  };

  // Build query - get more candidates than needed for scoring
  const candidateLimit = limit * 3;

  let sql = `
    SELECT
      id,
      content,
      summary,
      tags,
      source_type,
      created_at,
      sentiment_intensity
    FROM knowledge_nodes
    WHERE retention_strength > 0.1
  `;

  // Add FTS matching if we have topics or query
  const searchTerms: string[] = [...(topics ?? [])];
  if (query) searchTerms.push(query);

  if (searchTerms.length > 0) {
    // Use LIKE for partial matching on content
    const likePattern = `%${query}%`;
    sql += ` AND (content LIKE ? OR summary LIKE ? OR tags LIKE ?)`;
  }

  sql += ` ORDER BY retention_strength DESC, last_accessed_at DESC LIMIT ?`;

  const params: unknown[] = [];
  if (searchTerms.length > 0) {
    const likePattern = `%${query}%`;
    params.push(likePattern, likePattern, likePattern);
  }
  params.push(candidateLimit);

  const rows = internalDb.db.prepare(sql).all(...params) as Array<{
    id: string;
    content: string;
    summary: string | null;
    tags: string;
    source_type: string;
    created_at: string;
    sentiment_intensity: number;
  }>;

  // Score and rank results
  const scoredResults: ContextResultItem[] = rows.map(row => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }

    const createdAt = new Date(row.created_at);

    // Calculate individual scores
    const temporalScore = calculateTemporalScore(createdAt);
    const topicScore = calculateTopicScore(tags, topics ?? []);
    const projectScore = calculateProjectScore(row.content, tags, project);
    const moodScore = calculateMoodScore(row.sentiment_intensity, mood);

    // Combined relevance score
    const relevanceScore =
      temporalScore * normalizedWeights.temporal +
      topicScore * normalizedWeights.topical +
      projectScore * normalizedWeights.project +
      moodScore * normalizedWeights.mood;

    return {
      id: row.id,
      content: row.content.slice(0, 500),
      summary: row.summary,
      relevanceScore,
      temporalScore,
      topicScore,
      projectScore,
      moodScore,
      tags,
      sourceType: row.source_type,
      createdAt: row.created_at,
    };
  });

  // Sort by relevance and take top results
  scoredResults.sort((a, b) => b.relevanceScore - a.relevanceScore);
  const topResults = scoredResults.slice(0, limit);

  // Update access for retrieved memories
  for (const result of topResults) {
    try {
      internalDb.updateNodeAccess(result.id);
    } catch {
      // Non-critical
    }
  }

  return {
    query,
    context: {
      topics: topics ?? [],
      project: project ?? null,
      mood: mood ?? null,
    },
    total: topResults.length,
    results: topResults,
  };
}
