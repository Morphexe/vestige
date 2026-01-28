/**
 * Test Data Factory
 *
 * Provides utilities for generating realistic test data:
 * - Memory nodes with various properties
 * - Batch generation for stress testing
 * - Pre-built scenarios for common test cases
 */

import type { KnowledgeNodeInput } from '../../core/types.js';
import { addDays } from 'date-fns';

/**
 * Configuration for batch memory generation
 */
export interface BatchConfig {
  /** Number of memories to create */
  count: number;
  /** Node type to use (undefined = rotate through types) */
  nodeType?: string;
  /** Base content prefix */
  contentPrefix: string;
  /** Tags to apply */
  tags: string[];
  /** Whether to add sentiment */
  withSentiment: boolean;
  /** Whether to add temporal validity */
  withTemporal: boolean;
}

/**
 * Scenario containing related test data
 */
export interface TestScenario {
  /** Input data for created nodes */
  inputs: KnowledgeNodeInput[];
  /** Description of the scenario */
  description: string;
  /** Metadata for test assertions */
  metadata: Record<string, string>;
}

/**
 * Available node types for testing
 */
const NODE_TYPES = ['fact', 'concept', 'procedure', 'event', 'code'] as const;

/**
 * Extended node types
 */
const ALL_NODE_TYPES = [
  'fact',
  'concept',
  'procedure',
  'event',
  'relationship',
  'quote',
  'code',
  'question',
  'insight',
] as const;

/**
 * Sample tags for testing
 */
const SAMPLE_TAGS = [
  'important',
  'review',
  'todo',
  'concept',
  'fact',
  'code',
  'note',
  'idea',
  'question',
  'reference',
] as const;

/**
 * Lorem-style words for content generation
 */
const LOREM_WORDS = [
  'the',
  'memory',
  'learning',
  'knowledge',
  'algorithm',
  'data',
  'system',
  'process',
  'function',
  'method',
  'class',
  'object',
  'variable',
  'constant',
  'type',
  'structure',
  'pattern',
  'design',
  'architecture',
  'code',
] as const;

/**
 * Default batch configuration
 */
export const defaultBatchConfig: BatchConfig = {
  count: 10,
  nodeType: undefined,
  contentPrefix: 'Test memory',
  tags: [],
  withSentiment: false,
  withTemporal: false,
};

/**
 * Factory for creating test data
 */
export class TestDataFactory {
  // ========================================================================
  // SINGLE MEMORY CREATION
  // ========================================================================

  /**
   * Create a simple memory input
   */
  static createMemory(content: string): KnowledgeNodeInput {
    return {
      content,
      sourceType: 'manual',
      sourcePlatform: 'test',
      tags: [],
      people: [],
      concepts: [],
      events: [],
    };
  }

  /**
   * Create a memory with full configuration
   */
  static createMemoryFull(
    content: string,
    nodeType: string,
    source: string | undefined,
    tags: string[],
    sentimentScore: number,
    sentimentMagnitude: number
  ): KnowledgeNodeInput {
    return {
      content,
      sourceType: nodeType,
      sourcePlatform: source ?? 'test',
      tags,
      people: [],
      concepts: [],
      events: [],
      // Note: sentiment fields would need to be added to KnowledgeNodeInput if not present
    };
  }

  /**
   * Create a memory with temporal validity
   */
  static createTemporalMemory(
    content: string,
    validFrom?: Date,
    validUntil?: Date
  ): KnowledgeNodeInput & { validFrom?: Date; validUntil?: Date } {
    return {
      content,
      sourceType: 'fact',
      sourcePlatform: 'test',
      tags: [],
      people: [],
      concepts: [],
      events: [],
      validFrom,
      validUntil,
    };
  }

