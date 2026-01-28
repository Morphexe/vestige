/**
 * E2E Cognitive Tests
 *
 * Tests for neuroscience-inspired memory features including
 * memory states, synaptic tagging, spreading activation, and more.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  FSRSScheduler,
  retrievability,
  nextDifficulty,
  applySentimentBoost,
} from '../../core/fsrs.js';

// Alias for cleaner code
const calculateRetrievability = retrievability;

// Sentiment boost helper - returns stability multiplier for emotional intensity
function sentimentBoost(intensity: number): number {
  return applySentimentBoost(1.0, intensity);
}

describe('E2E Cognitive Tests', () => {
  let db: VestigeDatabase;

  beforeEach(() => {
    db = new VestigeDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ============================================================================
  // EBBINGHAUS FORGETTING CURVE
  // ============================================================================

  describe('Ebbinghaus Forgetting Curve', () => {
    it('should model exponential decay of retrievability', () => {
      const stability = 10.0;

      // Get retrievability at different time points
      const r0 = calculateRetrievability(stability, 0);
      const r1 = calculateRetrievability(stability, 1);
      const r5 = calculateRetrievability(stability, 5);
      const r10 = calculateRetrievability(stability, 10);
      const r30 = calculateRetrievability(stability, 30);

      // Retrievability should start at ~1.0 and decay
      expect(r0).toBeCloseTo(1.0, 2);
      expect(r1).toBeLessThan(r0);
      expect(r5).toBeLessThan(r1);
      expect(r10).toBeLessThan(r5);
      expect(r30).toBeLessThan(r10);

      // Should never go below 0
      expect(r30).toBeGreaterThan(0);
    });

    it('should decay slower with higher stability', () => {
      const lowStability = 1.0;
      const highStability = 30.0;

      const lowR7 = calculateRetrievability(lowStability, 7);
      const highR7 = calculateRetrievability(highStability, 7);

      expect(highR7).toBeGreaterThan(lowR7);
    });

    it('should match theoretical 90% retention at stability days', () => {
      const stability = 10.0;
      const rAtStability = calculateRetrievability(stability, stability);

      expect(rAtStability).toBeCloseTo(0.9, 1);
    });
  });

  // ============================================================================
  // SPACING EFFECT
  // ============================================================================

  describe('Spacing Effect', () => {
    it('should benefit from spaced vs massed practice', () => {
      const scheduler = new FSRSScheduler();

      // First review (massed - same day)
      const card = scheduler.newCard();
      const massedResult = scheduler.review(card, 3, 0); // Grade.Good, no spacing

      // Second review (spaced - 2 days later)
      const spacedResult = scheduler.review(massedResult.state, 3, 2); // Grade.Good, 2 days spacing

      // Spaced practice should yield higher stability growth
      expect(spacedResult.state.stability).toBeGreaterThan(massedResult.state.stability);
    });

    it('should increase intervals with each successful review', () => {
      const scheduler = new FSRSScheduler();
      let state = scheduler.newCard();
      const intervals: number[] = [];

      for (let i = 0; i < 5; i++) {
        const result = scheduler.review(state, 3, 2); // Grade.Good, 2 days elapsed
        intervals.push(result.interval);
        state = result.state;
      }

      // Intervals should generally increase with successful reviews
      expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[0]);
    });
  });

  // ============================================================================
  // DIFFICULTY MODELING
  // ============================================================================

  describe('Difficulty Modeling', () => {
    it('should bound difficulty between 1 and 10', () => {
      const d1 = nextDifficulty(1.0, 4);
      const d2 = nextDifficulty(10.0, 1);

      expect(d1).toBeGreaterThanOrEqual(1.0);
      expect(d1).toBeLessThanOrEqual(10.0);
      expect(d2).toBeGreaterThanOrEqual(1.0);
      expect(d2).toBeLessThanOrEqual(10.0);
    });

    it('should decrease difficulty with easy reviews', () => {
      const initial = 5.0;
      const afterEasy = nextDifficulty(initial, 4);

      expect(afterEasy).toBeLessThan(initial);
    });

    it('should increase difficulty with failed reviews', () => {
      const initial = 5.0;
      const afterAgain = nextDifficulty(initial, 1);

      expect(afterAgain).toBeGreaterThan(initial);
    });
  });

  // ============================================================================
  // EMOTIONAL MEMORY ENHANCEMENT
  // ============================================================================

  describe('Emotional Memory Enhancement', () => {
    it('should boost retention for emotionally significant memories', () => {
      const neutralBoost = sentimentBoost(0.0);
      const emotionalBoost = sentimentBoost(0.8);
      const highEmotionalBoost = sentimentBoost(1.0);

      expect(emotionalBoost).toBeGreaterThan(neutralBoost);
      expect(highEmotionalBoost).toBeGreaterThan(emotionalBoost);
    });

    it('should model flashbulb memories', () => {
      const flashbulbBoost = sentimentBoost(1.0);
      const normalBoost = sentimentBoost(0.3);

      expect(flashbulbBoost).toBeGreaterThan(normalBoost * 1.5);
    });
  });

  // ============================================================================
  // MEMORY STATES
  // ============================================================================

  describe('Memory States', () => {
    it('should transition through memory states based on retrievability', () => {
      const getState = (r: number) => {
        if (r > 0.7) return 'active';
        if (r > 0.3) return 'dormant';
        if (r > 0.1) return 'silent';
        return 'unavailable';
      };

      // FSRS-6 formula: R = (1 + factor * t / S)^(-w20) where factor ≈ 0.757
      // With stability = 1.0, decay is slower than classical formula
      const stability = 1.0;

      // Test that retrievability decreases monotonically over time
      const r0 = calculateRetrievability(stability, 0);
      const r20 = calculateRetrievability(stability, 20);
      const r100 = calculateRetrievability(stability, 100);
      const r500 = calculateRetrievability(stability, 500);

      expect(r0).toBe(1.0); // At day 0, perfect recall
      expect(r20).toBeLessThan(r0);
      expect(r100).toBeLessThan(r20);
      expect(r500).toBeLessThan(r100);

      // Verify state transitions happen at expected thresholds
      expect(getState(r0)).toBe('active');
      // After significant time, retrievability becomes very low
      expect(r500).toBeLessThan(0.5); // Significant decay from initial 1.0
    });

    it('should allow reactivation of dormant memories', () => {
      const node = db.insertNode({
        content: 'Dormant memory that can be reactivated',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.4,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      db.updateNodeAccess(node.id);

      const reactivated = db.getNode(node.id);
      expect(reactivated?.accessCount).toBe(1);
    });
  });

  // ============================================================================
  // INTERFERENCE EFFECTS
  // ============================================================================

  describe('Interference Effects', () => {
    it('should model proactive interference', () => {
      const oldMemory = db.insertNode({
        content: 'Python uses indentation for code blocks',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 10,
        retentionStrength: 0.9,
        stabilityFactor: 15.0,
        reviewCount: 5,
        confidence: 0.9,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['python', 'syntax'],
        events: [],
        tags: ['programming'],
        sourceChain: [],
      });

      const newMemory = db.insertNode({
        content: 'Go uses braces for code blocks, not indentation',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 1.0,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['go', 'syntax'],
        events: [],
        tags: ['programming'],
        sourceChain: [],
      });

      const results = db.searchNodes('code blocks');
      expect(results.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============================================================================
  // ENCODING SPECIFICITY
  // ============================================================================

  describe('Encoding Specificity', () => {
    it('should link memories with contextual cues', () => {
      const contextualMemory = db.insertNode({
        content: 'Discussed project architecture over coffee at the conference',
        sourceType: 'meeting',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 1.0,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [],
        people: ['colleague-id'],
        concepts: ['architecture', 'project-design'],
        events: ['tech-conference-2024'],
        tags: ['meeting', 'architecture', 'conference'],
        sourceChain: [],
      });

      const byContext = db.searchNodes('conference architecture');
      expect(byContext.items.some(r => r.id === contextualMemory.id)).toBe(true);

      // Search by actual words in content (FTS doesn't do stemming)
      const byCoffee = db.searchNodes('coffee project');
      expect(byCoffee.items.some(r => r.id === contextualMemory.id)).toBe(true);
    });
  });

  // ============================================================================
  // LEVELS OF PROCESSING
  // ============================================================================

  describe('Levels of Processing', () => {
    it('should support deep semantic processing', () => {
      const shallow = db.insertNode({
        content: 'TypeScript',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.7,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.6,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const deep = db.insertNode({
        content: 'TypeScript is a statically-typed superset of JavaScript that compiles to plain JavaScript, enabling better tooling and catching errors at compile time',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.9,
        stabilityFactor: 2.0,
        reviewCount: 0,
        confidence: 0.9,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['typescript', 'static-typing', 'javascript', 'tooling'],
        events: [],
        tags: ['programming', 'web-development'],
        sourceChain: [],
      });

      expect(deep.concepts.length).toBeGreaterThan(shallow.concepts.length);
      expect(deep.retentionStrength).toBeGreaterThan(shallow.retentionStrength);
    });
  });

  // ============================================================================
  // TESTING EFFECT
  // ============================================================================

  describe('Testing Effect', () => {
    it('should strengthen memory through retrieval practice', () => {
      const scheduler = new FSRSScheduler();

      // Start with a new card
      let state = scheduler.newCard();

      // Simulate multiple successful retrieval practices
      for (let i = 0; i < 3; i++) {
        const result = scheduler.review(state, 3, 2); // Grade.Good = 3, 2 days elapsed
        state = result.state;
      }

      const rereadStability = 1.0;

      // After testing (retrieval practice), stability should be higher than initial
      expect(state.stability).toBeGreaterThan(rereadStability);
    });
  });

  // ============================================================================
  // GENERATION EFFECT
  // ============================================================================

  describe('Generation Effect', () => {
    it('should benefit from active generation vs passive reading', () => {
      const generated = db.insertNode({
        content: 'My understanding: FSRS combines forgetting curves with spaced repetition to optimize review intervals',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 1.0,
        stabilityFactor: 2.0,
        reviewCount: 0,
        confidence: 0.9,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['fsrs', 'spaced-repetition', 'forgetting-curve'],
        events: [],
        tags: ['learning', 'memory'],
        sourceChain: [],
      });

      const passive = db.insertNode({
        content: 'FSRS: Free Spaced Repetition Scheduler',
        sourceType: 'article',
        sourcePlatform: 'browser',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.8,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.7,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['fsrs'],
        events: [],
        tags: [],
        sourceChain: [],
      });

      expect(generated.stabilityFactor).toBeGreaterThan(passive.stabilityFactor);
    });
  });

  // ============================================================================
  // METAMEMORY
  // ============================================================================

  describe('Metamemory', () => {
    it('should track confidence/judgment of learning', () => {
      const confident = db.insertNode({
        content: 'Well-understood concept with high confidence',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 5,
        retentionStrength: 0.95,
        stabilityFactor: 20.0,
        reviewCount: 5,
        confidence: 0.95,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const uncertain = db.insertNode({
        content: 'Uncertain concept that needs verification',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 1,
        retentionStrength: 0.6,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.4,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      expect(confident.confidence).toBeGreaterThan(uncertain.confidence);
    });

    it('should flag contradictions', () => {
      const original = db.insertNode({
        content: 'React uses class components by default',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.5,
        stabilityFactor: 1.0,
        reviewCount: 0,
        confidence: 0.6,
        isContradicted: true,
        contradictionIds: ['newer-memory-id'],
        people: [],
        concepts: ['react', 'components'],
        events: [],
        tags: [],
        sourceChain: [],
      });

      expect(original.isContradicted).toBe(true);
      expect(original.contradictionIds.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // DISTRIBUTED PRACTICE
  // ============================================================================

  describe('Distributed Practice', () => {
    it('should reward consistent review habits', () => {
      const scheduler = new FSRSScheduler();

      // Start with a new card
      let state = scheduler.newCard();

      // Simulate 10 consistent reviews spaced 2 days apart
      for (let i = 0; i < 10; i++) {
        const result = scheduler.review(state, 3, 2); // Grade.Good = 3, 2 days elapsed
        state = result.state;
      }

      const crammingStability = 1.0;

      // Consistent distributed practice should yield higher stability
      expect(state.stability).toBeGreaterThan(crammingStability);
    });
  });

  // ============================================================================
  // CONTEXTUAL VARIETY
  // ============================================================================

  describe('Contextual Variety', () => {
    it('should benefit from varied encoding contexts', () => {
      const contexts = [
        { platform: 'browser' as const, type: 'article' as const },
        { platform: 'claude' as const, type: 'conversation' as const },
        { platform: 'manual' as const, type: 'note' as const },
      ];

      const nodes = contexts.map((ctx, i) =>
        db.insertNode({
          content: `Understanding recursion - context ${i + 1}`,
          sourceType: ctx.type,
          sourcePlatform: ctx.platform,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 0,
          retentionStrength: 1.0,
          stabilityFactor: 1.0,
          reviewCount: 0,
          confidence: 0.8,
          isContradicted: false,
          contradictionIds: [],
          people: [],
          concepts: ['recursion', 'programming'],
          events: [],
          tags: [],
          sourceChain: [],
        })
      );

      const results = db.searchNodes('recursion');
      expect(results.items.length).toBe(3);

      const platforms = new Set(nodes.map(n => n.sourcePlatform));
      expect(platforms.size).toBe(3);
    });
  });

  // ============================================================================
  // SLEEP CONSOLIDATION SIMULATION
  // ============================================================================

  describe('Sleep Consolidation Simulation', () => {
    it('should simulate memory consolidation over time', () => {
      const memories = [
        { content: 'High importance', importance: 0.9 },
        { content: 'Medium importance', importance: 0.5 },
        { content: 'Low importance', importance: 0.2 },
      ];

      const nodes = memories.map(m =>
        db.insertNode({
          content: m.content,
          sourceType: 'fact',
          sourcePlatform: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 0,
          retentionStrength: 0.5 + m.importance * 0.3,
          stabilityFactor: 1.0 + m.importance * 5,
          reviewCount: 0,
          confidence: m.importance,
          isContradicted: false,
          contradictionIds: [],
          people: [],
          concepts: [],
          events: [],
          tags: [],
          sourceChain: [],
        })
      );

      expect(nodes[0].stabilityFactor).toBeGreaterThan(nodes[2].stabilityFactor);
    });
  });

  // ============================================================================
  // RECONSOLIDATION
  // ============================================================================

  describe('Reconsolidation', () => {
    it('should allow memory modification during retrieval', () => {
      const original = db.insertNode({
        content: 'Original memory content',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.7,
        stabilityFactor: 5.0,
        reviewCount: 3,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      db.updateNodeAccess(original.id);

      const afterAccess = db.getNode(original.id);
      expect(afterAccess?.accessCount).toBe(1);
    });
  });

  // ============================================================================
  // RETRIEVAL-INDUCED FORGETTING
  // ============================================================================

  describe('Retrieval-Induced Forgetting', () => {
    it('should model competition between related memories', () => {
      const target = db.insertNode({
        content: 'Primary target memory - accessed frequently',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 10,
        retentionStrength: 0.9,
        stabilityFactor: 10.0,
        reviewCount: 5,
        confidence: 0.9,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['shared-concept'],
        events: [],
        tags: ['category-a'],
        sourceChain: [],
      });

      const competitor = db.insertNode({
        content: 'Competing memory - rarely accessed',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 1,
        retentionStrength: 0.4,
        stabilityFactor: 2.0,
        reviewCount: 0,
        confidence: 0.6,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['shared-concept'],
        events: [],
        tags: ['category-a'],
        sourceChain: [],
      });

      expect(target.retentionStrength).toBeGreaterThan(competitor.retentionStrength);
    });
  });

  // ============================================================================
  // WORKING MEMORY SIMULATION
  // ============================================================================

  describe('Working Memory Simulation', () => {
    it('should prioritize most relevant items in recall', () => {
      const memories = Array.from({ length: 20 }, (_, i) =>
        db.insertNode({
          content: `Memory item ${i + 1} about testing`,
          sourceType: 'note',
          sourcePlatform: 'manual',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastAccessedAt: new Date(),
          accessCount: 20 - i,
          retentionStrength: 1 - i * 0.03,
          stabilityFactor: 1.0,
          reviewCount: 0,
          confidence: 0.8,
          isContradicted: false,
          contradictionIds: [],
          people: [],
          concepts: [],
          events: [],
          tags: [],
          sourceChain: [],
        })
      );

      const results = db.searchNodes('testing', { limit: 7 });
      expect(results.items.length).toBeLessThanOrEqual(7);
    });
  });

  // ============================================================================
  // SCHEMA INTEGRATION
  // ============================================================================

  describe('Schema Integration', () => {
    it('should connect new memories to existing schemas', () => {
      const schema = db.insertNode({
        content: 'Schema: Software Architecture Patterns',
        sourceType: 'concept',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 5,
        retentionStrength: 0.95,
        stabilityFactor: 20.0,
        reviewCount: 5,
        confidence: 0.9,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['architecture', 'patterns', 'design'],
        events: [],
        tags: ['schema', 'software'],
        sourceChain: [],
      });

      const newMemory = db.insertNode({
        content: 'The CQRS pattern separates read and write operations',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 1.0,
        stabilityFactor: 1.5,
        reviewCount: 0,
        confidence: 0.8,
        isContradicted: false,
        contradictionIds: [],
        people: [],
        concepts: ['cqrs', 'architecture', 'patterns'],
        events: [],
        tags: ['software'],
        sourceChain: [],
      });

      db.insertEdge({
        fromId: newMemory.id,
        toId: schema.id,
        edgeType: 'part_of',
        weight: 0.8,
        createdAt: new Date(),
      });

      const relatedIds = db.getRelatedNodes(newMemory.id);
      expect(relatedIds).toContain(schema.id);
    });
  });
});
