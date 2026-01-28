/**
 * Tests for the unified Intention Tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { VestigeDatabase } from '../../core/database.js';
import {
  IntentionInputSchema,
  executeIntention,
  type IntentionInput,
} from './intention.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Intention Tool', () => {
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
    it('should validate action is required', () => {
      const result = IntentionInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should accept valid set action', () => {
      const result = IntentionInputSchema.safeParse({
        action: 'set',
        description: 'Remember to test',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid check action', () => {
      const result = IntentionInputSchema.safeParse({
        action: 'check',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid update action', () => {
      const result = IntentionInputSchema.safeParse({
        action: 'update',
        id: 'test-id',
        status: 'complete',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid list action', () => {
      const result = IntentionInputSchema.safeParse({
        action: 'list',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid action', () => {
      const result = IntentionInputSchema.safeParse({
        action: 'invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // SET ACTION TESTS
  // ============================================================================

  describe('Set Action', () => {
    it('should create an intention successfully', async () => {
      const input: IntentionInput = {
        action: 'set',
        description: 'Remember to write unit tests',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      const result = await executeIntention(db, input) as {
        success: boolean;
        action: string;
        intentionId: string;
        message: string;
        priority: number;
      };

      expect(result.success).toBe(true);
      expect(result.action).toBe('set');
      expect(result.intentionId).toBeDefined();
      expect(result.message).toContain('Intention created');
    });

    it('should fail without description', async () => {
      const input: IntentionInput = {
        action: 'set',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      await expect(executeIntention(db, input)).rejects.toThrow("Missing 'description'");
    });

    it('should fail with empty description', async () => {
      const input: IntentionInput = {
        action: 'set',
        description: '   ',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      await expect(executeIntention(db, input)).rejects.toThrow('Description cannot be empty');
    });

    it('should set priority correctly', async () => {
      const input: IntentionInput = {
        action: 'set',
        description: 'Critical task',
        priority: 'critical',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      const result = await executeIntention(db, input) as { priority: number };
      expect(result.priority).toBe(4); // critical = 4
    });

    it('should create with time trigger', async () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
      const input: IntentionInput = {
        action: 'set',
        description: 'Meeting reminder',
        trigger: {
          type: 'time',
          at: futureTime,
        },
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      const result = await executeIntention(db, input) as { triggerAt: string | null };
      expect(result.triggerAt).toBeDefined();
    });

    it('should create with deadline', async () => {
      const deadline = new Date(Date.now() + 86400000 * 7).toISOString(); // 7 days
      const input: IntentionInput = {
        action: 'set',
        description: 'Complete feature by end of week',
        deadline,
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      const result = await executeIntention(db, input) as { deadline: string | null };
      expect(result.deadline).toBeDefined();
    });
  });

  // ============================================================================
  // CHECK ACTION TESTS
  // ============================================================================

  describe('Check Action', () => {
    it('should return empty results for new database', async () => {
      const input: IntentionInput = {
        action: 'check',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      const result = await executeIntention(db, input) as {
        triggered: unknown[];
        pending: unknown[];
        checkedAt: string;
      };

      expect(result.triggered).toEqual([]);
      expect(result.pending).toEqual([]);
      expect(result.checkedAt).toBeDefined();
    });

    it('should find triggered time-based intention', async () => {
      // Create intention with past trigger time
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
      await executeIntention(db, {
        action: 'set',
        description: 'Past due task',
        trigger: {
          type: 'time',
          at: pastTime,
        },
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });

      const result = await executeIntention(db, {
        action: 'check',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { triggered: unknown[] };

      expect(result.triggered.length).toBeGreaterThan(0);
    });

    it('should check context-based triggers', async () => {
      // Create context-triggered intention
      await executeIntention(db, {
        action: 'set',
        description: 'Check tests in payments',
        trigger: {
          type: 'context',
          codebase: 'payments',
        },
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });

      // Check with matching context
      const result = await executeIntention(db, {
        action: 'check',
        context: {
          codebase: 'payments-service',
        },
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { triggered: unknown[] };

      expect(result.triggered.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // UPDATE ACTION TESTS
  // ============================================================================

  describe('Update Action', () => {
    it('should complete an intention', async () => {
      // Create an intention
      const createResult = await executeIntention(db, {
        action: 'set',
        description: 'Task to complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { intentionId: string };

      // Complete it
      const result = await executeIntention(db, {
        action: 'update',
        id: createResult.intentionId,
        status: 'complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { success: boolean; status: string; message: string };

      expect(result.success).toBe(true);
      expect(result.status).toBe('complete');
      expect(result.message).toContain('complete');
    });

    it('should snooze an intention', async () => {
      const createResult = await executeIntention(db, {
        action: 'set',
        description: 'Task to snooze',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { intentionId: string };

      const result = await executeIntention(db, {
        action: 'update',
        id: createResult.intentionId,
        status: 'snooze',
        snoozeMinutes: 30,
        priority: 'normal',
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { success: boolean; status: string; snoozedUntil: string };

      expect(result.success).toBe(true);
      expect(result.status).toBe('snooze');
      expect(result.snoozedUntil).toBeDefined();
    });

    it('should cancel an intention', async () => {
      const createResult = await executeIntention(db, {
        action: 'set',
        description: 'Task to cancel',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { intentionId: string };

      const result = await executeIntention(db, {
        action: 'update',
        id: createResult.intentionId,
        status: 'cancel',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { success: boolean; status: string };

      expect(result.success).toBe(true);
      expect(result.status).toBe('cancel');
    });

    it('should fail for non-existent intention', async () => {
      const input: IntentionInput = {
        action: 'update',
        id: 'non-existent-id',
        status: 'complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      await expect(executeIntention(db, input)).rejects.toThrow('not found');
    });

    it('should fail without id', async () => {
      const input: IntentionInput = {
        action: 'update',
        status: 'complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      await expect(executeIntention(db, input)).rejects.toThrow("Missing 'id'");
    });

    it('should fail without status', async () => {
      const createResult = await executeIntention(db, {
        action: 'set',
        description: 'Task',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { intentionId: string };

      const input: IntentionInput = {
        action: 'update',
        id: createResult.intentionId,
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      };

      await expect(executeIntention(db, input)).rejects.toThrow("Missing 'status'");
    });
  });

  // ============================================================================
  // LIST ACTION TESTS
  // ============================================================================

  describe('List Action', () => {
    it('should return empty list for new database', async () => {
      const result = await executeIntention(db, {
        action: 'list',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { total: number; intentions: unknown[] };

      expect(result.total).toBe(0);
      expect(result.intentions).toEqual([]);
    });

    it('should list created intentions', async () => {
      await executeIntention(db, {
        action: 'set',
        description: 'First task',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });
      await executeIntention(db, {
        action: 'set',
        description: 'Second task',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });

      const result = await executeIntention(db, {
        action: 'list',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { total: number };

      expect(result.total).toBe(2);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await executeIntention(db, {
          action: 'set',
          description: `Task ${i}`,
          priority: 'normal',
          snoozeMinutes: 30,
          filterStatus: 'active',
          limit: 20,
          includeSnoozed: false,
        });
      }

      const result = await executeIntention(db, {
        action: 'list',
        limit: 3,
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        includeSnoozed: false,
      }) as { intentions: unknown[] };

      expect(result.intentions.length).toBeLessThanOrEqual(3);
    });

    it('should filter by status', async () => {
      const createResult = await executeIntention(db, {
        action: 'set',
        description: 'Task to complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      }) as { intentionId: string };

      // Complete it
      await executeIntention(db, {
        action: 'update',
        id: createResult.intentionId,
        status: 'complete',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });

      // Create another active one
      await executeIntention(db, {
        action: 'set',
        description: 'Active task',
        priority: 'normal',
        snoozeMinutes: 30,
        filterStatus: 'active',
        limit: 20,
        includeSnoozed: false,
      });

      // List fulfilled
      const result = await executeIntention(db, {
        action: 'list',
        filterStatus: 'fulfilled',
        priority: 'normal',
        snoozeMinutes: 30,
        limit: 20,
        includeSnoozed: false,
      }) as { total: number; status: string };

      expect(result.total).toBe(1);
      expect(result.status).toBe('fulfilled');
    });
  });
});
