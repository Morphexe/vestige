/**
 * Reranker Module
 *
 * Post-processing for search results to apply:
 * - Recency decay (boost recent results)
 * - Retention boost (prioritize well-retained memories)
 * - Diversity scoring (avoid repetitive results)
 */

import type { SearchResult, RerankerConfig } from './types.js';

/** Default recency half-life in days */
const DEFAULT_RECENCY_HALF_LIFE = 30;
/** Default maximum retention boost (1.0 = 100% boost for retention=1) */
const DEFAULT_MAX_RETENTION_BOOST = 0.5;

/**
 * Calculate recency decay factor
 *
 * Uses exponential decay: factor = 2^(-t/halfLife)
 * where t is days since last access
 *
 * @param lastAccessedAt - Date of last access
 * @param halfLife - Number of days for 50% decay
 * @returns Decay factor between 0 and 1
 */
function calculateRecencyFactor(lastAccessedAt: Date, halfLife: number): number {
  const now = Date.now();
  const daysSinceAccess = (now - lastAccessedAt.getTime()) / (1000 * 60 * 60 * 24);

  // Exponential decay: 2^(-t/halfLife)
  return Math.pow(2, -daysSinceAccess / halfLife);
}

/**
 * Calculate retention boost factor
 *
 * Higher retention = higher boost
 * boost = retentionStrength * maxBoost
 *
 * @param retentionStrength - Current retention (0-1)
 * @param maxBoost - Maximum boost factor (default 0.5)
 * @returns Boost factor between 0 and maxBoost
 */
function calculateRetentionBoost(retentionStrength: number, maxBoost: number): number {
  return retentionStrength * maxBoost;
}

/**
 * Rerank search results
 *
 * Applies post-processing adjustments to search result scores.
 *
 * @param results - Original search results
 * @param config - Reranker configuration
 * @returns Reranked results sorted by adjusted score
 */
export function rerank(
  results: SearchResult[],
  config: RerankerConfig = {}
): SearchResult[] {
  const {
    applyRecencyDecay = true,
    applyRetentionBoost = true,
    recencyHalfLife = DEFAULT_RECENCY_HALF_LIFE,
    maxRetentionBoost = DEFAULT_MAX_RETENTION_BOOST,
  } = config;

  const reranked = results.map(result => {
    let adjustedScore = result.score;

    // Apply recency decay
    if (applyRecencyDecay) {
      const recencyFactor = calculateRecencyFactor(result.lastAccessedAt, recencyHalfLife);
      // Blend original score with recency: score * (0.7 + 0.3 * recency)
      adjustedScore = adjustedScore * (0.7 + 0.3 * recencyFactor);
    }

    // Apply retention boost
    if (applyRetentionBoost) {
      const retentionBoost = calculateRetentionBoost(result.retentionStrength, maxRetentionBoost);
      // Add boost: score * (1 + boost)
      adjustedScore = adjustedScore * (1 + retentionBoost);
    }

    return { ...result, score: adjustedScore };
  });

  // Sort by adjusted score descending
  reranked.sort((a, b) => b.score - a.score);

  return reranked;
}

/**
 * Apply Maximum Marginal Relevance (MMR) for diversity
 *
 * Reduces redundancy in results by penalizing items similar to
 * already-selected items.
 *
 * @param results - Search results with similarity scores
 * @param lambda - Balance between relevance (1.0) and diversity (0.0)
 * @param limit - Number of results to return
 * @returns Diverse subset of results
 */
export function applyMMR(
  results: SearchResult[],
  lambda: number = 0.7,
  limit: number = 10
): SearchResult[] {
  if (results.length <= limit) {
    return results;
  }

  const selected: SearchResult[] = [];
  const remaining = [...results];

  // First result is always the most relevant
  const first = remaining.shift();
  if (first) {
    selected.push(first);
  }

  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestMMRScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]!;

      // Find max similarity to any selected item
      // Using simple content overlap as proxy for similarity
      let maxSimToSelected = 0;
      for (const s of selected) {
        const contentSim = calculateContentSimilarity(candidate.content, s.content);
        maxSimToSelected = Math.max(maxSimToSelected, contentSim);
      }

      // MMR score: λ * relevance - (1-λ) * max_sim_to_selected
      const mmrScore = lambda * candidate.score - (1 - lambda) * maxSimToSelected;

      if (mmrScore > bestMMRScore) {
        bestMMRScore = mmrScore;
        bestIdx = i;
      }
    }

    // Add best candidate
    const best = remaining.splice(bestIdx, 1)[0];
    if (best) {
      selected.push(best);
    }
  }

  return selected;
}

/**
 * Simple content similarity using Jaccard index of words
 */
function calculateContentSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * Boost results containing specific keywords
 *
 * @param results - Search results
 * @param keywords - Keywords to boost
 * @param boostFactor - How much to boost (default 1.5x)
 * @returns Results with boosted scores for keyword matches
 */
export function boostKeywords(
  results: SearchResult[],
  keywords: string[],
  boostFactor: number = 1.5
): SearchResult[] {
  const lowercaseKeywords = keywords.map(k => k.toLowerCase());

  return results.map(result => {
    const contentLower = result.content.toLowerCase();
    const hasKeyword = lowercaseKeywords.some(k => contentLower.includes(k));

    if (hasKeyword) {
      return { ...result, score: result.score * boostFactor };
    }
    return result;
  });
}

/**
 * Filter results by time window
 *
 * @param results - Search results
 * @param daysAgo - Maximum days since creation
 * @returns Filtered results within time window
 */
export function filterByTimeWindow(
  results: SearchResult[],
  daysAgo: number
): SearchResult[] {
  const cutoff = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

  return results.filter(r => r.createdAt.getTime() >= cutoff);
}

/**
 * Group results by source type
 */
export function groupBySourceType(
  results: SearchResult[]
): Map<string, SearchResult[]> {
  const groups = new Map<string, SearchResult[]>();

  for (const result of results) {
    const existing = groups.get(result.sourceType) ?? [];
    existing.push(result);
    groups.set(result.sourceType, existing);
  }

  return groups;
}

/**
 * Interleave results from multiple sources for diversity
 *
 * Takes turns picking from each source type to ensure variety.
 */
export function interleaveBySource(
  results: SearchResult[],
  limit: number = 10
): SearchResult[] {
  const groups = groupBySourceType(results);
  const sourceTypes = Array.from(groups.keys());

  if (sourceTypes.length <= 1) {
    return results.slice(0, limit);
  }

  const interleaved: SearchResult[] = [];
  let sourceIdx = 0;

  while (interleaved.length < limit) {
    const sourceType = sourceTypes[sourceIdx % sourceTypes.length]!;
    const sourceResults = groups.get(sourceType)!;

    if (sourceResults.length > 0) {
      interleaved.push(sourceResults.shift()!);
    }

    // Check if all sources are exhausted
    const totalRemaining = Array.from(groups.values()).reduce(
      (sum, arr) => sum + arr.length,
      0
    );
    if (totalRemaining === 0) {
      break;
    }

    sourceIdx++;
  }

  return interleaved;
}
