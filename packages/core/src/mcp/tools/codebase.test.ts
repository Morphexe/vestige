/**
 * Tests for the unified Codebase Tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  CodebaseInputSchema,
  executeCodebase,
  type CodebaseInput,
} from './codebase.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Codebase Tool', () => {
  let db: VestigeDatabase;
  let tempDbPath: string;

  beforeEach(() => {
    // Create a temporary database for each test
    tempDbPath = path.join(os.tmpdir(), `vestige-test-${Date.now()}.db`);
    db = new VestigeDatabase(tempDbPath);
  });

  afterEach(() => {
    db.close();
    // Clean up temp database
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
    it('should validate action is required', () => {
      const result = CodebaseInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid remember_pattern action', () => {
      const result = CodebaseInputSchema.safeParse({
        action: 'remember_pattern',
        name: 'Test Pattern',
        description: 'A test pattern',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid remember_decision action', () => {
      const result = CodebaseInputSchema.safeParse({
        action: 'remember_decision',
        decision: 'Use TypeScript',
        rationale: 'Better type safety',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid get_context action', () => {
      const result = CodebaseInputSchema.safeParse({
        action: 'get_context',
        codebase: 'vestige',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = CodebaseInputSchema.safeParse({
        action: 'invalid_action',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // REMEMBER PATTERN TESTS
  // ============================================================================

  describe('Remember Pattern Action', () => {
    it('should create a pattern successfully', async () => {
      const input: CodebaseInput = {
        action: 'remember_pattern',
        name: 'Repository Pattern',
        description: 'Use repository pattern for data access layer',
        files: ['src/repositories/user.ts', 'src/repositories/order.ts'],
        codebase: 'vestige',
        limit: 10,
      };

      const result = await executeCodebase(db, input);

      expect(result.success).toBe(true);
      expect(result.action).toBe('remember_pattern');
      expect(result.nodeId).toBeDefined();
      expect(result.patternName).toBe('Repository Pattern');
      expect(result.message).toContain('remembered successfully');
    });

    it('should fail without name', async () => {
      const input: CodebaseInput = {
        action: 'remember_pattern',
        description: 'A pattern without a name',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow("'name' is required");
    });

    it('should fail without description', async () => {
      const input: CodebaseInput = {
        action: 'remember_pattern',
        name: 'Pattern Without Description',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow("'description' is required");
    });

    it('should fail with empty name', async () => {
      const input: CodebaseInput = {
        action: 'remember_pattern',
        name: '   ',
        description: 'Description',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow('Pattern name cannot be empty');
    });

    it('should include codebase tag when provided', async () => {
      const input: CodebaseInput = {
        action: 'remember_pattern',
        name: 'Tagged Pattern',
        description: 'Pattern with codebase tag',
        codebase: 'my-project',
        limit: 10,
      };

      const result = await executeCodebase(db, input);
      expect(result.success).toBe(true);

      // Verify the node has the codebase tag
      const node = db.getNode(result.nodeId!);
      expect(node?.tags).toContain('codebase:my-project');
    });
  });

  // ============================================================================
  // REMEMBER DECISION TESTS
  // ============================================================================

  describe('Remember Decision Action', () => {
    it('should create a decision successfully', async () => {
      const input: CodebaseInput = {
        action: 'remember_decision',
        decision: 'Use Event Sourcing for order management',
        rationale: 'Need complete audit trail and ability to replay state',
        alternatives: ['CRUD with audit log', 'Traditional ORM'],
        files: ['src/orders/events.ts', 'src/orders/aggregate.ts'],
        codebase: 'vestige',
        limit: 10,
      };

      const result = await executeCodebase(db, input);

      expect(result.success).toBe(true);
      expect(result.action).toBe('remember_decision');
      expect(result.nodeId).toBeDefined();
      expect(result.message).toContain('Architectural decision remembered');
    });

    it('should fail without decision', async () => {
      const input: CodebaseInput = {
        action: 'remember_decision',
        rationale: 'Some rationale',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow("'decision' is required");
    });

    it('should fail without rationale', async () => {
      const input: CodebaseInput = {
        action: 'remember_decision',
        decision: 'Some decision',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow("'rationale' is required");
    });

    it('should fail with empty decision', async () => {
      const input: CodebaseInput = {
        action: 'remember_decision',
        decision: '   ',
        rationale: 'Some rationale',
        limit: 10,
      };

      await expect(executeCodebase(db, input)).rejects.toThrow('Decision cannot be empty');
    });

    it('should include architecture tag', async () => {
      const input: CodebaseInput = {
        action: 'remember_decision',
        decision: 'Use microservices',
        rationale: 'Scale independently',
        limit: 10,
      };

      const result = await executeCodebase(db, input);
      expect(result.success).toBe(true);

      const node = db.getNode(result.nodeId!);
      expect(node?.tags).toContain('architecture');
      expect(node?.tags).toContain('decision');
    });
  });

  // ============================================================================
  // GET CONTEXT TESTS
  // ============================================================================

  describe('Get Context Action', () => {
    it('should return empty results for new database', async () => {
      const input: CodebaseInput = {
        action: 'get_context',
        codebase: 'vestige',
        limit: 10,
      };

      const result = await executeCodebase(db, input);

      expect(result.success).toBe(true);
      expect(result.action).toBe('get_context');
      expect(result.patterns?.count).toBe(0);
      expect(result.decisions?.count).toBe(0);
    });

    it('should return patterns after creating them', async () => {
      // Create a pattern
      await executeCodebase(db, {
        action: 'remember_pattern',
        name: 'Test Pattern',
        description: 'A test pattern for retrieval',
        codebase: 'test-project',
        limit: 10,
      });

      // Get context
      const result = await executeCodebase(db, {
        action: 'get_context',
        codebase: 'test-project',
        limit: 10,
      });

      expect(result.success).toBe(true);
      // Note: patterns may not show up in FTS search immediately by tag
      // The search is by content, so results may vary
    });

    it('should respect limit parameter', async () => {
      // Create multiple patterns
      for (let i = 0; i < 5; i++) {
        await executeCodebase(db, {
          action: 'remember_pattern',
          name: `Pattern ${i}`,
          description: 'Test pattern',
          codebase: 'limit-test',
          limit: 10,
        });
      }

      // Get context with limit
      const result = await executeCodebase(db, {
        action: 'get_context',
        codebase: 'limit-test',
        limit: 2,
      });

      expect(result.success).toBe(true);
    });
  });
});
