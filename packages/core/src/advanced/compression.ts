/**
 * Semantic Compression Module
 *
 * Implements memory compression strategies:
 * - Summarization: Condense verbose memories into key points
 * - Generalization: Abstract patterns from specific instances
 * - Deduplication: Merge overlapping memories
 *
 * This helps manage memory storage while preserving essential information.
 */

import { nanoid } from 'nanoid';

/** Types of compression strategies */
export enum CompressionStrategy {
  /** Reduce to key points */
  Summarize = 'summarize',
  /** Extract general patterns */
  Generalize = 'generalize',
  /** Remove redundant information */
  Deduplicate = 'deduplicate',
  /** Hierarchical compression */
  Hierarchical = 'hierarchical',
  /** Time-based compression (older = more compressed) */
  Temporal = 'temporal',
}

/** Compression level */
export enum CompressionLevel {
  /** No compression */
  None = 'none',
  /** Light compression - preserve most detail */
  Light = 'light',
  /** Moderate compression */
  Moderate = 'moderate',
  /** Heavy compression - only key facts */
  Heavy = 'heavy',
  /** Maximum compression - bare essentials */
  Maximum = 'maximum',
}

/** Get target ratio for compression level */
export function getTargetRatio(level: CompressionLevel): number {
  switch (level) {
    case CompressionLevel.None:
      return 1.0;
    case CompressionLevel.Light:
      return 0.8;
    case CompressionLevel.Moderate:
      return 0.5;
    case CompressionLevel.Heavy:
      return 0.3;
    case CompressionLevel.Maximum:
      return 0.1;
  }
}

/** Memory candidate for compression */
export interface CompressionCandidate {
  memoryId: string;
  content: string;
  importance: number;
  lastAccessed: Date;
  createdAt: Date;
  wordCount: number;
  accessCount: number;
}

/** Result of compression */
export interface CompressionResult {
  id: string;
  sourceMemoryIds: string[];
  originalContent: string[];
  compressedContent: string;
  strategy: CompressionStrategy;
  compressionRatio: number;
  preservedKeywords: string[];
  lostInformation: string[];
  timestamp: Date;
}

/** Compression configuration */
export interface CompressionConfig {
  minContentLength: number;
  maxCompressedLength: number;
  keywordPreservationRatio: number;
  minImportanceForPreservation: number;
  ageDaysForCompression: number;
}

/** Default compression configuration */
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  minContentLength: 100,
  maxCompressedLength: 500,
  keywordPreservationRatio: 0.3,
  minImportanceForPreservation: 0.7,
  ageDaysForCompression: 30,
};

/**
 * Extract keywords from content
 */
export function extractKeywords(content: string, limit: number = 10): string[] {
  const words = content.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 4)
    .filter(w => !STOP_WORDS.has(w));

  // Count word frequency
  const counts = new Map<string, number>();
  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  // Sort by frequency and return top words
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

/** Common stop words to filter out */
const STOP_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i',
  'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at',
  'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she',
  'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what',
  'so', 'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me',
  'when', 'make', 'can', 'like', 'time', 'just', 'him', 'know', 'take', 'people',
  'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
  'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
  'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'been', 'should',
]);

/**
 * Simple summarization by extracting important sentences
 */
export function simpleSummarize(content: string, targetRatio: number): string {
  const sentences = content
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (sentences.length === 0) return content;

  const targetCount = Math.max(1, Math.ceil(sentences.length * targetRatio));

  // Score sentences by keyword density and position
  const keywords = new Set(extractKeywords(content, 20));

  const scored = sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().split(/\s+/);
    const keywordCount = words.filter(w => keywords.has(w)).length;
    const positionScore = 1 - (index / sentences.length) * 0.5; // Earlier sentences score higher

    return {
      sentence,
      score: (keywordCount / words.length) * positionScore,
    };
  });

  // Sort by score and take top sentences
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, targetCount);

  // Re-sort by original position
  selected.sort((a, b) =>
    sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence)
  );

  return selected.map(s => s.sentence).join('. ') + '.';
}

/**
 * Find overlapping content between memories
 */
export function findOverlap(content1: string, content2: string): {
  overlap: string[];
  unique1: string[];
  unique2: string[];
} {
  const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  const overlap: string[] = [];
  const unique1: string[] = [];
  const unique2: string[] = [];

  for (const word of words1) {
    if (words2.has(word)) {
      overlap.push(word);
    } else {
      unique1.push(word);
    }
  }

  for (const word of words2) {
    if (!words1.has(word)) {
      unique2.push(word);
    }
  }

  return { overlap, unique1, unique2 };
}

/**
 * Merge overlapping content
 */
