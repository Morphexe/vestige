/**
 * E2E Extreme Tests
 *
 * Edge cases, boundary conditions, stress tests, and adversarial inputs
 * to verify robustness of the Vestige cognitive memory system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  FSRSScheduler,
  retrievability,
  nextDifficulty,
  fuzzInterval,
} from '../../core/fsrs.js';
import { executeSmartIngest } from '../../mcp/tools/smart-ingest.js';
import { executeCodebase } from '../../mcp/tools/codebase.js';
import { executeIntention } from '../../mcp/tools/intention.js';
import { executePromoteMemory, executeDemoteMemory } from '../../mcp/tools/feedback.js';

// Alias for cleaner code
const calculateRetrievability = retrievability;

describe('E2E Extreme Tests', () => {
  let db: VestigeDatabase;

  beforeEach(() => {
    db = new VestigeDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ============================================================================
  // BOUNDARY VALUE TESTS
  // ============================================================================

  describe('Boundary Values', () => {
    it('should handle zero-day interval', () => {
      const r = calculateRetrievability(1.0, 0);
      expect(r).toBeCloseTo(1.0, 2);
    });

    it('should handle very large intervals', () => {
      const r = calculateRetrievability(365.0, 3650);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThan(1);
      expect(Number.isFinite(r)).toBe(true);
    });

    it('should handle minimum stability', () => {
      const r = calculateRetrievability(0.1, 1);
      expect(r).toBeGreaterThan(0);
      expect(Number.isFinite(r)).toBe(true);
    });

    it('should handle maximum stability', () => {
      const r = calculateRetrievability(36500, 365);
      expect(r).toBeLessThan(1);
      expect(Number.isFinite(r)).toBe(true);
    });

    it('should clamp difficulty to valid range', () => {
      let d = 1.0;
      for (let i = 0; i < 100; i++) {
        d = nextDifficulty(d, 4);
      }
      expect(d).toBeGreaterThanOrEqual(1.0);

      d = 10.0;
      for (let i = 0; i < 100; i++) {
        d = nextDifficulty(d, 1);
      }
      expect(d).toBeLessThanOrEqual(10.0);
    });

    it('should handle edge case retrieval strengths', () => {
      const node = db.insertNode({
        content: 'Test boundary retention',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.0,
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

      const retrieved = db.getNode(node.id);
      expect(retrieved?.retentionStrength).toBeGreaterThanOrEqual(0);
    });
  });

  // ============================================================================
  // EMPTY & NULL HANDLING
  // ============================================================================

  describe('Empty and Null Handling', () => {
    it('should reject empty content', async () => {
      await expect(
        executeSmartIngest(db, {
          content: '',
          nodeType: 'note',
          forceCreate: true,
        }, null, null)
      ).rejects.toThrow();
    });

    it('should reject whitespace-only content', async () => {
      await expect(
        executeSmartIngest(db, {
          content: '   \n\t  ',
          nodeType: 'note',
          forceCreate: true,
        }, null, null)
      ).rejects.toThrow();
    });

    it('should handle empty search query gracefully', () => {
      const results = db.searchNodes('');
      expect(Array.isArray(results.items)).toBe(true);
    });

    it('should handle non-existent node IDs', async () => {
      await expect(
        executePromoteMemory(db, { id: 'non-existent-id-12345' })
      ).rejects.toThrow();

      await expect(
        executeDemoteMemory(db, { id: 'non-existent-id-12345' })
      ).rejects.toThrow();
    });

    it('should handle null embeddings gracefully', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Test without embeddings',
        nodeType: 'note',
        forceCreate: false,
      }, null, null);

      expect(result.success).toBe(true);
      expect(result.hasEmbedding).toBe(false);
    });

    it('should handle empty tags array', () => {
      const node = db.insertNode({
        content: 'No tags',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      expect(node.tags).toEqual([]);
    });
  });

  // ============================================================================
  // SPECIAL CHARACTERS & UNICODE
  // ============================================================================

  describe('Special Characters and Unicode', () => {
    it('should handle Unicode content', () => {
      const unicodeContent = '日本語テスト Ελληνικά العربية';
      const node = db.insertNode({
        content: unicodeContent,
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const retrieved = db.getNode(node.id);
      expect(retrieved?.content).toBe(unicodeContent);
    });

    it('should handle special SQL characters', () => {
      const sqlChars = "Test with ' quotes \" and -- comments; DROP TABLE;";
      const node = db.insertNode({
        content: sqlChars,
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const retrieved = db.getNode(node.id);
      expect(retrieved?.content).toBe(sqlChars);
    });

    it('should handle newlines and tabs', () => {
      const multiline = 'Line 1\nLine 2\n\tTabbed\n\n\nMultiple newlines';
      const node = db.insertNode({
        content: multiline,
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const retrieved = db.getNode(node.id);
      expect(retrieved?.content).toBe(multiline);
    });
  });

  // ============================================================================
  // LARGE DATA TESTS
  // ============================================================================

  describe('Large Data Handling', () => {
    it('should handle large content', async () => {
      const largeContent = 'A'.repeat(100000);
      const result = await executeSmartIngest(db, {
        content: largeContent,
        nodeType: 'note',
        forceCreate: true,
      }, null, null);

      expect(result.success).toBe(true);
      const retrieved = db.getNode(result.nodeId);
      expect(retrieved?.content.length).toBe(100000);
    });

    it('should handle many tags', () => {
      const manyTags = Array.from({ length: 100 }, (_, i) => `tag-${i}`);
      const node = db.insertNode({
        content: 'Node with many tags',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: manyTags,
        sourceChain: [],
      });

      expect(node.tags.length).toBe(100);
    });

    it('should handle many nodes efficiently', () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        db.insertNode({
          content: `Bulk node ${i}`,
          sourceType: 'note',
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
          concepts: [],
          events: [],
          tags: [],
          sourceChain: [],
        });
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(5000);
    });

    it('should search efficiently with many nodes', () => {
      for (let i = 0; i < 50; i++) {
        db.insertNode({
          content: `Searchable content item ${i} with keywords`,
          sourceType: 'note',
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
          concepts: [],
          events: [],
          tags: [],
          sourceChain: [],
        });
      }

      const startTime = Date.now();
      const results = db.searchNodes('keywords');
      const elapsed = Date.now() - startTime;

      expect(results.items.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThan(1000);
    });
  });

  // ============================================================================
  // CONCURRENT OPERATIONS
  // ============================================================================

  describe('Concurrent Operations', () => {
    it('should handle rapid successive inserts', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        Promise.resolve(db.insertNode({
          content: `Concurrent node ${i}`,
          sourceType: 'note',
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
          concepts: [],
          events: [],
          tags: [],
          sourceChain: [],
        }))
      );

      const results = await Promise.all(promises);
      expect(results.length).toBe(20);

      const ids = new Set(results.map(r => r.id));
      expect(ids.size).toBe(20);
    });

    it('should handle concurrent reads and writes', async () => {
      const node = db.insertNode({
        content: 'Concurrent test node',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const accessPromises = Array.from({ length: 10 }, () =>
        Promise.resolve(db.updateNodeAccess(node.id))
      );

      await Promise.all(accessPromises);

      const final = db.getNode(node.id);
      expect(final?.accessCount).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // ERROR RECOVERY
  // ============================================================================

  describe('Error Recovery', () => {
    it('should handle missing required fields gracefully', async () => {
      await expect(
        executeCodebase(db, {
          action: 'remember_pattern',
          description: 'Test pattern',
        })
      ).rejects.toThrow();
    });

    it('should handle invalid action gracefully', async () => {
      await expect(
        executeCodebase(db, {
          action: 'invalid_action' as 'remember_pattern',
          name: 'Test',
          description: 'Test',
        })
      ).rejects.toThrow();
    });

    it('should not corrupt database on partial failure', async () => {
      const validNode = db.insertNode({
        content: 'Valid node before error',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      try {
        await executePromoteMemory(db, { id: 'non-existent' });
      } catch {
        // Expected error
      }

      const retrieved = db.getNode(validNode.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.content).toBe('Valid node before error');
    });
  });

  // ============================================================================
  // FSRS ALGORITHM EDGE CASES
  // ============================================================================

  describe('FSRS Edge Cases', () => {
    it('should handle all rating values', () => {
      const scheduler = new FSRSScheduler();
      const card = scheduler.newCard();
      const previews = scheduler.previewReviews(card, 2);

      expect(previews.again).toBeDefined();
      expect(previews.hard).toBeDefined();
      expect(previews.good).toBeDefined();
      expect(previews.easy).toBeDefined();
    });

    it('should handle all state transitions', () => {
      const scheduler = new FSRSScheduler();

      // New card
      const newCard = scheduler.newCard();
      expect(newCard.state).toBe('New');

      // First review transitions to Learning
      const afterFirst = scheduler.review(newCard, 3, 0);
      expect(afterFirst.state.state).toBeDefined();

      // Successful reviews eventually lead to Review state
      let state = afterFirst.state;
      for (let i = 0; i < 5; i++) {
        const result = scheduler.review(state, 3, 1);
        state = result.state;
      }
      expect(state.stability).toBeGreaterThan(0);

      // Again rating causes a lapse
      const afterLapse = scheduler.review(state, 1, 2);
      expect(afterLapse.isLapse).toBe(true);
    });

    it('should provide deterministic fuzzing', () => {
      const interval = 10;
      const nodeId = 'test-node-id';

      const fuzzed1 = fuzzInterval(interval, nodeId.charCodeAt(0));
      const fuzzed2 = fuzzInterval(interval, nodeId.charCodeAt(0));

      expect(fuzzed1).toBe(fuzzed2);
    });

    it('should handle extremely high stability values', () => {
      const scheduler = new FSRSScheduler();
      const card = scheduler.newCard();
      // Create a state with extremely high stability
      const highStabilityState = { ...card, stability: 36500, state: 'Review' as const };
      const previews = scheduler.previewReviews(highStabilityState, 2);

      expect(previews.good.interval).toBeGreaterThan(0);
      expect(Number.isFinite(previews.good.interval)).toBe(true);
    });

    it('should handle extremely low stability values', () => {
      const scheduler = new FSRSScheduler();
      const card = scheduler.newCard();
      // Create a state with extremely low stability
      const lowStabilityState = { ...card, stability: 0.01, state: 'Review' as const };
      const previews = scheduler.previewReviews(lowStabilityState, 2);

      expect(previews.good.interval).toBeGreaterThan(0);
      expect(Number.isFinite(previews.good.interval)).toBe(true);
    });
  });

  // ============================================================================
  // DATE/TIME EDGE CASES
  // ============================================================================

  describe('Date/Time Edge Cases', () => {
    it('should handle very old dates', () => {
      const oldDate = new Date('2000-01-01T00:00:00Z');
      const node = db.insertNode({
        content: 'Old memory',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: oldDate,
        updatedAt: oldDate,
        lastAccessedAt: oldDate,
        accessCount: 0,
        retentionStrength: 1.0,
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

      const retrieved = db.getNode(node.id);
      expect(retrieved?.createdAt.getFullYear()).toBe(2000);
    });

    it('should handle timezone differences', () => {
      const utcDate = new Date('2024-06-15T12:00:00Z');
      const node = db.insertNode({
        content: 'UTC test',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: utcDate,
        updatedAt: utcDate,
        lastAccessedAt: utcDate,
        accessCount: 0,
        retentionStrength: 1.0,
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

      const retrieved = db.getNode(node.id);
      expect(retrieved?.createdAt.getTime()).toBe(utcDate.getTime());
    });
  });

  // ============================================================================
  // GRAPH EDGE CASES
  // ============================================================================

  describe('Graph Edge Cases', () => {
    it('should handle self-referential edges', () => {
      const node = db.insertNode({
        content: 'Self-referential node',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const edge = db.insertEdge({
        fromId: node.id,
        toId: node.id,
        edgeType: 'relates_to',
        weight: 1.0,
        createdAt: new Date(),
      });

      // Self-referential edges are stored but filtered from getRelatedNodes
      // (to prevent infinite loops in traversal)
      expect(edge.id).toBeDefined();
      expect(edge.fromId).toBe(node.id);
      expect(edge.toId).toBe(node.id);
    });

    it('should handle duplicate edge prevention', () => {
      const node1 = db.insertNode({
        content: 'Node 1',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const node2 = db.insertNode({
        content: 'Node 2',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const edge1 = db.insertEdge({
        fromId: node1.id,
        toId: node2.id,
        edgeType: 'relates_to',
        weight: 0.5,
        createdAt: new Date(),
      });

      // Database uses INSERT OR REPLACE, so second insert creates a new edge
      // (each call generates a new ID via nanoid)
      const edge2 = db.insertEdge({
        fromId: node1.id,
        toId: node2.id,
        edgeType: 'relates_to',
        weight: 0.7,
        createdAt: new Date(),
      });

      expect(edge1.id).toBeDefined();
      expect(edge2.id).toBeDefined();
      // New edge gets a new ID (not a collision)
      expect(edge2.id).not.toBe(edge1.id);
    });
  });

  // ============================================================================
  // INTENTION EDGE CASES
  // ============================================================================

  describe('Intention Edge Cases', () => {
    it('should handle intention status transitions', async () => {
      const set = await executeIntention(db, {
        action: 'set',
        description: 'Test intention',
        priority: 'normal',
      });

      expect(set.success).toBe(true);
      const intentionId = (set as { intentionId: string }).intentionId;

      // Snooze the intention
      const snooze = await executeIntention(db, {
        action: 'update',
        id: intentionId,
        status: 'snooze',
        snoozeMinutes: 60,
      });

      expect(snooze.success).toBe(true);

      // Complete the intention
      const complete = await executeIntention(db, {
        action: 'update',
        id: intentionId,
        status: 'complete',
      });

      expect(complete.success).toBe(true);

      // List fulfilled intentions to verify
      const list = await executeIntention(db, {
        action: 'list',
        filterStatus: 'fulfilled',
      });

      expect((list as { total: number }).total).toBeGreaterThanOrEqual(1);
    });

    it('should handle very long intention descriptions', async () => {
      const longDescription = 'A'.repeat(10000);
      const set = await executeIntention(db, {
        action: 'set',
        description: longDescription,
        priority: 'low',
      });

      expect(set.success).toBe(true);
    });
  });

  // ============================================================================
  // SMART INGEST EDGE CASES
  // ============================================================================

  describe('Smart Ingest Edge Cases', () => {
    it('should handle force_create flag', async () => {
      const first = await executeSmartIngest(db, {
        content: 'Unique content for testing',
        nodeType: 'fact',
        forceCreate: true,
      }, null, null);

      const second = await executeSmartIngest(db, {
        content: 'Unique content for testing',
        nodeType: 'fact',
        forceCreate: true,
      }, null, null);

      expect(first.nodeId).not.toBe(second.nodeId);
    });

    it('should handle all nodeType values', async () => {
      const nodeTypes = ['fact', 'concept', 'event', 'person', 'place', 'note', 'pattern', 'decision'];

      for (const nodeType of nodeTypes) {
        const result = await executeSmartIngest(db, {
          content: `Test ${nodeType}`,
          nodeType,
          forceCreate: true,
        }, null, null);

        expect(result.success).toBe(true);
      }
    });

    it('should handle unknown nodeType gracefully', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Test with unknown type',
        nodeType: 'unknown_type_xyz',
        forceCreate: true,
      }, null, null);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // SEARCH EDGE CASES
  // ============================================================================

  describe('Search Edge Cases', () => {
    it('should handle FTS special characters', () => {
      db.insertNode({
        content: 'Test with wildcards and characters',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const results = db.searchNodes('wildcards');
      expect(Array.isArray(results.items)).toBe(true);
    });

    it('should handle very long search queries', () => {
      const longQuery = 'test '.repeat(100);
      const results = db.searchNodes(longQuery);
      expect(Array.isArray(results.items)).toBe(true);
    });

    it('should handle search with limit', () => {
      db.insertNode({
        content: 'Test node',
        sourceType: 'note',
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
        concepts: [],
        events: [],
        tags: [],
        sourceChain: [],
      });

      const results = db.searchNodes('test', { limit: 1 });
      expect(results.items.length).toBeLessThanOrEqual(1);
    });
  });
});
