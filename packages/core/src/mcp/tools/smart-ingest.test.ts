/**
 * Tests for the Smart Ingest Tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  SmartIngestInputSchema,
  executeSmartIngest,
  type SmartIngestInput,
  type SmartIngestResult,
} from './smart-ingest.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Smart Ingest Tool', () => {
  let db: VestigeDatabase;
  let tempDbPath: string;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `vestige-test-${Date.now()}.db`);
    db = new VestigeDatabase(tempDbPath);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(tempDbPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // SCHEMA TESTS
  // ============================================================================

  describe('Schema Validation', () => {
    it('should require content', () => {
      const result = SmartIngestInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid input', () => {
      const result = SmartIngestInputSchema.safeParse({
        content: 'This is some content to remember',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional fields', () => {
      const result = SmartIngestInputSchema.safeParse({
        content: 'Content',
        nodeType: 'fact',
        tags: ['tag1', 'tag2'],
        source: 'test source',
        forceCreate: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty content', () => {
      const result = SmartIngestInputSchema.safeParse({
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('should have default values', () => {
      const result = SmartIngestInputSchema.parse({
        content: 'Test content',
      });
      expect(result.nodeType).toBe('fact');
      expect(result.forceCreate).toBe(false);
    });
  });

  // ============================================================================
  // BASIC INGESTION TESTS (without embeddings)
  // ============================================================================

  describe('Basic Ingestion (without embeddings)', () => {
    it('should create a new memory', async () => {
      const input: SmartIngestInput = {
        content: 'This is a test fact to remember.',
        nodeType: 'fact',
        forceCreate: false,
      };

      const result = await executeSmartIngest(db, input);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(result.decision).toBe('create');
    });

    it('should handle forceCreate flag', async () => {
      const input: SmartIngestInput = {
        content: 'Force create test content.',
        forceCreate: true,
        nodeType: 'fact',
      };

      const result = await executeSmartIngest(db, input);

      expect(result.success).toBe(true);
      expect(result.decision).toBe('create');
      expect(result.reason).toContain('Forced creation');
    });

    it('should reject whitespace-only content', async () => {
      const input: SmartIngestInput = {
        content: '   ',
        nodeType: 'fact',
        forceCreate: false,
      };

      await expect(executeSmartIngest(db, input)).rejects.toThrow('Content cannot be empty');
    });

    it('should store tags when provided', async () => {
      const input: SmartIngestInput = {
        content: 'Memory with tags',
        tags: ['important', 'test'],
        nodeType: 'fact',
        forceCreate: false,
      };

      const result = await executeSmartIngest(db, input);
      expect(result.success).toBe(true);

      const node = db.getNode(result.nodeId);
      expect(node?.tags).toContain('important');
      expect(node?.tags).toContain('test');
    });

    it('should set node type correctly', async () => {
      const input: SmartIngestInput = {
        content: 'A concept to remember',
        nodeType: 'concept',
        forceCreate: false,
      };

      const result = await executeSmartIngest(db, input);
      expect(result.success).toBe(true);

      const node = db.getNode(result.nodeId);
      expect(node?.sourceType).toBe('concept');
    });

    it('should set source when provided', async () => {
      const input: SmartIngestInput = {
        content: 'Memory with source',
        source: 'wikipedia',
        nodeType: 'fact',
        forceCreate: false,
      };

      const result = await executeSmartIngest(db, input);
      expect(result.success).toBe(true);

      const node = db.getNode(result.nodeId);
      expect(node?.sourcePlatform).toBe('wikipedia');
    });
  });

  // ============================================================================
  // RESULT STRUCTURE TESTS
  // ============================================================================

  describe('Result Structure', () => {
    it('should return complete result structure', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Test content for structure validation',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('decision');
      expect(result).toHaveProperty('nodeId');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('hasEmbedding');
      expect(result).toHaveProperty('similarity');
      expect(result).toHaveProperty('predictionError');
      expect(result).toHaveProperty('supersededId');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('explanation');
    });

    it('should set hasEmbedding to false when no embedding service', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Test content',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result.hasEmbedding).toBe(false);
    });

    it('should set predictionError to 1.0 for new content', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Completely new content',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result.predictionError).toBe(1.0);
    });

    it('should have null supersededId for new memories', async () => {
      const result = await executeSmartIngest(db, {
        content: 'New memory',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result.supersededId).toBeNull();
    });
  });

  // ============================================================================
  // MULTIPLE INGESTIONS
  // ============================================================================

  describe('Multiple Ingestions', () => {
    it('should create multiple independent memories', async () => {
      const result1 = await executeSmartIngest(db, {
        content: 'First memory',
        nodeType: 'fact',
        forceCreate: false,
      });
      const result2 = await executeSmartIngest(db, {
        content: 'Second memory',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result1.nodeId).not.toBe(result2.nodeId);
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });

    it('should force create even with similar content', async () => {
      await executeSmartIngest(db, {
        content: 'The capital of France is Paris',
        nodeType: 'fact',
        forceCreate: false,
      });

      // Force create similar content
      const result = await executeSmartIngest(db, {
        content: 'The capital of France is Paris',
        forceCreate: true,
        nodeType: 'fact',
      });

      expect(result.success).toBe(true);
      expect(result.decision).toBe('create');
    });
  });

  // ============================================================================
  // DECISION EXPLANATIONS
  // ============================================================================

  describe('Decision Explanations', () => {
    it('should provide meaningful explanation for create', async () => {
      const result = await executeSmartIngest(db, {
        content: 'New fact to remember',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result.explanation).toContain('Created new memory');
    });

    it('should indicate when embeddings are unavailable', async () => {
      const result = await executeSmartIngest(db, {
        content: 'Content without embeddings',
        nodeType: 'fact',
        forceCreate: false,
      });

      expect(result.reason).toContain('Embeddings not available');
    });
  });
});