  /**
   * Create an emotional memory
   */
  static createEmotionalMemory(
    content: string,
    sentiment: number,
    magnitude: number
  ): KnowledgeNodeInput & { sentimentScore: number; sentimentMagnitude: number } {
    return {
      content,
      sourceType: 'event',
      sourcePlatform: 'test',
      tags: [],
      people: [],
      concepts: [],
      events: [],
      sentimentScore: sentiment,
      sentimentMagnitude: magnitude,
    };
  }

  // ========================================================================
  // BATCH CREATION
  // ========================================================================

  /**
   * Create a batch of memories
   */
  static createBatch(count: number): KnowledgeNodeInput[] {
    return this.createBatchWithConfig({ ...defaultBatchConfig, count });
  }

  /**
   * Create a batch with custom configuration
   */
  static createBatchWithConfig(config: Partial<BatchConfig>): KnowledgeNodeInput[] {
    const cfg: BatchConfig = { ...defaultBatchConfig, ...config };
    const inputs: KnowledgeNodeInput[] = [];

    for (let i = 0; i < cfg.count; i++) {
      const nodeType = cfg.nodeType ?? NODE_TYPES[i % NODE_TYPES.length];

      const sentimentScore = cfg.withSentiment
        ? (i / cfg.count) * 2 - 1 // Range from -1 to 1
        : 0;

      const sentimentMagnitude = cfg.withSentiment ? i / cfg.count : 0;

      let validFrom: Date | undefined;
      let validUntil: Date | undefined;

      if (cfg.withTemporal) {
        const now = new Date();
        if (i % 3 === 0) {
          validFrom = addDays(now, -30);
          validUntil = addDays(now, 30);
        } else if (i % 3 === 1) {
          validFrom = addDays(now, -60);
          validUntil = addDays(now, -30);
        }
        // else: no temporal validity
      }

      inputs.push({
        content: `${cfg.contentPrefix} ${i}`,
        sourceType: nodeType,
        sourcePlatform: 'test',
        tags: cfg.tags,
        people: [],
        concepts: [],
        events: [],
        // Extended fields
        ...(cfg.withSentiment && { sentimentScore, sentimentMagnitude }),
        ...(validFrom && { validFrom }),
        ...(validUntil && { validUntil }),
      } as KnowledgeNodeInput);
    }

    return inputs;
  }

  // ========================================================================
  // SCENARIO CREATION
  // ========================================================================

  /**
   * Create a scenario for testing memory decay
   */
  static createDecayScenario(): TestScenario {
    const inputs: KnowledgeNodeInput[] = [];
    const metadata: Record<string, string> = {};

    // High stability memory (should decay slowly)
    inputs.push({
      content: 'Well-learned fact about photosynthesis',
      sourceType: 'fact',
      sourcePlatform: 'biology textbook',
      tags: ['biology', 'science'],
      people: [],
      concepts: [],
      events: [],
    });
    metadata['high_stability'] = '0';

    // Low stability memory (should decay quickly)
    inputs.push({
      content: 'Random fact I just learned',
      sourceType: 'fact',
      sourcePlatform: 'test',
      tags: [],
      people: [],
      concepts: [],
      events: [],
    });
    metadata['low_stability'] = '1';

    // Emotional memory (decay should be affected by sentiment)
    inputs.push({
      content: 'Important life event',
      sourceType: 'event',
      sourcePlatform: 'test',
      tags: [],
      people: [],
      concepts: [],
      events: [],
    } as KnowledgeNodeInput);
    metadata['emotional'] = '2';

    return {
      inputs,
      description: 'Decay testing scenario with varied stability',
      metadata,
    };
  }

  /**
   * Create a scenario for testing review scheduling
   */
  static createSchedulingScenario(): TestScenario {
    const inputs: KnowledgeNodeInput[] = [];
    const metadata: Record<string, string> = {};

    // New card (never reviewed)
    inputs.push(this.createMemory('Brand new memory'));
    metadata['new'] = '0';

    // Learning card (few reviews)
    inputs.push(this.createMemory('Learning memory'));
    metadata['learning'] = '1';

    // Review card (many reviews)
    inputs.push(this.createMemory('Well-reviewed memory'));
    metadata['review'] = '2';

    // Relearning card (had lapses)
    inputs.push(this.createMemory('Struggling memory'));
    metadata['relearning'] = '3';

    return {
      inputs,
      description: 'Scheduling scenario with cards in different learning states',
      metadata,
    };
  }

