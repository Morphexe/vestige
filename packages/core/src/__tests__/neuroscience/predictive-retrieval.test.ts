/**
 * Tests for Predictive Retrieval
 *
 * Tests cover:
 * - Interest tracking with EMA
 * - Interest decay
 * - Query pattern recording
 * - Temporal patterns
 * - Co-access patterns
 * - Session context
 * - Prediction generation
 * - Prediction merging
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  PredictiveRetrievalSystem,
  createUserModel,
  createTemporalPatterns,
  createSessionContext,
  INTEREST_DECAY_ALPHA,
  DAILY_DECAY_FACTOR,
  type PredictedMemory,
  type UserModel,
} from '../../neuroscience/predictive-retrieval.js';

describe('Predictive Retrieval', () => {
  let system: PredictiveRetrievalSystem;

  beforeEach(() => {
    system = new PredictiveRetrievalSystem();
  });

  // ==========================================================================
  // 1. INTEREST TRACKING TESTS
  // ==========================================================================

  describe('interest tracking', () => {
    it('should update interest for a topic', () => {
      system.updateInterest('typescript', 0.5);
      const interest = system.getInterest('typescript');

      expect(interest).toBeGreaterThan(0);
    });

    it('should apply EMA for repeated updates', () => {
      system.updateInterest('typescript', 1.0);
      const first = system.getInterest('typescript');

      system.updateInterest('typescript', 0.0);
      const second = system.getInterest('typescript');

      // EMA: w = w * (1 - alpha) + new * alpha
      expect(second).toBeLessThan(first);
    });

    it('should track multiple topics independently', () => {
      system.updateInterest('typescript', 0.8);
      system.updateInterest('typescript', 0.8); // Update again for higher weight
      system.updateInterest('python', 0.2);

      expect(system.getInterest('typescript')).toBeGreaterThan(system.getInterest('python'));
    });

    it('should normalize topic names (lowercase)', () => {
      system.updateInterest('TypeScript', 0.5);

      expect(system.getInterest('typescript')).toBeGreaterThan(0);
    });

    it('should get interests sorted by weight', () => {
      system.updateInterest('high', 0.9);
      system.updateInterest('high', 0.9); // Reinforce
      system.updateInterest('low', 0.1);

      const interests = system.getInterests();
      expect(interests[0]?.topic).toBe('high');
      expect(interests[0]?.weight).toBeGreaterThan(interests[1]?.weight ?? 0);
    });
  });

  // ==========================================================================
  // 2. INTEREST DECAY TESTS
  // ==========================================================================

  describe('interest decay', () => {
    it('should apply decay to all interests', () => {
      system.updateInterest('typescript', 1.0);
      system.updateInterest('python', 0.8);

      const beforeTs = system.getInterest('typescript');
      const beforePy = system.getInterest('python');

      system.applyDecay();

      const afterTs = system.getInterest('typescript');
      const afterPy = system.getInterest('python');

      expect(afterTs).toBeLessThan(beforeTs);
      expect(afterPy).toBeLessThan(beforePy);
    });

    it('should decay by factor of 0.98', () => {
      // Build up interest first
      for (let i = 0; i < 10; i++) {
        system.updateInterest('typescript', 1.0);
      }
      const before = system.getInterest('typescript');

      system.applyDecay();
      const after = system.getInterest('typescript');

      expect(after).toBeCloseTo(before * DAILY_DECAY_FACTOR, 5);
    });

    it('should remove very small interests', () => {
      system.updateInterest('typescript', 0.001);

      // Apply many decays
      for (let i = 0; i < 100; i++) {
        system.applyDecay();
      }

      const interest = system.getInterest('typescript');
      expect(interest).toBe(0); // Should be pruned
    });
  });

  // ==========================================================================
  // 3. QUERY PATTERN TESTS
  // ==========================================================================

  describe('query patterns', () => {
    it('should record a query pattern', () => {
      system.recordQuery('typescript generics', ['typescript', 'generics'], ['mem-1', 'mem-2']);

      const model = system.getModel();
      expect(model.queryHistory.length).toBeGreaterThan(0);
    });

    it('should store query tags', () => {
      system.recordQuery('error handling', ['error', 'exception'], ['mem-1']);

      const model = system.getModel();
      const pattern = model.queryHistory[model.queryHistory.length - 1];

      expect(pattern?.tags).toContain('error');
      expect(pattern?.tags).toContain('exception');
    });

    it('should store accessed results', () => {
      system.recordQuery('test query', ['test'], ['mem-1', 'mem-2', 'mem-3']);

      const model = system.getModel();
      const pattern = model.queryHistory[model.queryHistory.length - 1];

      expect(pattern?.accessedResults).toEqual(['mem-1', 'mem-2', 'mem-3']);
    });

    it('should update interests from query tags', () => {
      system.recordQuery('typescript generics', ['typescript'], ['mem-1']);

      expect(system.getInterest('typescript')).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 4. MEMORY ACCESS TESTS
  // ==========================================================================

  describe('memory access', () => {
    it('should record memory access', () => {
      system.recordMemoryAccess('mem-1', ['typescript', 'testing']);

      // Access should update interests
      expect(system.getInterest('typescript')).toBeGreaterThan(0);
      expect(system.getInterest('testing')).toBeGreaterThan(0);
    });

    it('should track co-access patterns', () => {
      system.recordCoAccess(['mem-1', 'mem-2', 'mem-3']);

      const model = system.getModel();
      expect(model.coAccessPatterns.get('mem-1')).toContain('mem-2');
      expect(model.coAccessPatterns.get('mem-1')).toContain('mem-3');
    });

    it('should build bidirectional co-access', () => {
      system.recordCoAccess(['mem-1', 'mem-2']);

      const model = system.getModel();
      expect(model.coAccessPatterns.get('mem-1')).toContain('mem-2');
      expect(model.coAccessPatterns.get('mem-2')).toContain('mem-1');
    });

    it('should add memory to session', () => {
      system.recordMemoryAccess('mem-1', ['test']);

      const session = system.getSession();
      expect(session.accessedMemories).toContain('mem-1');
    });
  });

  // ==========================================================================
  // 5. TEMPORAL PATTERN TESTS
  // ==========================================================================

  describe('temporal patterns', () => {
    it('should create patterns with 24 hourly buckets', () => {
      const patterns = createTemporalPatterns();
      expect(patterns.hourly.length).toBe(24);
    });

    it('should create patterns with 7 daily buckets', () => {
      const patterns = createTemporalPatterns();
      expect(patterns.daily.length).toBe(7);
    });

    it('should create patterns with 12 monthly buckets', () => {
      const patterns = createTemporalPatterns();
      expect(patterns.monthly.length).toBe(12);
    });

    it('should update temporal pattern on memory access', () => {
      const hour = new Date().getHours();
      const model = system.getModel();
      const before = model.temporalPatterns.hourly[hour] ?? 0;

      system.recordMemoryAccess('mem-1', ['test']);
      const after = system.getModel().temporalPatterns.hourly[hour] ?? 0;

      expect(after).toBeGreaterThan(before);
    });
  });

  // ==========================================================================
  // 6. SESSION CONTEXT TESTS
  // ==========================================================================

  describe('session context', () => {
    it('should start with empty session', () => {
      const session = system.getSession();

      expect(session.focus.length).toBe(0);
      expect(session.accessedMemories.length).toBe(0);
    });

    it('should update session on memory access', () => {
      system.recordMemoryAccess('mem-1', ['typescript']);

      const session = system.getSession();
      expect(session.accessedMemories).toContain('mem-1');
    });

    it('should track focus topics', () => {
      system.addSessionFocus('typescript');
      system.addSessionFocus('testing');

      const session = system.getSession();
      expect(session.focus).toContain('typescript');
      expect(session.focus).toContain('testing');
    });

    it('should track active files', () => {
      system.addActiveFile('src/index.ts');
      system.addActiveFile('src/utils.ts');

      const session = system.getSession();
      expect(session.activeFiles).toContain('src/index.ts');
    });

    it('should reset session', () => {
      system.recordMemoryAccess('mem-1', ['test']);
      system.addSessionFocus('focus');

      system.startSession();

      const session = system.getSession();
      expect(session.accessedMemories.length).toBe(0);
      expect(session.focus.length).toBe(0);
    });
  });

  // ==========================================================================
  // 7. PREDICTION TESTS
  // ==========================================================================

  describe('predictions', () => {
    beforeEach(() => {
      // Set up some context
      system.updateInterest('typescript', 0.8);
      system.updateInterest('testing', 0.6);
      system.recordQuery('typescript generics', ['typescript'], ['mem-1', 'mem-2']);
      system.recordCoAccess(['mem-1', 'mem-3']);
    });

    it('should predict from co-access', async () => {
      const predictions = await system.predictFromCoAccess('mem-1');

      expect(Array.isArray(predictions)).toBe(true);
      // Should include co-accessed memory
      const memIds = predictions.map(p => p.memoryId);
      expect(memIds).toContain('mem-3');
    });

    it('should merge predictions without duplicates', () => {
      const pred1: PredictedMemory[] = [{
        memoryId: 'mem-1',
        contentPreview: 'Preview 1',
        confidence: 0.8,
        reasoning: 'interest_based',
        predictedAt: new Date(),
        tags: ['test'],
      }];

      const pred2: PredictedMemory[] = [{
        memoryId: 'mem-1', // Same memory
        contentPreview: 'Preview 1',
        confidence: 0.6,
        reasoning: 'temporal_pattern',
        predictedAt: new Date(),
        tags: ['test'],
      }];

      const merged = system.mergePredictions([pred1, pred2], 10);

      // Should have only one entry with higher confidence
      const mem1Entries = merged.filter(p => p.memoryId === 'mem-1');
      expect(mem1Entries.length).toBe(1);
      expect(mem1Entries[0]?.confidence).toBe(0.8);
    });

    it('should sort predictions by confidence', () => {
      const predictions: PredictedMemory[] = [
        { memoryId: 'low', contentPreview: '', confidence: 0.3, reasoning: 'interest_based', predictedAt: new Date(), tags: [] },
        { memoryId: 'high', contentPreview: '', confidence: 0.9, reasoning: 'interest_based', predictedAt: new Date(), tags: [] },
        { memoryId: 'mid', contentPreview: '', confidence: 0.5, reasoning: 'interest_based', predictedAt: new Date(), tags: [] },
      ];

      const merged = system.mergePredictions([predictions], 10);

      expect(merged[0]?.memoryId).toBe('high');
      expect(merged[merged.length - 1]?.memoryId).toBe('low');
    });
  });

  // ==========================================================================
  // 8. NOVELTY SIGNAL TESTS
  // ==========================================================================

  describe('novelty signal', () => {
    it('should return 1.0 for completely novel tags', () => {
      // No interests set, so everything is novel
      const novelty = system.signalNovelty(['brand-new', 'unknown']);

      expect(novelty).toBeCloseTo(1.0, 1);
    });

    it('should return lower value for familiar tags', () => {
      // Build up familiarity
      for (let i = 0; i < 10; i++) {
        system.updateInterest('typescript', 1.0);
        system.updateInterest('testing', 1.0);
      }

      const novelty = system.signalNovelty(['typescript', 'testing']);

      expect(novelty).toBeLessThan(0.5);
    });

    it('should return intermediate value for mixed tags', () => {
      for (let i = 0; i < 10; i++) {
        system.updateInterest('typescript', 0.8);
      }

      const novelty = system.signalNovelty(['typescript', 'brand-new-tag']);

      expect(novelty).toBeGreaterThan(0);
      expect(novelty).toBeLessThan(1);
    });

    it('should return 1.0 for empty tags', () => {
      const novelty = system.signalNovelty([]);
      expect(novelty).toBe(1.0);
    });
  });

  // ==========================================================================
  // 9. USER MODEL TESTS
  // ==========================================================================

  describe('user model', () => {
    it('should create empty user model', () => {
      const model = createUserModel();

      expect(model.interests.size).toBe(0);
      expect(model.queryHistory.length).toBe(0);
      expect(model.coAccessPatterns.size).toBe(0);
    });

    it('should export model state', () => {
      system.updateInterest('typescript', 0.8);
      system.recordQuery('test', ['tag'], ['mem-1']);

      const exported = system.exportModel();

      expect(exported.interests.length).toBeGreaterThan(0);
      expect(exported.queryHistory.length).toBeGreaterThan(0);
    });

    it('should import model state', () => {
      const data = {
        interests: [['typescript', 0.9] as [string, number]],
        queryHistory: [],
        temporalPatterns: createTemporalPatterns(),
        coAccessPatterns: [] as [string, string[]][],
      };

      system.importModel(data);

      expect(system.getInterest('typescript')).toBe(0.9);
    });

    it('should clear all data', () => {
      system.updateInterest('typescript', 0.8);
      system.recordQuery('test', ['tag'], ['mem-1']);

      system.clear();

      expect(system.getInterest('typescript')).toBe(0);
      expect(system.getModel().queryHistory.length).toBe(0);
    });
  });

  // ==========================================================================
  // 10. ENABLE/DISABLE TESTS
  // ==========================================================================

  describe('enable/disable', () => {
    it('should be enabled by default', () => {
      expect(system.isEnabled()).toBe(true);
    });

    it('should disable predictions', () => {
      system.setEnabled(false);
      expect(system.isEnabled()).toBe(false);
    });

    it('should return empty predictions when disabled', async () => {
      system.setEnabled(false);
      const predictions = await system.predictNeededMemories(10);

      expect(predictions.length).toBe(0);
    });
  });

  // ==========================================================================
  // 11. STATISTICS TESTS
  // ==========================================================================

  describe('statistics', () => {
    it('should track statistics', () => {
      system.updateInterest('typescript', 0.8);
      system.recordQuery('test', ['tag'], ['mem-1']);
      system.recordCoAccess(['mem-1', 'mem-2']);
      system.recordMemoryAccess('mem-3', ['test']);

      const stats = system.getStats();

      expect(stats.interestCount).toBeGreaterThan(0);
      expect(stats.queryCount).toBeGreaterThan(0);
      expect(stats.coAccessPairsCount).toBeGreaterThan(0);
      expect(stats.sessionMemoryCount).toBeGreaterThan(0);
    });
  });
});
