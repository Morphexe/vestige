/**
 * Tests for the Feedback Tools
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  PromoteMemoryInputSchema,
  DemoteMemoryInputSchema,
  RequestFeedbackInputSchema,
  executePromoteMemory,
  executeDemoteMemory,
  executeRequestFeedback,
} from './feedback.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Feedback Tools', () => {
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

  // Helper to create a test node
  // Note: stabilityFactor is not included in insertNode, so it defaults to 1.0
  function createTestNode(retentionStrength = 0.5): string {
    const node = db.insertNode({
      content: 'This is a test memory for feedback testing',
      sourceType: 'note',
      sourcePlatform: 'manual',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      retentionStrength,
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
    return node.id;
  }

  // ============================================================================
  // SCHEMA TESTS
  // ============================================================================

  describe('Schema Validation', () => {
    it('should validate promote_memory requires id', () => {
      const result = PromoteMemoryInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate demote_memory requires id', () => {
      const result = DemoteMemoryInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should validate request_feedback requires id', () => {
      const result = RequestFeedbackInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid promote_memory input', () => {
      const result = PromoteMemoryInputSchema.safeParse({
        id: 'test-id',
        reason: 'It was helpful',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid demote_memory input', () => {
      const result = DemoteMemoryInputSchema.safeParse({
        id: 'test-id',
        reason: 'It was outdated',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid request_feedback input', () => {
      const result = RequestFeedbackInputSchema.safeParse({
        id: 'test-id',
        context: 'error handling',
      });
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // PROMOTE MEMORY TESTS
  // ============================================================================

  describe('Promote Memory', () => {
    it('should promote a memory successfully', async () => {
      const nodeId = createTestNode();

      const result = await executePromoteMemory(db, { id: nodeId });

      expect(result.success).toBe(true);
      expect(result.action).toBe('promoted');
      expect(result.nodeId).toBe(nodeId);
      expect(result.changes.retentionStrength.after).toBeGreaterThan(result.changes.retentionStrength.before);
      expect(result.changes.stability.after).toBeGreaterThan(result.changes.stability.before);
    });

    it('should include reason when provided', async () => {
      const nodeId = createTestNode();

      const result = await executePromoteMemory(db, {
        id: nodeId,
        reason: 'Very helpful for debugging',
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Very helpful for debugging');
    });

    it('should fail for non-existent node', async () => {
      await expect(executePromoteMemory(db, { id: 'non-existent' })).rejects.toThrow('Node not found');
    });

    it('should cap retention strength at 1.0', async () => {
      // Create a node with high retention
      const node = db.insertNode({
        content: 'High retention memory',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.95,
        stabilityFactor: 10,
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

      const result = await executePromoteMemory(db, { id: node.id });

      expect(result.changes.retentionStrength.after).toBeLessThanOrEqual(1.0);
    });
  });

  // ============================================================================
  // DEMOTE MEMORY TESTS
  // ============================================================================

  describe('Demote Memory', () => {
    it('should demote a memory successfully', async () => {
      const nodeId = createTestNode();

      const result = await executeDemoteMemory(db, { id: nodeId });

      expect(result.success).toBe(true);
      expect(result.action).toBe('demoted');
      expect(result.nodeId).toBe(nodeId);
      expect(result.changes.retentionStrength.after).toBeLessThan(result.changes.retentionStrength.before);
      // Note: stability has a minimum floor of 1.0, so it may not decrease if already at 1
      expect(result.changes.stability.after).toBeLessThanOrEqual(result.changes.stability.before);
    });

    it('should include reason when provided', async () => {
      const nodeId = createTestNode();

      const result = await executeDemoteMemory(db, {
        id: nodeId,
        reason: 'Information was outdated',
      });

      expect(result.success).toBe(true);
      expect(result.reason).toBe('Information was outdated');
    });

    it('should fail for non-existent node', async () => {
      await expect(executeDemoteMemory(db, { id: 'non-existent' })).rejects.toThrow('Node not found');
    });

    it('should not delete the memory', async () => {
      const nodeId = createTestNode();

      await executeDemoteMemory(db, { id: nodeId });

      const node = db.getNode(nodeId);
      expect(node).not.toBeNull();
    });

    it('should have minimum retention floor', async () => {
      // Create a node with low retention
      const node = db.insertNode({
        content: 'Low retention memory',
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.15,
        stabilityFactor: 10,
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

      const result = await executeDemoteMemory(db, { id: node.id });

      expect(result.changes.retentionStrength.after).toBeGreaterThanOrEqual(0.1);
    });
  });

  // ============================================================================
  // REQUEST FEEDBACK TESTS
  // ============================================================================

  describe('Request Feedback', () => {
    it('should return feedback options', async () => {
      const nodeId = createTestNode();

      const result = await executeRequestFeedback(db, { id: nodeId });

      expect(result.action).toBe('request_feedback');
      expect(result.nodeId).toBe(nodeId);
      expect(result.prompt).toBe('Was this memory helpful?');
      expect(result.options).toHaveLength(3);
    });

    it('should include context when provided', async () => {
      const nodeId = createTestNode();

      const result = await executeRequestFeedback(db, {
        id: nodeId,
        context: 'error handling advice',
      });

      expect(result.context).toBe('error handling advice');
    });

    it('should fail for non-existent node', async () => {
      await expect(executeRequestFeedback(db, { id: 'non-existent' })).rejects.toThrow('Node not found');
    });

    it('should truncate long content in preview', async () => {
      const node = db.insertNode({
        content: 'A'.repeat(200), // 200 character content
        sourceType: 'note',
        sourcePlatform: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
        accessCount: 0,
        retentionStrength: 0.5,
        stabilityFactor: 10,
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

      const result = await executeRequestFeedback(db, { id: node.id });

      expect(result.memoryPreview.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.memoryPreview.endsWith('...')).toBe(true);
    });

    it('should have promote, demote, and custom options', async () => {
      const nodeId = createTestNode();

      const result = await executeRequestFeedback(db, { id: nodeId });

      const actions = result.options.map(o => o.action);
      expect(actions).toContain('promote');
      expect(actions).toContain('demote');
      expect(actions).toContain('custom');
    });

    it('should include instruction for Claude', async () => {
      const nodeId = createTestNode();

      const result = await executeRequestFeedback(db, { id: nodeId });

      expect(result.instruction).toBeDefined();
      expect(result.instruction.length).toBeGreaterThan(0);
    });
  });
});
