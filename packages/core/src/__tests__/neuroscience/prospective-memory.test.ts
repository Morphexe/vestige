/**
 * Tests for Prospective Memory
 *
 * Tests cover:
 * - Intention creation and management
 * - Trigger evaluation (time, duration, event, context)
 * - NLU parsing
 * - Priority handling and escalation
 * - Status management (fulfill, snooze, cancel)
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  ProspectiveMemoryManager,
  createIntention,
  createFromText,
  getPriorityValue,
  isOverdue,
  shouldEscalate,
  escalatePriority,
  checkTimeTrigger,
  checkDurationTrigger,
  checkEventTrigger,
  checkContextTrigger,
  checkRecurringTrigger,
  matchesPattern,
  matchesContextPattern,
  type Intention,
  type IntentionTrigger,
  type Priority,
  type Context,
  type TriggerPattern,
  type ContextPattern,
} from '../../neuroscience/prospective-memory.js';

describe('Prospective Memory', () => {
  let manager: ProspectiveMemoryManager;

  beforeEach(() => {
    manager = new ProspectiveMemoryManager();
  });

  // ==========================================================================
  // 1. INTENTION CREATION TESTS
  // ==========================================================================

  describe('createIntention', () => {
    it('should create a time-based intention', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const trigger: IntentionTrigger = { type: 'time_based', at: futureDate };

      const intention = createIntention('Review PR #123', trigger);

      expect(intention.id).toBeDefined();
      expect(intention.content).toBe('Review PR #123');
      expect(intention.status).toBe('active');
      expect(intention.trigger.type).toBe('time_based');
    });

    it('should create a duration-based intention', () => {
      const trigger: IntentionTrigger = { type: 'duration_based', inMinutes: 30 };

      const intention = createIntention('Take a break', trigger);

      expect(intention.trigger.type).toBe('duration_based');
      if (intention.trigger.type === 'duration_based') {
        expect(intention.trigger.inMinutes).toBe(30);
      }
    });

    it('should set default priority to normal', () => {
      const trigger: IntentionTrigger = { type: 'duration_based', inMinutes: 60 };
      const intention = createIntention('Task', trigger);

      expect(intention.priority).toBe('normal');
    });

    it('should accept custom priority', () => {
      const trigger: IntentionTrigger = { type: 'duration_based', inMinutes: 60 };
      const intention = createIntention('Urgent task', trigger, { priority: 'critical' });

      expect(intention.priority).toBe('critical');
    });

    it('should accept tags and related memories', () => {
      const trigger: IntentionTrigger = { type: 'duration_based', inMinutes: 30 };
      const intention = createIntention('Task', trigger, {
        tags: ['work', 'urgent'],
        relatedMemories: ['mem-1', 'mem-2'],
      });

      expect(intention.tags).toContain('work');
      expect(intention.relatedMemories).toContain('mem-1');
    });
  });

  // ==========================================================================
  // 2. MANAGER OPERATIONS
  // ==========================================================================

  describe('ProspectiveMemoryManager', () => {
    it('should add intention', () => {
      const trigger: IntentionTrigger = { type: 'duration_based', inMinutes: 30 };
      const intention = manager.addIntention('Task', trigger);

      expect(intention.id).toBeDefined();
      expect(manager.getIntention(intention.id)).toBeDefined();
    });

    it('should get all active intentions', () => {
      manager.addIntention('Task 1', { type: 'duration_based', inMinutes: 30 });
      manager.addIntention('Task 2', { type: 'duration_based', inMinutes: 60 });

      const active = manager.getActiveIntentions();
      expect(active.length).toBe(2);
    });

    it('should filter by priority', () => {
      manager.addIntention('High', { type: 'duration_based', inMinutes: 30 }, { priority: 'high' });
      manager.addIntention('Low', { type: 'duration_based', inMinutes: 60 }, { priority: 'low' });

      const high = manager.getByPriority('high');
      expect(high.length).toBe(1);
      expect(high[0]?.content).toBe('High');
    });

    it('should remove intention', () => {
      const intention = manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });

      const removed = manager.remove(intention.id);
      expect(removed).toBe(true);
      expect(manager.getIntention(intention.id)).toBeNull();
    });
  });

  // ==========================================================================
  // 3. TRIGGER EVALUATION - TIME
  // ==========================================================================

  describe('checkTimeTrigger', () => {
    it('should trigger when time has passed', () => {
      const pastDate = new Date(Date.now() - 1000);
      const trigger = { type: 'time_based' as const, at: pastDate };

      expect(checkTimeTrigger(trigger, new Date())).toBe(true);
    });

    it('should not trigger before time', () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const trigger = { type: 'time_based' as const, at: futureDate };

      expect(checkTimeTrigger(trigger, new Date())).toBe(false);
    });
  });

  // ==========================================================================
  // 4. TRIGGER EVALUATION - DURATION
  // ==========================================================================

  describe('checkDurationTrigger', () => {
    it('should trigger after duration elapsed', () => {
      const createdAt = new Date(Date.now() - 31 * 60 * 1000); // 31 min ago
      const trigger = { type: 'duration_based' as const, inMinutes: 30 };

      expect(checkDurationTrigger(trigger, new Date(), createdAt)).toBe(true);
    });

    it('should not trigger before duration elapsed', () => {
      const createdAt = new Date(); // Just now
      const trigger = { type: 'duration_based' as const, inMinutes: 30 };

      expect(checkDurationTrigger(trigger, new Date(), createdAt)).toBe(false);
    });
  });

  // ==========================================================================
  // 5. TRIGGER EVALUATION - EVENT
  // ==========================================================================

  describe('checkEventTrigger', () => {
    it('should trigger on matching event', () => {
      const trigger = { type: 'event_based' as const, event: 'tests_pass' };

      expect(checkEventTrigger(trigger, ['build_complete', 'tests_pass'])).toBe(true);
    });

    it('should not trigger on non-matching events', () => {
      const trigger = { type: 'event_based' as const, event: 'tests_pass' };

      expect(checkEventTrigger(trigger, ['build_complete', 'deploy'])).toBe(false);
    });

    it('should match partial event names', () => {
      const trigger = { type: 'event_based' as const, event: 'test' };

      expect(checkEventTrigger(trigger, ['tests_pass'])).toBe(true);
    });
  });

  // ==========================================================================
  // 6. TRIGGER EVALUATION - CONTEXT
  // ==========================================================================

  describe('checkContextTrigger', () => {
    it('should trigger on matching codebase', () => {
      const trigger = {
        type: 'context_based' as const,
        pattern: { type: 'in_codebase' as const, value: 'vestige' },
      };

      const context: Context = {
        timestamp: new Date(),
        project: 'vestige',
        files: [],
        topics: [],
        events: [],
        entities: [],
      };

      expect(checkContextTrigger(trigger, context)).toBe(true);
    });

    it('should trigger on file pattern match', () => {
      const trigger = {
        type: 'context_based' as const,
        pattern: { type: 'file_pattern' as const, value: '.test.ts' },
      };

      const context: Context = {
        timestamp: new Date(),
        files: ['src/utils.test.ts'],
        topics: [],
        events: [],
        entities: [],
      };

      expect(checkContextTrigger(trigger, context)).toBe(true);
    });

    it('should trigger on topic match', () => {
      const trigger = {
        type: 'context_based' as const,
        pattern: { type: 'topic_active' as const, value: 'auth' },
      };

      const context: Context = {
        timestamp: new Date(),
        files: [],
        topics: ['authentication', 'oauth'],
        events: [],
        entities: [],
      };

      expect(checkContextTrigger(trigger, context)).toBe(true);
    });
  });

  // ==========================================================================
  // 7. TRIGGER EVALUATION - RECURRING
  // ==========================================================================

  describe('checkRecurringTrigger', () => {
    it('should trigger when interval elapsed', () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const trigger = {
        type: 'recurring' as const,
        pattern: 'every_hour' as const,
        lastTriggered: twoHoursAgo,
      };

      expect(checkRecurringTrigger(trigger, new Date())).toBe(true);
    });

    it('should not trigger before interval', () => {
      const justNow = new Date();
      const trigger = {
        type: 'recurring' as const,
        pattern: 'daily' as const,
        lastTriggered: justNow,
      };

      expect(checkRecurringTrigger(trigger, new Date())).toBe(false);
    });

    it('should handle custom interval', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const trigger = {
        type: 'recurring' as const,
        pattern: { custom: { minutes: 45 } },
        lastTriggered: oneHourAgo,
      };

      expect(checkRecurringTrigger(trigger, new Date())).toBe(true);
    });
  });

  // ==========================================================================
  // 8. PATTERN MATCHING
  // ==========================================================================

  describe('matchesPattern', () => {
    it('should match exact pattern', () => {
      const pattern: TriggerPattern = { type: 'exact', value: 'hello' };
      expect(matchesPattern('hello', pattern)).toBe(true);
      expect(matchesPattern('hello world', pattern)).toBe(false);
    });

    it('should match contains pattern', () => {
      const pattern: TriggerPattern = { type: 'contains', value: 'world' };
      expect(matchesPattern('hello world', pattern)).toBe(true);
      expect(matchesPattern('hello', pattern)).toBe(false);
    });

    it('should match regex pattern', () => {
      const pattern: TriggerPattern = { type: 'regex', value: '^test.*$' };
      expect(matchesPattern('testing', pattern)).toBe(true);
      expect(matchesPattern('my test', pattern)).toBe(false);
    });

    it('should match any_of pattern', () => {
      const pattern: TriggerPattern = { type: 'any_of', value: ['error', 'fail'] };
      expect(matchesPattern('test error found', pattern)).toBe(true);
      expect(matchesPattern('test passed', pattern)).toBe(false);
    });

    it('should match all_of pattern', () => {
      const pattern: TriggerPattern = { type: 'all_of', value: ['test', 'pass'] };
      expect(matchesPattern('test did pass', pattern)).toBe(true);
      expect(matchesPattern('test failed', pattern)).toBe(false);
    });
  });

  // ==========================================================================
  // 9. STATUS MANAGEMENT
  // ==========================================================================

  describe('status management', () => {
    it('should fulfill intention', () => {
      const intention = manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });

      const result = manager.fulfill(intention.id);
      expect(result).toBe(true);

      const updated = manager.getIntention(intention.id);
      expect(updated?.status).toBe('fulfilled');
      expect(updated?.fulfilledAt).toBeDefined();
    });

    it('should cancel intention', () => {
      const intention = manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });

      manager.cancel(intention.id);

      const updated = manager.getIntention(intention.id);
      expect(updated?.status).toBe('cancelled');
    });

    it('should snooze intention', () => {
      const intention = manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });

      manager.snooze(intention.id, 15);

      const updated = manager.getIntention(intention.id);
      expect(updated?.status).toBe('snoozed');
      expect(updated?.snoozedUntil).toBeDefined();
    });

    it('should reactivate snoozed intention', () => {
      const intention = manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });
      manager.snooze(intention.id, 15);

      manager.reactivate(intention.id);

      const updated = manager.getIntention(intention.id);
      expect(updated?.status).toBe('active');
    });

    it('should not trigger snoozed intention', () => {
      const pastDate = new Date(Date.now() - 1000);
      const intention = manager.addIntention('Snoozed', { type: 'time_based', at: pastDate });
      manager.snooze(intention.id, 60);

      const context: Context = {
        timestamp: new Date(),
        files: [],
        topics: [],
        events: [],
        entities: [],
      };

      const triggered = manager.checkTriggers(context);
      expect(triggered.length).toBe(0);
    });
  });

  // ==========================================================================
  // 10. NLU PARSING
  // ==========================================================================

  describe('createFromText (NLU)', () => {
    it('should parse duration from "in X minutes"', () => {
      const intention = createFromText('remind me to call mom in 30 minutes');

      expect(intention).not.toBeNull();
      expect(intention?.trigger.type).toBe('duration_based');
      if (intention?.trigger.type === 'duration_based') {
        expect(intention.trigger.inMinutes).toBe(30);
      }
    });

    it('should parse duration from "in X hours"', () => {
      const intention = createFromText('remind me to take a break in 2 hours');

      expect(intention).not.toBeNull();
      expect(intention?.trigger.type).toBe('duration_based');
      if (intention?.trigger.type === 'duration_based') {
        expect(intention.trigger.inMinutes).toBe(120);
      }
    });

    it('should parse event trigger from "when X"', () => {
      const intention = createFromText('remind me to deploy when tests pass');

      expect(intention).not.toBeNull();
      expect(intention?.trigger.type).toBe('event_based');
    });

    it('should detect high priority from "urgent"', () => {
      const intention = createFromText('urgent: review the PR');

      expect(intention).not.toBeNull();
      expect(intention?.priority).toBe('critical');
    });

    it('should detect critical priority from "critical"', () => {
      const intention = createFromText('critical: fix the production bug');

      expect(intention).not.toBeNull();
      expect(intention?.priority).toBe('critical');
    });

    it('should extract task content', () => {
      const intention = createFromText('remind me to review PR #123 in 30 minutes');

      expect(intention).not.toBeNull();
      expect(intention?.content).toContain('review PR #123');
    });
  });

  // ==========================================================================
  // 11. PRIORITY TESTS
  // ==========================================================================

  describe('priority', () => {
    it('should get priority values', () => {
      expect(getPriorityValue('low')).toBe(1);
      expect(getPriorityValue('normal')).toBe(2);
      expect(getPriorityValue('high')).toBe(3);
      expect(getPriorityValue('critical')).toBe(4);
    });

    it('should escalate priority', () => {
      expect(escalatePriority('low')).toBe('normal');
      expect(escalatePriority('normal')).toBe('high');
      expect(escalatePriority('high')).toBe('critical');
      expect(escalatePriority('critical')).toBe('critical');
    });

    it('should detect need for escalation', () => {
      const intention = createIntention('Task', { type: 'duration_based', inMinutes: 30 }, {
        deadline: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
        priority: 'normal',
      });
      intention.reminderCount = 5;

      expect(shouldEscalate(intention)).toBe(true);
    });

    it('should not escalate critical', () => {
      const intention = createIntention('Task', { type: 'duration_based', inMinutes: 30 }, {
        priority: 'critical',
      });

      expect(shouldEscalate(intention)).toBe(false);
    });
  });

  // ==========================================================================
  // 12. OVERDUE DETECTION
  // ==========================================================================

  describe('overdue detection', () => {
    it('should detect overdue intention', () => {
      const intention = createIntention('Task', { type: 'duration_based', inMinutes: 30 }, {
        deadline: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      });

      expect(isOverdue(intention)).toBe(true);
    });

    it('should not mark future deadline as overdue', () => {
      const intention = createIntention('Task', { type: 'duration_based', inMinutes: 30 }, {
        deadline: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      });

      expect(isOverdue(intention)).toBe(false);
    });

    it('should get overdue intentions', () => {
      manager.addIntention('Overdue', { type: 'duration_based', inMinutes: 30 }, {
        deadline: new Date(Date.now() - 60 * 60 * 1000),
      });
      manager.addIntention('Not overdue', { type: 'duration_based', inMinutes: 30 }, {
        deadline: new Date(Date.now() + 60 * 60 * 1000),
      });

      const overdue = manager.getOverdue();
      expect(overdue.length).toBe(1);
      expect(overdue[0]?.content).toBe('Overdue');
    });
  });

  // ==========================================================================
  // 13. STATISTICS
  // ==========================================================================

  describe('statistics', () => {
    it('should track statistics', () => {
      manager.addIntention('Task 1', { type: 'duration_based', inMinutes: 30 });
      const intention = manager.addIntention('Task 2', { type: 'duration_based', inMinutes: 30 });
      manager.fulfill(intention.id);

      const stats = manager.getStats();
      expect(stats.created).toBe(2);
      expect(stats.fulfilled).toBe(1);
      expect(stats.active).toBe(1);
    });

    it('should calculate fulfillment rate', () => {
      const pastDate = new Date(Date.now() - 1000);
      manager.addIntention('Task', { type: 'time_based', at: pastDate });

      // Trigger it
      manager.checkTriggers({
        timestamp: new Date(),
        files: [],
        topics: [],
        events: [],
        entities: [],
      });

      const intention = manager.getAllIntentions()[0]!;
      manager.fulfill(intention.id);

      const stats = manager.getStats();
      expect(stats.fulfillmentRate).toBe(1.0);
    });
  });

  // ==========================================================================
  // 14. EXPORT/IMPORT
  // ==========================================================================

  describe('export/import', () => {
    it('should export intentions', () => {
      manager.addIntention('Task 1', { type: 'duration_based', inMinutes: 30 });
      manager.addIntention('Task 2', { type: 'duration_based', inMinutes: 60 });

      const exported = manager.export();
      expect(exported.length).toBe(2);
    });

    it('should import intentions', () => {
      const intentions: Intention[] = [
        createIntention('Imported', { type: 'duration_based', inMinutes: 30 }),
      ];

      manager.import(intentions);

      expect(manager.getAllIntentions().length).toBe(1);
    });

    it('should clear all intentions', () => {
      manager.addIntention('Task', { type: 'duration_based', inMinutes: 30 });

      manager.clear();

      expect(manager.getAllIntentions().length).toBe(0);
    });
  });
});
