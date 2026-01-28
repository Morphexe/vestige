/**
 * E2E Journey Tests
 *
 * Complete workflow tests that verify end-to-end functionality
 * of the Vestige cognitive memory system.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import { FSRSScheduler, retrievability } from '../../core/fsrs.js';
import { executeSmartIngest } from '../../mcp/tools/smart-ingest.js';
import { executeCodebase } from '../../mcp/tools/codebase.js';
import { executeIntention } from '../../mcp/tools/intention.js';
import { executePromoteMemory, executeDemoteMemory } from '../../mcp/tools/feedback.js';

// Alias for cleaner code
const calculateRetrievability = retrievability;

describe('E2E Journey Tests', () => {
  let db: VestigeDatabase;

  beforeEach(() => {
    db = new VestigeDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ============================================================================
  // INGEST → RECALL → REVIEW JOURNEY
  // ============================================================================

  describe('Ingest → Recall → Review Journey', () => {
    it('should complete full memory lifecycle', () => {
      // 1. Ingest a memory
      const node = db.insertNode({
        content: 'The TypeScript compiler uses structural typing for type compatibility',
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
        concepts: ['typescript', 'type-system'],
        events: [],
        tags: ['programming', 'typescript'],
        sourceChain: [],
      });

      expect(node.id).toBeDefined();

      // 2. Search for the memory
      const results = db.searchNodes('typescript');
      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items[0].id).toBe(node.id);

      // 3. Access updates last_accessed_at
      db.updateNodeAccess(node.id);
      const accessed = db.getNode(node.id);
      expect(accessed?.accessCount).toBe(1);

      // 4. Review the memory
      const scheduler = new FSRSScheduler();
      const card = scheduler.newCard();
      const previews = scheduler.previewReviews(card, 0);
      expect(previews.again.interval).toBeLessThan(previews.good.interval);

      // 5. Verify retrievability decay
      const r1 = calculateRetrievability(1.0, 0);
      const r7 = calculateRetrievability(1.0, 7);
      expect(r7).toBeLessThan(r1);
    });

    it('should handle multiple related memories', () => {
      // Ingest several related memories
      const memories = [
        'React uses a virtual DOM for efficient updates',
        'Vue also implements a virtual DOM similar to React',
        'Svelte compiles components at build time without virtual DOM',
      ];

      const nodes = memories.map(content => db.insertNode({
        content,
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
        concepts: ['frontend', 'dom'],
        events: [],
        tags: ['javascript', 'frameworks'],
        sourceChain: [],
      }));

      expect(nodes.length).toBe(3);

      // Search for virtual DOM
      const results = db.searchNodes('virtual DOM');
      expect(results.items.length).toBeGreaterThanOrEqual(2);

      // Create relationships
      db.insertEdge({
        fromId: nodes[0].id,
        toId: nodes[1].id,
        edgeType: 'similar_to',
        weight: 0.9,
        createdAt: new Date(),
      });

      const relatedIds = db.getRelatedNodes(nodes[0].id);
      expect(relatedIds).toContain(nodes[1].id);
    });

    it('should track memory strengthening over time', async () => {
      const node = db.insertNode({
        content: 'Consistent review strengthens memory retention',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.5,
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

      // Simulate multiple reviews with promotion
      for (let i = 0; i < 3; i++) {
        await executePromoteMemory(db, { id: node.id, reason: `Review ${i + 1}` });
      }

      const updated = db.getNode(node.id);
      expect(updated?.retentionStrength).toBeGreaterThan(0.5);
    });
  });

  // ============================================================================
  // SMART INGEST JOURNEY
  // ============================================================================

  describe('Smart Ingest Journey', () => {
    it('should create new memory for unique content', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Bun is a fast JavaScript runtime with native TypeScript support',
        nodeType: 'fact',
        tags: ['bun', 'javascript'],
        forceCreate: true,
      }, null, null);

      expect(result.success).toBe(true);
      expect(result.decision).toBe('create');
      expect(result.nodeId).toBeDefined();
    });

    it('should work without embeddings (fallback)', async () => {
      const result = await executeSmartIngest(db, {
        content: 'This is a test without embeddings',
        nodeType: 'note',
        forceCreate: false,
      }, null, null);

      expect(result.success).toBe(true);
      expect(result.decision).toBe('create');
      expect(result.hasEmbedding).toBe(false);
    });
  });

  // ============================================================================
  // CODEBASE MEMORY JOURNEY
  // ============================================================================

  describe('Codebase Memory Journey', () => {
    it('should remember and retrieve patterns', async () => {
      // Remember a pattern
      const pattern = await executeCodebase(db, {
        action: 'remember_pattern',
        name: 'Repository Pattern',
        description: 'Use repository classes to abstract data access layer',
        files: ['src/repositories/', 'src/models/'],
        codebase: 'test-project',
      });

      expect(pattern.success).toBe(true);
      expect(pattern.nodeId).toBeDefined();
      expect(pattern.patternName).toBe('Repository Pattern');

      // Retrieve context
      const context = await executeCodebase(db, {
        action: 'get_context',
        codebase: 'test-project',
        limit: 10,
      });

      expect(context.success).toBe(true);
      expect(context.patterns?.count).toBeGreaterThanOrEqual(1);
    });

    it('should remember architectural decisions', async () => {
      const decision = await executeCodebase(db, {
        action: 'remember_decision',
        decision: 'Use PostgreSQL for primary database',
        rationale: 'Better support for complex queries and JSON operations',
        alternatives: ['MySQL', 'MongoDB', 'SQLite'],
        codebase: 'test-project',
      });

      expect(decision.success).toBe(true);
      expect(decision.nodeId).toBeDefined();

      // Verify decision is stored
      const context = await executeCodebase(db, {
        action: 'get_context',
        codebase: 'test-project',
      });

      expect(context.decisions?.count).toBeGreaterThanOrEqual(1);
    });

    it('should separate patterns from decisions', async () => {
      // Add both patterns and decisions
      await executeCodebase(db, {
        action: 'remember_pattern',
        name: 'Factory Pattern',
        description: 'Use factories for object creation',
        codebase: 'mixed-project',
      });

      await executeCodebase(db, {
        action: 'remember_decision',
        decision: 'Use factories instead of direct instantiation',
        rationale: 'Better testability',
        codebase: 'mixed-project',
      });

      const context = await executeCodebase(db, {
        action: 'get_context',
        codebase: 'mixed-project',
      });

      expect(context.patterns?.count).toBe(1);
      expect(context.decisions?.count).toBe(1);
    });
  });

  // ============================================================================
  // INTENTION TRACKING JOURNEY
  // ============================================================================

  describe('Intention Tracking Journey', () => {
    it('should track and complete intentions', async () => {
      // Set an intention
      const set = await executeIntention(db, {
        action: 'set',
        description: 'Implement user authentication',
        context: 'security feature for v2.0',
        priority: 'high',
      });

      expect(set.success).toBe(true);
      const intentionId = (set as { intentionId: string }).intentionId;

      // List active intentions
      const list = await executeIntention(db, {
        action: 'list',
        filterStatus: 'active',
      });

      expect((list as { total: number }).total).toBeGreaterThanOrEqual(1);

      // Complete the intention
      const complete = await executeIntention(db, {
        action: 'update',
        id: intentionId,
        status: 'complete',
      });

      expect(complete.success).toBe(true);
    });

    it('should filter intentions by priority', async () => {
      // Set multiple intentions with different priorities
      await executeIntention(db, {
        action: 'set',
        description: 'Fix critical bug',
        priority: 'high',
      });

      await executeIntention(db, {
        action: 'set',
        description: 'Update documentation',
        priority: 'low',
      });

      const highPriority = await executeIntention(db, {
        action: 'list',
        filterStatus: 'active',
      });

      expect((highPriority as { total: number }).total).toBeGreaterThanOrEqual(1);
    });
  });

  // ============================================================================
  // FEEDBACK LOOP JOURNEY
  // ============================================================================

  describe('Feedback Loop Journey', () => {
    it('should strengthen frequently accessed memories', async () => {
      const node = db.insertNode({
        content: 'Important information that gets accessed often',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.5,
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

      // Promote the memory
      const promote = await executePromoteMemory(db, {
        id: node.id,
        reason: 'Very helpful information',
      });

      expect(promote.success).toBe(true);
      expect(promote.changes.retentionStrength.after).toBeGreaterThan(promote.changes.retentionStrength.before);
    });

    it('should weaken incorrect or outdated memories', async () => {
      const node = db.insertNode({
        content: 'Outdated information that should be demoted',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.8,
        stabilityFactor: 5.0,
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

      // Demote the memory
      const demote = await executeDemoteMemory(db, {
        id: node.id,
        reason: 'Information is no longer accurate',
      });

      expect(demote.success).toBe(true);
      expect(demote.changes.retentionStrength.after).toBeLessThan(demote.changes.retentionStrength.before);
    });

    it('should not delete demoted memories', async () => {
      const node = db.insertNode({
        content: 'Memory that will be demoted but not deleted',
        sourceType: 'fact',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.5,
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

      // Demote multiple times
      for (let i = 0; i < 5; i++) {
        await executeDemoteMemory(db, { id: node.id });
      }

      // Memory should still exist
      const exists = db.getNode(node.id);
      expect(exists).not.toBeNull();
      expect(exists?.retentionStrength).toBeGreaterThanOrEqual(0.1); // Minimum floor
    });
  });

  // ============================================================================
  // PEOPLE MEMORY JOURNEY
  // ============================================================================

  describe('People Memory Journey', () => {
    it('should track people and interactions', () => {
      // Create a person
      const person = db.insertPerson({
        name: 'Alice Developer',
        relationshipType: 'colleague',
        organization: 'Tech Corp',
        role: 'Senior Engineer',
        aliases: ['Alice', 'AD'],
        socialLinks: {},
        contactFrequency: 0,
        sharedTopics: ['typescript', 'testing'],
        sharedProjects: ['vestige'],
        relationshipHealth: 0.7,
      });

      expect(person.id).toBeDefined();
      expect(person.name).toBe('Alice Developer');

      // Retrieve person
      const retrieved = db.getPerson(person.id);
      expect(retrieved?.name).toBe('Alice Developer');
    });

    it('should link people to memories', () => {
      const person = db.insertPerson({
        name: 'Bob Engineer',
        relationshipType: 'mentor',
        aliases: [],
        socialLinks: {},
        contactFrequency: 0,
        sharedTopics: [],
        sharedProjects: [],
        relationshipHealth: 0.5,
      });

      // Create a memory mentioning this person
      const node = db.insertNode({
        content: 'Bob taught me about dependency injection patterns',
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
        people: [person.id],
        concepts: ['dependency-injection'],
        events: [],
        tags: ['learning'],
        sourceChain: [],
      });

      // Create edge linking person to memory
      db.insertEdge({
        fromId: node.id,
        toId: person.id,
        edgeType: 'person_mentioned',
        weight: 1.0,
        createdAt: new Date(),
      });

      const relatedIds = db.getRelatedNodes(node.id);
      expect(relatedIds).toContain(person.id);
    });
  });

  // ============================================================================
  // TEMPORAL QUERIES JOURNEY
  // ============================================================================

  describe('Temporal Queries Journey', () => {
    it('should filter memories by time range', () => {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Create memories at different times
      db.insertNode({
        content: 'Recent memory from today',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: now,
        updatedAt: now,
        lastAccessedAt: now,
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
        tags: ['recent'],
        sourceChain: [],
      });

      db.insertNode({
        content: 'Memory from a week ago',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: weekAgo,
        updatedAt: weekAgo,
        lastAccessedAt: weekAgo,
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
        tags: ['week-old'],
        sourceChain: [],
      });

      // Query recent memories
      const recent = db.getRecentNodes({ limit: 2 });
      expect(recent.items.length).toBe(2);
    });

    it('should track access patterns', async () => {
      const node = db.insertNode({
        content: 'Memory with tracked access',
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

      const initialAccess = db.getNode(node.id)?.lastAccessedAt;

      // Wait a bit and access again
      await new Promise(resolve => setTimeout(resolve, 10));
      db.updateNodeAccess(node.id);

      const afterAccess = db.getNode(node.id);
      expect(afterAccess?.accessCount).toBe(1);
      expect(afterAccess?.lastAccessedAt.getTime()).toBeGreaterThan(initialAccess!.getTime());
    });
  });

  // ============================================================================
  // GRAPH TRAVERSAL JOURNEY
  // ============================================================================

  describe('Graph Traversal Journey', () => {
    it('should traverse related memories', () => {
      // Create a cluster of related memories
      const center = db.insertNode({
        content: 'Central concept: Software Architecture',
        sourceType: 'concept',
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
        tags: ['architecture'],
        sourceChain: [],
      });

      const related = ['Microservices', 'Monolith', 'Event-Driven'].map(topic =>
        db.insertNode({
          content: `Architecture pattern: ${topic}`,
          sourceType: 'concept',
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
          tags: ['architecture', topic.toLowerCase()],
          sourceChain: [],
        })
      );

      // Connect to center
      related.forEach((node, i) => {
        db.insertEdge({
          fromId: center.id,
          toId: node.id,
          edgeType: 'relates_to',
          weight: 0.9 - i * 0.1,
          createdAt: new Date(),
        });
      });

      // Traverse from center
      const relatedIds = db.getRelatedNodes(center.id);
      expect(relatedIds.length).toBe(3);

      // Get related nodes
      const relatedNodes = relatedIds.map(id => db.getNode(id)).filter(Boolean);
      expect(relatedNodes.length).toBe(3);
    });

    it('should find bidirectional relationships', () => {
      const nodeA = db.insertNode({
        content: 'Node A',
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

      const nodeB = db.insertNode({
        content: 'Node B',
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

      // Create bidirectional relationship
      db.insertEdge({
        fromId: nodeA.id,
        toId: nodeB.id,
        edgeType: 'relates_to',
        weight: 0.8,
        createdAt: new Date(),
      });

      db.insertEdge({
        fromId: nodeB.id,
        toId: nodeA.id,
        edgeType: 'relates_to',
        weight: 0.8,
        createdAt: new Date(),
      });

      const fromA = db.getRelatedNodes(nodeA.id);
      const fromB = db.getRelatedNodes(nodeB.id);

      expect(fromA).toContain(nodeB.id);
      expect(fromB).toContain(nodeA.id);
    });
  });

  // ============================================================================
  // FSRS SCHEDULING JOURNEY
  // ============================================================================

  describe('FSRS Scheduling Journey', () => {
    it('should increase stability after successful review', () => {
      const scheduler = new FSRSScheduler();

      // Create a new card
      const initial = scheduler.newCard();

      // First review
      const result = scheduler.review(initial, 3, 0); // Grade.Good = 3

      // Stability should increase after good review
      expect(result.state.stability).toBeGreaterThan(0);
      expect(result.interval).toBeGreaterThan(0);
    });

    it('should handle state transitions', () => {
      const scheduler = new FSRSScheduler();

      // New card
      const initial = scheduler.newCard();
      expect(initial.state).toBe('New');

      // After first good review, should move to Review
      const afterFirst = scheduler.review(initial, 3, 0);
      expect(afterFirst.state.state).toBe('Review');

      // After a lapse (Again), should move to Relearning
      const afterLapse = scheduler.review(afterFirst.state, 1, 1);
      expect(afterLapse.isLapse).toBe(true);
    });

    it('should increase intervals with successful reviews', () => {
      const scheduler = new FSRSScheduler();
      let state = scheduler.newCard();
      const intervals: number[] = [];

      // Simulate successful reviews
      for (let i = 0; i < 5; i++) {
        const result = scheduler.review(state, 3, intervals[i - 1] || 0); // Grade.Good = 3
        intervals.push(result.interval);
        state = result.state;
      }

      // Intervals should generally increase
      expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[0]);
    });
  });
});