  /**
   * Create a scenario for testing search
   */
  static createSearchScenario(): TestScenario {
    const inputs: KnowledgeNodeInput[] = [];
    const metadata: Record<string, string> = {};

    // Programming memories
    const programmingContent = [
      'Rust programming language uses ownership for memory safety',
      'Python is great for data science and machine learning',
      'JavaScript runs in web browsers and Node.js',
    ];

    for (const content of programmingContent) {
      inputs.push({
        content,
        sourceType: 'fact',
        sourcePlatform: 'programming docs',
        tags: ['programming', 'code'],
        people: [],
        concepts: [],
        events: [],
      });
    }
    metadata['programming_count'] = '3';

    // Science memories
    const scienceContent = [
      'Mitochondria is the powerhouse of the cell',
      'DNA contains genetic information',
      'Gravity is the force of attraction between masses',
    ];

    for (const content of scienceContent) {
      inputs.push({
        content,
        sourceType: 'fact',
        sourcePlatform: 'science textbook',
        tags: ['science'],
        people: [],
        concepts: [],
        events: [],
      });
    }
    metadata['science_count'] = '3';

    // Recipe memories
    const recipeContent = [
      'To make pasta, boil water and add salt',
      'Chocolate cake requires cocoa powder and eggs',
    ];

    for (const content of recipeContent) {
      inputs.push({
        content,
        sourceType: 'procedure',
        sourcePlatform: 'cookbook',
        tags: ['cooking', 'recipes'],
        people: [],
        concepts: [],
        events: [],
      });
    }
    metadata['recipe_count'] = '2';

    return {
      inputs,
      description: 'Search scenario with categorized content',
      metadata,
    };
  }

  /**
   * Create a scenario for testing temporal queries
   */
  static createTemporalScenario(): TestScenario {
    const now = new Date();
    const inputs: Array<KnowledgeNodeInput & { validFrom?: Date; validUntil?: Date }> = [];
    const metadata: Record<string, string> = {};

    // Currently valid
    inputs.push(
      this.createTemporalMemory(
        'Currently valid memory',
        addDays(now, -10),
        addDays(now, 10)
      )
    );
    metadata['current'] = '0';

    // Expired
    inputs.push(
      this.createTemporalMemory('Expired memory', addDays(now, -60), addDays(now, -30))
    );
    metadata['expired'] = '1';

    // Future
    inputs.push(
      this.createTemporalMemory('Future memory', addDays(now, 30), addDays(now, 60))
    );
    metadata['future'] = '2';

    // No bounds (always valid)
    inputs.push(this.createTemporalMemory('Always valid memory'));
    metadata['always_valid'] = '3';

    return {
      inputs: inputs as KnowledgeNodeInput[],
      description: 'Temporal scenario with different validity periods',
      metadata,
    };
  }

  // ========================================================================
  // UTILITY METHODS
  // ========================================================================

  /**
   * Get a random node type
   */
  static randomNodeType(seed: number): string {
    return ALL_NODE_TYPES[seed % ALL_NODE_TYPES.length];
  }

  /**
   * Generate lorem ipsum-like content
   */
  static loremContent(words: number, seed: number): string {
    const result: string[] = [];
    for (let i = 0; i < words; i++) {
      result.push(LOREM_WORDS[(seed + i * 7) % LOREM_WORDS.length]);
    }
    return result.join(' ');
  }

  /**
   * Generate tags
   */
  static generateTags(count: number, seed: number): string[] {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      result.push(SAMPLE_TAGS[(seed + i) % SAMPLE_TAGS.length]);
    }
    return result;
  }
}

export default TestDataFactory;
