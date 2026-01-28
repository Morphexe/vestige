/**
 * Tests for Hippocampal Index
 *
 * Tests cover:
 * - Barcode generation
 * - Embedding compression (768→128 dimensions)
 * - Memory indexing
 * - Search scoring
 * - Association traversal (spreading activation)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  HippocampalIndexManager,
  generateBarcode,
  compressEmbedding,
  createImportanceFlags,
  calculateImportanceScore,
  calculateTemporalScore,
  indexMemory,
  COMPRESSED_DIMENSION,
  ORIGINAL_DIMENSION,
  type MemoryBarcode,
  type MemoryIndex,
  type IndexQuery,
  type TemporalMarker,
  type ImportanceFlags,
} from '../../neuroscience/hippocampal-index.js';
import type { KnowledgeNode } from '../../core/types.js';

describe('Hippocampal Index', () => {
  let manager: HippocampalIndexManager;

  beforeEach(() => {
    manager = new HippocampalIndexManager();
  });

  // ==========================================================================
  // 1. BARCODE GENERATION TESTS
  // ==========================================================================

  describe('generateBarcode', () => {
    it('should generate unique barcodes for different content', () => {
      const barcode1 = generateBarcode('Hello world');
      const barcode2 = generateBarcode('Goodbye world');

      expect(barcode1.contentHash).not.toBe(barcode2.contentHash);
    });

    it('should generate same content hash for same content', () => {
      const barcode1 = generateBarcode('Test content');
      const barcode2 = generateBarcode('Test content');

      expect(barcode1.contentHash).toBe(barcode2.contentHash);
    });

    it('should include temporal hash', () => {
      const barcode = generateBarcode('Test content');

      expect(barcode.temporalHash).toBeDefined();
      expect(barcode.temporalHash.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs', () => {
      const barcode1 = generateBarcode('Content 1');
      const barcode2 = generateBarcode('Content 2');

      expect(barcode1.id).not.toBe(barcode2.id);
    });

    it('should generate different temporal hashes with different temporal context', () => {
      const time1 = new Date('2024-01-01');
      const time2 = new Date('2024-06-01');

      const barcode1 = generateBarcode('Same content', time1);
      const barcode2 = generateBarcode('Same content', time2);

      expect(barcode1.temporalHash).not.toBe(barcode2.temporalHash);
    });
  });

  // ==========================================================================
  // 2. EMBEDDING COMPRESSION TESTS
  // ==========================================================================

  describe('compressEmbedding', () => {
    it('should compress 768-dim embedding to 128-dim', () => {
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const compressed = compressEmbedding(embedding);

      expect(compressed.length).toBe(COMPRESSED_DIMENSION);
    });

    it('should return same if already target dimension', () => {
      const embedding = Array(COMPRESSED_DIMENSION).fill(0.5);
      const compressed = compressEmbedding(embedding);

      expect(compressed.length).toBe(COMPRESSED_DIMENSION);
      expect(compressed).toEqual(embedding);
    });

    it('should handle zero embedding', () => {
      const embedding = Array(ORIGINAL_DIMENSION).fill(0);
      const compressed = compressEmbedding(embedding);

      expect(compressed.length).toBe(COMPRESSED_DIMENSION);
      expect(compressed.every(v => v === 0)).toBe(true);
    });

    it('should pad small embeddings', () => {
      const small = Array(64).fill(0.5);
      const compressed = compressEmbedding(small);

      expect(compressed.length).toBe(COMPRESSED_DIMENSION);
    });

    it('should L2 normalize the result', () => {
      const embedding = Array(ORIGINAL_DIMENSION).fill(1.0);
      const compressed = compressEmbedding(embedding);

      // Check that it's approximately normalized (L2 norm ≈ 1)
      const norm = Math.sqrt(compressed.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 3);
    });
  });

  // ==========================================================================
  // 3. IMPORTANCE FLAGS TESTS
  // ==========================================================================

  describe('createImportanceFlags', () => {
    const createMockNode = (overrides: Partial<KnowledgeNode> = {}): KnowledgeNode => ({
      id: 'test-id',
      content: 'Test content',
      summary: null,
      retentionStrength: 0.5,
      stabilityFactor: 1.0,
      storageStrength: 0.5,
      retrievalStrength: 0.5,
      sentimentIntensity: 0.3,
      accessCount: 5,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      sourceType: 'note',
      sourcePlatform: 'manual',
      sourceId: null,
      sourceUrl: null,
      tags: [],
      people: [],
      concepts: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      nextReviewDate: null,
      gitContext: null,
      ...overrides,
    });

    it('should detect emotional content', () => {
      const node = createMockNode({ sentimentIntensity: 0.8 });
      const flags = createImportanceFlags(node);

      expect(flags.emotional).toBe(true);
    });

    it('should detect frequently accessed', () => {
      const node = createMockNode({ accessCount: 15 });
      const flags = createImportanceFlags(node);

      expect(flags.frequentlyAccessed).toBe(true);
    });

    it('should detect recently created', () => {
      const node = createMockNode({ createdAt: new Date() });
      const flags = createImportanceFlags(node);

      expect(flags.recentlyCreated).toBe(true);
    });

    it('should detect high retention', () => {
      const node = createMockNode({ retentionStrength: 0.9 });
      const flags = createImportanceFlags(node);

      expect(flags.highRetention).toBe(true);
    });

    it('should detect user starred', () => {
      const node = createMockNode({ tags: ['important', 'typescript'] });
      const flags = createImportanceFlags(node);

      expect(flags.userStarred).toBe(true);
    });
  });

  // ==========================================================================
  // 4. IMPORTANCE SCORE TESTS
  // ==========================================================================

  describe('calculateImportanceScore', () => {
    it('should return 0 for all false flags', () => {
      const flags: ImportanceFlags = {
        emotional: false,
        frequentlyAccessed: false,
        recentlyCreated: false,
        hasAssociations: false,
        userStarred: false,
        highRetention: false,
        consolidated: false,
        compressed: false,
      };

      const score = calculateImportanceScore(flags);
      expect(score).toBe(0);
    });

    it('should accumulate multiple flags', () => {
      const singleFlag: ImportanceFlags = {
        emotional: true,
        frequentlyAccessed: false,
        recentlyCreated: false,
        hasAssociations: false,
        userStarred: false,
        highRetention: false,
        consolidated: false,
        compressed: false,
      };

      const multipleFlags: ImportanceFlags = {
        emotional: true,
        frequentlyAccessed: true,
        recentlyCreated: true,
        hasAssociations: false,
        userStarred: false,
        highRetention: false,
        consolidated: false,
        compressed: false,
      };

      const scoreSingle = calculateImportanceScore(singleFlag);
      const scoreMultiple = calculateImportanceScore(multipleFlags);

      expect(scoreMultiple).toBeGreaterThan(scoreSingle);
    });

    it('should cap at 1.0', () => {
      const allFlags: ImportanceFlags = {
        emotional: true,
        frequentlyAccessed: true,
        recentlyCreated: true,
        hasAssociations: true,
        userStarred: true,
        highRetention: true,
        consolidated: true,
        compressed: true,
      };

      const score = calculateImportanceScore(allFlags);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  // ==========================================================================
  // 5. TEMPORAL SCORE TESTS
  // ==========================================================================

  describe('calculateTemporalScore', () => {
    it('should return high score for recently accessed', () => {
      const temporal: TemporalMarker = {
        createdAt: new Date(),
        lastAccessed: new Date(),
        accessCount: 1,
      };

      const score = calculateTemporalScore(temporal);
      expect(score).toBeGreaterThan(0.9);
    });

    it('should decay over time', () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const recentTemporal: TemporalMarker = {
        createdAt: now,
        lastAccessed: now,
        accessCount: 1,
      };

      const hourOldTemporal: TemporalMarker = {
        createdAt: hourAgo,
        lastAccessed: hourAgo,
        accessCount: 1,
      };

      const dayOldTemporal: TemporalMarker = {
        createdAt: dayAgo,
        lastAccessed: dayAgo,
        accessCount: 1,
      };

      const recentScore = calculateTemporalScore(recentTemporal, now);
      const hourScore = calculateTemporalScore(hourOldTemporal, now);
      const dayScore = calculateTemporalScore(dayOldTemporal, now);

      expect(recentScore).toBeGreaterThan(hourScore);
      expect(hourScore).toBeGreaterThan(dayScore);
    });

    it('should never return negative', () => {
      const veryOld: TemporalMarker = {
        createdAt: new Date(0),
        lastAccessed: new Date(0),
        accessCount: 1,
      };

      const score = calculateTemporalScore(veryOld);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // 6. MANAGER INDEX OPERATIONS
  // ==========================================================================

  describe('HippocampalIndexManager', () => {
    const createMockNode = (id: string): KnowledgeNode => ({
      id,
      content: `Test content for ${id}`,
      summary: null,
      retentionStrength: 0.8,
      stabilityFactor: 1.0,
      storageStrength: 0.5,
      retrievalStrength: 0.5,
      sentimentIntensity: 0.3,
      accessCount: 5,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      sourceType: 'note',
      sourcePlatform: 'manual',
      sourceId: null,
      sourceUrl: null,
      tags: [],
      people: [],
      concepts: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      nextReviewDate: null,
      gitContext: null,
    });

    it('should add and retrieve index', () => {
      const node = createMockNode('test-1');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);

      manager.addIndex(index);
      const retrieved = manager.getIndex('test-1');

      expect(retrieved).toBeDefined();
      expect(retrieved?.barcode.id).toBe('test-1');
    });

    it('should remove indexed memory', () => {
      const node = createMockNode('test-1');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);

      manager.addIndex(index);
      const removed = manager.removeIndex('test-1');

      expect(removed).toBe(true);
      expect(manager.getIndex('test-1')).toBeNull();
    });

    it('should find by content hash', () => {
      const node = createMockNode('test-1');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);

      manager.addIndex(index);
      const found = manager.findByContentHash(index.barcode.contentHash);

      expect(found).toBe('test-1');
    });

    it('should track statistics', () => {
      const node = createMockNode('test-1');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);

      manager.addIndex(index);
      const stats = manager.getStats();

      expect(stats.totalIndices).toBe(1);
    });
  });

  // ==========================================================================
  // 7. SEARCH TESTS
  // ==========================================================================

  describe('searchIndices', () => {
    const createMockNode = (id: string, content: string): KnowledgeNode => ({
      id,
      content,
      summary: null,
      retentionStrength: 0.8,
      stabilityFactor: 1.0,
      storageStrength: 0.5,
      retrievalStrength: 0.5,
      sentimentIntensity: 0.3,
      accessCount: 5,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      sourceType: 'note',
      sourcePlatform: 'manual',
      sourceId: null,
      sourceUrl: null,
      tags: [],
      people: [],
      concepts: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      nextReviewDate: null,
      gitContext: null,
    });

    beforeEach(() => {
      // Add some test memories
      const nodes = [
        createMockNode('node-1', 'TypeScript code example'),
        createMockNode('node-2', 'JavaScript tutorial'),
        createMockNode('node-3', 'Python documentation'),
      ];

      for (const node of nodes) {
        const embedding = Array(ORIGINAL_DIMENSION).fill(Math.random() * 0.5);
        const index = indexMemory(node, embedding);
        manager.addIndex(index);
      }
    });

    it('should return results sorted by combined score', () => {
      const results = manager.searchIndices({});

      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.combinedScore).toBeGreaterThanOrEqual(results[i]!.combinedScore);
      }
    });

    it('should respect limit parameter', () => {
      const results = manager.searchIndices({}, 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should include all score components in results', () => {
      const results = manager.searchIndices({});

      if (results.length > 0) {
        const result = results[0]!;
        expect(result.semanticScore).toBeDefined();
        expect(result.textScore).toBeDefined();
        expect(result.temporalScore).toBeDefined();
        expect(result.importanceScore).toBeDefined();
        expect(result.combinedScore).toBeDefined();
      }
    });
  });

  // ==========================================================================
  // 8. ASSOCIATION TESTS
  // ==========================================================================

  describe('associations', () => {
    const createMockNode = (id: string): KnowledgeNode => ({
      id,
      content: `Content for ${id}`,
      summary: null,
      retentionStrength: 0.8,
      stabilityFactor: 1.0,
      storageStrength: 0.5,
      retrievalStrength: 0.5,
      sentimentIntensity: 0.3,
      accessCount: 5,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      sourceType: 'note',
      sourcePlatform: 'manual',
      sourceId: null,
      sourceUrl: null,
      tags: [],
      people: [],
      concepts: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      nextReviewDate: null,
      gitContext: null,
    });

    beforeEach(() => {
      // Create some connected memories
      const nodes = ['a', 'b', 'c'].map(id => createMockNode(id));
      for (const node of nodes) {
        const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
        const index = indexMemory(node, embedding);
        manager.addIndex(index);
      }
    });

    it('should add association between memories', () => {
      const result = manager.addAssociation('a', 'b', 'semantic', 0.8);
      expect(result).toBe(true);

      const indexA = manager.getIndex('a');
      expect(indexA?.links.some(l => l.targetId === 'b')).toBe(true);
    });

    it('should get associations with depth 1', () => {
      manager.addAssociation('a', 'b', 'semantic', 0.8);
      manager.addAssociation('b', 'c', 'semantic', 0.7);

      const associations = manager.getAssociations('a', 1);
      expect(associations).toContain('b');
      expect(associations).not.toContain('c');
    });

    it('should get associations with depth 2 (spreading activation)', () => {
      manager.addAssociation('a', 'b', 'semantic', 0.8);
      manager.addAssociation('b', 'c', 'semantic', 0.7);

      const associations = manager.getAssociations('a', 2);
      expect(associations).toContain('b');
      expect(associations).toContain('c');
    });

    it('should handle association link types', () => {
      manager.addAssociation('a', 'b', 'temporal', 0.9);
      manager.addAssociation('a', 'c', 'causal', 0.6);

      const indexA = manager.getIndex('a');
      const temporalLink = indexA?.links.find(l => l.linkType === 'temporal');
      const causalLink = indexA?.links.find(l => l.linkType === 'causal');

      expect(temporalLink?.targetId).toBe('b');
      expect(causalLink?.targetId).toBe('c');
    });

    it('should return false for non-existent nodes', () => {
      const result = manager.addAssociation('nonexistent', 'b', 'semantic', 0.5);
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // 9. CLEAR AND EXPORT/IMPORT
  // ==========================================================================

  describe('clear and export/import', () => {
    const createMockNode = (id: string): KnowledgeNode => ({
      id,
      content: `Content for ${id}`,
      summary: null,
      retentionStrength: 0.8,
      stabilityFactor: 1.0,
      storageStrength: 0.5,
      retrievalStrength: 0.5,
      sentimentIntensity: 0.3,
      accessCount: 5,
      reviewCount: 0,
      confidence: 0.8,
      isContradicted: false,
      contradictionIds: [],
      sourceType: 'note',
      sourcePlatform: 'manual',
      sourceId: null,
      sourceUrl: null,
      tags: [],
      people: [],
      concepts: [],
      events: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      nextReviewDate: null,
      gitContext: null,
    });

    it('should clear all indices', () => {
      const node = createMockNode('test');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);
      manager.addIndex(index);

      manager.clear();

      expect(manager.getStats().totalIndices).toBe(0);
      expect(manager.getIndex('test')).toBeNull();
    });

    it('should export and import indices', () => {
      const node = createMockNode('test');
      const embedding = Array(ORIGINAL_DIMENSION).fill(0.5);
      const index = indexMemory(node, embedding);
      manager.addIndex(index);

      const exported = manager.export();
      manager.clear();

      const newManager = new HippocampalIndexManager();
      newManager.import(exported);

      expect(newManager.getStats().totalIndices).toBe(1);
      expect(newManager.getIndex('test')).toBeDefined();
    });
  });
});