export function mergeContent(
  content1: string,
  content2: string,
  preserveKeywords: string[] = []
): string {
  const sentences1 = content1.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
  const sentences2 = content2.split(/[.!?]+/).map(s => s.trim()).filter(s => s);

  const preserveSet = new Set(preserveKeywords.map(k => k.toLowerCase()));
  const seen = new Set<string>();
  const result: string[] = [];

  const addSentence = (sentence: string) => {
    const normalized = sentence.toLowerCase().trim();
    if (seen.has(normalized)) return;

    // Check for very similar sentences
    let isDuplicate = false;
    for (const existing of seen) {
      const words1 = new Set(normalized.split(/\s+/));
      const words2 = new Set(existing.split(/\s+/));
      let overlap = 0;
      for (const w of words1) {
        if (words2.has(w)) overlap++;
      }
      if (overlap / Math.max(words1.size, words2.size) > 0.8) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.add(normalized);
      result.push(sentence);
    }
  };

  // Add sentences, prioritizing those with preserved keywords
  const allSentences = [...sentences1, ...sentences2];
  const withKeywords: string[] = [];
  const withoutKeywords: string[] = [];

  for (const sentence of allSentences) {
    const lower = sentence.toLowerCase();
    if ([...preserveSet].some(k => lower.includes(k))) {
      withKeywords.push(sentence);
    } else {
      withoutKeywords.push(sentence);
    }
  }

  for (const sentence of withKeywords) {
    addSentence(sentence);
  }
  for (const sentence of withoutKeywords) {
    addSentence(sentence);
  }

  return result.join('. ') + (result.length > 0 ? '.' : '');
}

/**
 * Semantic Compression Engine
 *
 * Compresses memories to reduce storage while preserving meaning.
 */
export class CompressionEngine {
  private config: CompressionConfig;
  private compressionHistory: CompressionResult[] = [];

  constructor(config?: Partial<CompressionConfig>) {
    this.config = { ...DEFAULT_COMPRESSION_CONFIG, ...config };
  }

  /**
   * Check if a memory should be compressed
   */
  shouldCompress(candidate: CompressionCandidate): boolean {
    // Don't compress short content
    if (candidate.wordCount < this.config.minContentLength) {
      return false;
    }

    // Don't compress high importance memories
    if (candidate.importance >= this.config.minImportanceForPreservation) {
      return false;
    }

    // Compress old, rarely accessed memories
    const ageDays = (Date.now() - candidate.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < this.config.ageDaysForCompression) {
      return false;
    }

    return true;
  }

  /**
   * Select compression level based on memory characteristics
   */
  selectCompressionLevel(candidate: CompressionCandidate): CompressionLevel {
    const ageDays = (Date.now() - candidate.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const accessFrequency = candidate.accessCount / Math.max(1, ageDays);

    // High importance or recent access = less compression
    if (candidate.importance > 0.6 || accessFrequency > 0.1) {
      return CompressionLevel.Light;
    }

    // Old and rarely accessed = more compression
    if (ageDays > 90 && accessFrequency < 0.01) {
      return CompressionLevel.Heavy;
    }

    if (ageDays > 180 && accessFrequency < 0.005) {
      return CompressionLevel.Maximum;
    }

    return CompressionLevel.Moderate;
  }

  /**
   * Compress a single memory
   */
  compress(
    candidate: CompressionCandidate,
    level?: CompressionLevel,
    strategy: CompressionStrategy = CompressionStrategy.Summarize
  ): CompressionResult {
    const compressionLevel = level ?? this.selectCompressionLevel(candidate);
    const targetRatio = getTargetRatio(compressionLevel);

    let compressedContent: string;
    const preservedKeywords = extractKeywords(candidate.content,
      Math.ceil(10 * this.config.keywordPreservationRatio));

    switch (strategy) {
      case CompressionStrategy.Summarize:
        compressedContent = simpleSummarize(candidate.content, targetRatio);
        break;
      case CompressionStrategy.Generalize:
        compressedContent = this.generalize(candidate.content, preservedKeywords);
        break;
      default:
        compressedContent = simpleSummarize(candidate.content, targetRatio);
    }

    // Ensure max length
    if (compressedContent.length > this.config.maxCompressedLength) {
      compressedContent = compressedContent.slice(0, this.config.maxCompressedLength) + '...';
    }

    const originalWordCount = candidate.content.split(/\s+/).length;
    const compressedWordCount = compressedContent.split(/\s+/).length;

    const result: CompressionResult = {
      id: nanoid(),
      sourceMemoryIds: [candidate.memoryId],
      originalContent: [candidate.content],
      compressedContent,
      strategy,
      compressionRatio: compressedWordCount / originalWordCount,
      preservedKeywords,
      lostInformation: this.identifyLostInformation(
        candidate.content,
        compressedContent,
        preservedKeywords
      ),
      timestamp: new Date(),
    };

    this.compressionHistory.push(result);
    return result;
  }

  /**
   * Compress multiple memories into one
   */
  compressMultiple(
    candidates: CompressionCandidate[],
    strategy: CompressionStrategy = CompressionStrategy.Deduplicate
  ): CompressionResult {
    if (candidates.length === 0) {
      throw new Error('No candidates provided for compression');
    }

    if (candidates.length === 1) {
      return this.compress(candidates[0]!);
    }

    // Combine all keywords
    const allKeywords: string[] = [];
    for (const c of candidates) {
      allKeywords.push(...extractKeywords(c.content));
    }
    const preservedKeywords = [...new Set(allKeywords)].slice(0, 20);

    // Merge content
    let combinedContent = candidates[0]!.content;
    for (let i = 1; i < candidates.length; i++) {
      combinedContent = mergeContent(combinedContent, candidates[i]!.content, preservedKeywords);
    }

    // Summarize the merged content
    const targetRatio = 0.5;
    const compressedContent = simpleSummarize(combinedContent, targetRatio);

    const totalOriginalWords = candidates.reduce(
      (sum, c) => sum + c.content.split(/\s+/).length,
      0
    );
    const compressedWords = compressedContent.split(/\s+/).length;

    const result: CompressionResult = {
      id: nanoid(),
      sourceMemoryIds: candidates.map(c => c.memoryId),
      originalContent: candidates.map(c => c.content),
      compressedContent,
      strategy,
      compressionRatio: compressedWords / totalOriginalWords,
      preservedKeywords,
      lostInformation: [],
      timestamp: new Date(),
    };

    this.compressionHistory.push(result);
    return result;
  }

  /**
   * Generalize content by abstracting patterns
   */
  private generalize(content: string, keywords: string[]): string {
    // Simple generalization: Keep sentences with keywords, make them more general
    const sentences = content.split(/[.!?]+/).map(s => s.trim()).filter(s => s);
    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

    const generalizedSentences: string[] = [];
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      if ([...keywordSet].some(k => lower.includes(k))) {
        generalizedSentences.push(sentence);
      }
    }

    if (generalizedSentences.length === 0) {
      return simpleSummarize(content, 0.3);
    }

    return generalizedSentences.join('. ') + '.';
  }

