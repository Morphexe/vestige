/**
 * Tests for Test Harness Utilities
 *
 * Validates the test infrastructure:
 * - TimeTravelEnvironment for temporal testing
 * - MockEmbeddingService for deterministic embeddings
 * - TestDataFactory for generating fixtures
 * - Custom assertions
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  TimeTravelEnvironment,
  MockEmbeddingService,
  MOCK_EMBEDDING_DIM,
  TestDataFactory,
  assertApproxEqual,
  assertInRange,
  assertValidRetrievability,
  assertValidDifficulty,
  assertValidStability,
  assertNormalizedEmbedding,
  assertEmbeddingDimension,
  assertSemanticSimilarity,
  AssertionError,
} from '../test/index.js';
import { addDays } from 'date-fns';

// =============================================================================
// TIME TRAVEL ENVIRONMENT TESTS
// =============================================================================

describe('TimeTravelEnvironment', () => {
  let env: TimeTravelEnvironment;

  beforeEach(() => {
    env = new TimeTravelEnvironment();
  });

  describe('basic operations', () => {
    it('should start at current time', () => {
      const now = new Date();
      const envTime = env.now();
      // Within 100ms is acceptable
      expect(Math.abs(now.getTime() - envTime.getTime())).toBeLessThan(100);
    });

    it('should create at specific time', () => {
      const specificTime = new Date('2024-01-15T10:00:00Z');
      const specificEnv = TimeTravelEnvironment.at(specificTime);
      expect(specificEnv.now().toISOString()).toBe(specificTime.toISOString());
    });

    it('should advance days', () => {
      const start = env.now();
      env.advanceDays(10);
      const elapsed = env.daysSince(start);
      expect(elapsed).toBeCloseTo(10, 1);
    });

    it('should advance hours', () => {
      const start = env.now();
      env.advanceHours(12);
      const elapsed = env.hoursSince(start);
      expect(elapsed).toBeCloseTo(12, 1);
    });

    it('should advance minutes', () => {
      const start = env.now();
      env.advanceMinutes(30);
      const elapsed = env.daysSince(start);
      expect(elapsed).toBeCloseTo(30 / (24 * 60), 4);
    });

    it('should advance seconds', () => {
      const start = env.now();
      env.advanceSeconds(3600); // 1 hour
      const elapsed = env.hoursSince(start);
      expect(elapsed).toBeCloseTo(1, 2);
    });

    it('should track history', () => {
      env.advanceDays(1);
      env.advanceHours(12);
      env.advanceMinutes(30);

      const history = env.getHistory();
      expect(history.length).toBe(3);
    });

    it('should clear history', () => {
      env.advanceDays(1);
      env.clearHistory();
      expect(env.getHistory().length).toBe(0);
    });

    it('should reset to start time', () => {
      const start = env.startTime();
      env.advanceDays(100);
      env.reset();
      expect(env.now().toISOString()).toBe(start.toISOString());
    });
  });

  describe('decay testing helpers', () => {
    it('should calculate expected retrievability', () => {
      const lastReview = env.now();
      const stability = 10;

      // At t=0, R should be 1
      expect(env.expectedRetrievability(stability, lastReview)).toBeCloseTo(1, 2);

      // After some days, R should decrease
      env.advanceDays(10);
      const r = env.expectedRetrievability(stability, lastReview);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
    });

    it('should check due status', () => {
      const nextReview = addDays(env.now(), 5);

      expect(env.isDue(nextReview)).toBe(false);
      expect(env.daysOverdue(nextReview)).toBeLessThan(0);

      env.advanceToDue(nextReview);
      expect(env.isDue(nextReview)).toBe(true);

      env.advanceDays(3);
      expect(env.daysOverdue(nextReview)).toBeCloseTo(3, 1);
    });

    it('should advance past due', () => {
      const nextReview = addDays(env.now(), 5);
      env.advancePastDue(nextReview, 10);
      expect(env.daysOverdue(nextReview)).toBeCloseTo(10, 1);
    });
  });

  describe('temporal validity helpers', () => {
    it('should check within validity', () => {
      const now = env.now();
      const validFrom = addDays(now, -10);
      const validUntil = addDays(now, 10);

      expect(env.isWithinValidity(validFrom, validUntil)).toBe(true);

      env.advanceToBeforeValidity(validFrom);
      expect(env.isWithinValidity(validFrom, validUntil)).toBe(false);
    });

    it('should handle undefined bounds', () => {
      expect(env.isWithinValidity(undefined, undefined)).toBe(true);
      expect(env.isWithinValidity(addDays(env.now(), -10), undefined)).toBe(true);
      expect(env.isWithinValidity(undefined, addDays(env.now(), 10))).toBe(true);
    });

    it('should advance to after validity', () => {
      const validUntil = addDays(env.now(), 5);
      env.advanceToAfterValidity(validUntil);
      expect(env.isWithinValidity(undefined, validUntil)).toBe(false);
    });
  });
});

// =============================================================================
// MOCK EMBEDDING SERVICE TESTS
// =============================================================================

describe('MockEmbeddingService', () => {
  let service: MockEmbeddingService;

  beforeEach(() => {
    service = new MockEmbeddingService();
  });

  describe('embedding generation', () => {
    it('should generate embeddings of correct dimension', () => {
      const emb = service.embed('test text');
      expect(emb.length).toBe(MOCK_EMBEDDING_DIM);
    });

    it('should be deterministic', () => {
      const emb1 = service.embed('hello world');
      const emb2 = service.embed('hello world');
      expect(emb1).toEqual(emb2);
    });

    it('should produce different embeddings for different text', () => {
      const emb1 = service.embed('hello world');
      const emb2 = service.embed('goodbye universe');
      expect(emb1).not.toEqual(emb2);
    });

    it('should produce normalized embeddings', () => {
      const emb = service.embed('test normalization');
      let norm = 0;
      for (const v of emb) {
        norm += v * v;
      }
      norm = Math.sqrt(norm);
      expect(norm).toBeCloseTo(1, 3);
    });

    it('should handle empty text', () => {
      const emb = service.embed('');
      expect(emb.length).toBe(MOCK_EMBEDDING_DIM);
    });
  });

  describe('similarity calculations', () => {
    it('should return 1 for self-similarity', () => {
      const emb = service.embed('self similarity test');
      const sim = service.cosineSimilarity(emb, emb);
      expect(sim).toBeCloseTo(1, 3);
    });

    it('should return similarity in valid range', () => {
      const emb1 = service.embed('test one');
      const emb2 = service.embed('test two');
      const sim = service.cosineSimilarity(emb1, emb2);
      expect(sim).toBeGreaterThanOrEqual(-1);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('should show higher similarity for similar texts', () => {
      const emb1 = service.embed('the dog runs fast');
      const emb2 = service.embed('the cat runs fast');
      const emb3 = service.embed('machine learning algorithms');

      const simSimilar = service.cosineSimilarity(emb1, emb2);
      const simDifferent = service.cosineSimilarity(emb1, emb3);

      expect(simSimilar).toBeGreaterThan(simDifferent);
    });

    it('should calculate euclidean distance', () => {
      const emb1 = service.embed('text one');
      const emb2 = service.embed('text one'); // Same
      const dist = service.euclideanDistance(emb1, emb2);
      expect(dist).toBeCloseTo(0, 3);
    });
  });

  describe('caching', () => {
    it('should cache embeddings', () => {
      expect(service.cacheSize()).toBe(0);
      service.embed('text one');
      expect(service.cacheSize()).toBe(1);
      service.embed('text one'); // From cache
      expect(service.cacheSize()).toBe(1);
      service.embed('text two');
      expect(service.cacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      service.embed('test');
      service.clearCache();
      expect(service.cacheSize()).toBe(0);
    });
  });

  describe('find most similar', () => {
    it('should find most similar embedding', () => {
      const query = service.embed('programming code');
      const candidates = [
        { id: 'doc1', embedding: service.embed('python programming language') },
        { id: 'doc2', embedding: service.embed('cooking recipes') },
        { id: 'doc3', embedding: service.embed('software development code') },
      ];

      const result = service.findMostSimilar(query, candidates);
      expect(result).not.toBeNull();
      expect(['doc1', 'doc3']).toContain(result!.id);
    });

    it('should return null for empty candidates', () => {
      const query = service.embed('test');
      const result = service.findMostSimilar(query, []);
      expect(result).toBeNull();
    });
  });

  describe('simple mode', () => {
    it('should work in simple mode', () => {
      const simpleService = MockEmbeddingService.simple();
      const emb = simpleService.embed('test simple mode');

      expect(emb.length).toBe(MOCK_EMBEDDING_DIM);

      let norm = 0;
      for (const v of emb) {
        norm += v * v;
      }
      norm = Math.sqrt(norm);
      expect(norm).toBeCloseTo(1, 3);
    });
  });

  describe('isReady', () => {
    it('should always be ready', () => {
      expect(service.isReady()).toBe(true);
    });
  });
});

// =============================================================================
// TEST DATA FACTORY TESTS
// =============================================================================

describe('TestDataFactory', () => {
  describe('single memory creation', () => {
    it('should create simple memory', () => {
      const mem = TestDataFactory.createMemory('test content');
      expect(mem.content).toBe('test content');
      expect(mem.sourceType).toBe('manual');
    });

    it('should create memory with full config', () => {
      const mem = TestDataFactory.createMemoryFull(
        'test content',
        'fact',
        'test source',
        ['tag1', 'tag2'],
        0.5,
        0.8
      );
      expect(mem.content).toBe('test content');
      expect(mem.sourceType).toBe('fact');
      expect(mem.sourcePlatform).toBe('test source');
      expect(mem.tags).toEqual(['tag1', 'tag2']);
    });

    it('should create temporal memory', () => {
      const now = new Date();
      const validFrom = addDays(now, -10);
      const validUntil = addDays(now, 10);

      const mem = TestDataFactory.createTemporalMemory('temporal', validFrom, validUntil);
      expect(mem.validFrom).toEqual(validFrom);
      expect(mem.validUntil).toEqual(validUntil);
    });

    it('should create emotional memory', () => {
      const mem = TestDataFactory.createEmotionalMemory('emotional', 0.9, 0.95);
      expect(mem.sentimentScore).toBe(0.9);
      expect(mem.sentimentMagnitude).toBe(0.95);
    });
  });

  describe('batch creation', () => {
    it('should create batch of memories', () => {
      const batch = TestDataFactory.createBatch(10);
      expect(batch.length).toBe(10);
    });

    it('should create batch with config', () => {
      const batch = TestDataFactory.createBatchWithConfig({
        count: 5,
        nodeType: 'concept',
        tags: ['test'],
      });
      expect(batch.length).toBe(5);
      expect(batch[0].sourceType).toBe('concept');
      expect(batch[0].tags).toContain('test');
    });
  });

  describe('scenario creation', () => {
    it('should create decay scenario', () => {
      const scenario = TestDataFactory.createDecayScenario();
      expect(scenario.inputs.length).toBeGreaterThan(0);
      expect(scenario.metadata['high_stability']).toBeDefined();
      expect(scenario.metadata['low_stability']).toBeDefined();
      expect(scenario.metadata['emotional']).toBeDefined();
    });

    it('should create scheduling scenario', () => {
      const scenario = TestDataFactory.createSchedulingScenario();
      expect(scenario.inputs.length).toBeGreaterThan(0);
      expect(scenario.metadata['new']).toBeDefined();
      expect(scenario.metadata['learning']).toBeDefined();
    });

    it('should create search scenario', () => {
      const scenario = TestDataFactory.createSearchScenario();
      expect(scenario.inputs.length).toBe(8); // 3 + 3 + 2
      expect(scenario.metadata['programming_count']).toBe('3');
    });

    it('should create temporal scenario', () => {
      const scenario = TestDataFactory.createTemporalScenario();
      expect(scenario.inputs.length).toBe(4);
      expect(scenario.metadata['current']).toBeDefined();
      expect(scenario.metadata['expired']).toBeDefined();
    });
  });

  describe('utility methods', () => {
    it('should generate random node type', () => {
      const type1 = TestDataFactory.randomNodeType(0);
      const type2 = TestDataFactory.randomNodeType(1);
      expect(type1).toBeDefined();
      expect(type2).toBeDefined();
    });

    it('should generate lorem content', () => {
      const content = TestDataFactory.loremContent(10, 42);
      const words = content.split(' ');
      expect(words.length).toBe(10);
    });

    it('should generate tags', () => {
      const tags = TestDataFactory.generateTags(5, 0);
      expect(tags.length).toBe(5);
      expect(tags.every((t) => t.length > 0)).toBe(true);
    });
  });
});

// =============================================================================
// CUSTOM ASSERTIONS TESTS
// =============================================================================

describe('Custom Assertions', () => {
  describe('assertApproxEqual', () => {
    it('should pass for approximately equal values', () => {
      expect(() => assertApproxEqual(0.999, 1.0, 0.01)).not.toThrow();
    });

    it('should throw for values outside epsilon', () => {
      expect(() => assertApproxEqual(0.9, 1.0, 0.01)).toThrow(AssertionError);
    });
  });

  describe('assertInRange', () => {
    it('should pass for values in range', () => {
      expect(() => assertInRange(5, 0, 10)).not.toThrow();
    });

    it('should throw for values outside range', () => {
      expect(() => assertInRange(15, 0, 10)).toThrow(AssertionError);
    });
  });

  describe('FSRS assertions', () => {
    it('assertValidRetrievability should pass for valid values', () => {
      expect(() => assertValidRetrievability(0.5)).not.toThrow();
      expect(() => assertValidRetrievability(0)).not.toThrow();
      expect(() => assertValidRetrievability(1)).not.toThrow();
    });

    it('assertValidRetrievability should throw for invalid values', () => {
      expect(() => assertValidRetrievability(-0.1)).toThrow(AssertionError);
      expect(() => assertValidRetrievability(1.1)).toThrow(AssertionError);
    });

    it('assertValidDifficulty should pass for valid values', () => {
      expect(() => assertValidDifficulty(5)).not.toThrow();
      expect(() => assertValidDifficulty(1)).not.toThrow();
      expect(() => assertValidDifficulty(10)).not.toThrow();
    });

    it('assertValidDifficulty should throw for invalid values', () => {
      expect(() => assertValidDifficulty(0)).toThrow(AssertionError);
      expect(() => assertValidDifficulty(11)).toThrow(AssertionError);
    });

    it('assertValidStability should pass for positive values', () => {
      expect(() => assertValidStability(5)).not.toThrow();
    });

    it('assertValidStability should throw for non-positive values', () => {
      expect(() => assertValidStability(0)).toThrow(AssertionError);
      expect(() => assertValidStability(-1)).toThrow(AssertionError);
    });
  });

  describe('embedding assertions', () => {
    it('assertNormalizedEmbedding should pass for normalized', () => {
      const normalized = new Float32Array([0.6, 0.8]); // sqrt(0.36 + 0.64) = 1
      expect(() => assertNormalizedEmbedding(normalized, 0.01)).not.toThrow();
    });

    it('assertNormalizedEmbedding should throw for non-normalized', () => {
      const notNormalized = new Float32Array([1, 1]); // sqrt(2) != 1
      expect(() => assertNormalizedEmbedding(notNormalized, 0.01)).toThrow(AssertionError);
    });

    it('assertEmbeddingDimension should check dimension', () => {
      const emb = new Float32Array(768);
      expect(() => assertEmbeddingDimension(emb, 768)).not.toThrow();
      expect(() => assertEmbeddingDimension(emb, 512)).toThrow(AssertionError);
    });

    it('assertSemanticSimilarity should check ordering', () => {
      expect(() => assertSemanticSimilarity(0.9, 0.5)).not.toThrow();
      expect(() => assertSemanticSimilarity(0.5, 0.9)).toThrow(AssertionError);
    });
  });
});