  /**
   * Identify information lost during compression
   */
  private identifyLostInformation(
    original: string,
    compressed: string,
    preservedKeywords: string[]
  ): string[] {
    const originalWords = new Set(original.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const compressedWords = new Set(compressed.toLowerCase().split(/\s+/).filter(w => w.length > 4));
    const preservedSet = new Set(preservedKeywords.map(k => k.toLowerCase()));

    const lost: string[] = [];
    for (const word of originalWords) {
      if (!compressedWords.has(word) && !preservedSet.has(word) && !STOP_WORDS.has(word)) {
        lost.push(word);
      }
    }

    return lost.slice(0, 20);
  }

  /**
   * Get compression history
   */
  getHistory(): CompressionResult[] {
    return [...this.compressionHistory];
  }

  /**
   * Get compression statistics
   */
  getStats(): {
    totalCompressions: number;
    avgCompressionRatio: number;
    totalSpaceSaved: number;
    strategyDistribution: Record<CompressionStrategy, number>;
  } {
    const totalCompressions = this.compressionHistory.length;

    if (totalCompressions === 0) {
      return {
        totalCompressions: 0,
        avgCompressionRatio: 0,
        totalSpaceSaved: 0,
        strategyDistribution: {
          [CompressionStrategy.Summarize]: 0,
          [CompressionStrategy.Generalize]: 0,
          [CompressionStrategy.Deduplicate]: 0,
          [CompressionStrategy.Hierarchical]: 0,
          [CompressionStrategy.Temporal]: 0,
        },
      };
    }

    let totalRatio = 0;
    let totalOriginalLength = 0;
    let totalCompressedLength = 0;
    const strategyDistribution: Record<CompressionStrategy, number> = {
      [CompressionStrategy.Summarize]: 0,
      [CompressionStrategy.Generalize]: 0,
      [CompressionStrategy.Deduplicate]: 0,
      [CompressionStrategy.Hierarchical]: 0,
      [CompressionStrategy.Temporal]: 0,
    };

    for (const result of this.compressionHistory) {
      totalRatio += result.compressionRatio;
      totalOriginalLength += result.originalContent.reduce((sum, c) => sum + c.length, 0);
      totalCompressedLength += result.compressedContent.length;
      strategyDistribution[result.strategy]++;
    }

    return {
      totalCompressions,
      avgCompressionRatio: totalRatio / totalCompressions,
      totalSpaceSaved: totalOriginalLength - totalCompressedLength,
      strategyDistribution,
    };
  }

  /**
   * Clear compression history
   */
  clearHistory(): void {
    this.compressionHistory = [];
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CompressionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): CompressionConfig {
    return { ...this.config };
  }
}
