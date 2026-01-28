/**
 * Tests for MCP Tools
 *
 * Tests cover:
 * - Search tool
 * - Recall tool
 * - Review tool
 * - Stats tool
 * - Consolidate tool
 * - Context tool
 * - Knowledge tool
 * - Memory states tool
 * - Tagging tool
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  // Search
  SearchInputSchema,
  searchToolDefinition,
  // Recall
  RecallInputSchema,
  recallToolDefinition,
  // Review
  ReviewInputSchema,
  reviewToolDefinition,
  // Stats
  StatsInputSchema,
  statsToolDefinition,
  // Consolidate
  ConsolidateInputSchema,
  consolidateToolDefinition,
  // Context
  ContextInputSchema,
  contextToolDefinition,
  // Knowledge
  GetKnowledgeInputSchema,
  DeleteKnowledgeInputSchema,
  getKnowledgeToolDefinition,
  deleteKnowledgeToolDefinition,
  // Memory States
  GetMemoryStateInputSchema,
  ListByStateInputSchema,
  StateStatsInputSchema,
  getMemoryStateToolDefinition,
  listByStateToolDefinition,
  stateStatsToolDefinition,
  STATE_THRESHOLDS,
  STATE_ACCESSIBILITY,
  getStateFromRetention,
  getStateDescription,
  // Tagging
  TriggerImportanceInputSchema,
  FindTaggedInputSchema,
  TagStatsInputSchema,
  triggerImportanceToolDefinition,
  findTaggedToolDefinition,
  tagStatsToolDefinition,
} from '../../mcp/tools/index.js';

describe('MCP Tools', () => {
  // ==========================================================================
  // 1. SEARCH TOOL TESTS
  // ==========================================================================

  describe('Search Tool', () => {
    it('should have correct tool definition', () => {
      expect(searchToolDefinition.name).toBe('search');
      expect(searchToolDefinition.description).toBeDefined();
      expect(searchToolDefinition.inputSchema).toBeDefined();
    });

    it('should validate search input schema', () => {
      const validInput = { query: 'test query' };
      const result = SearchInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate search input with options', () => {
      const validInput = {
        query: 'test query',
        limit: 10,
        minRetention: 0.5,
        minSimilarity: 0.7,
      };
      const result = SearchInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const invalidInput = { query: '' };
      const result = SearchInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should apply default values', () => {
      const input = { query: 'test' };
      const parsed = SearchInputSchema.parse(input);

      expect(parsed.limit).toBeDefined();
      expect(parsed.minSimilarity).toBeDefined();
    });
  });

  // ==========================================================================
  // 2. RECALL TOOL TESTS
  // ==========================================================================

  describe('Recall Tool', () => {
    it('should have correct tool definition', () => {
      expect(recallToolDefinition.name).toBe('recall');
      expect(recallToolDefinition.description).toBeDefined();
    });

    it('should validate recall input schema', () => {
      const validInput = { query: 'remember this' };
      const result = RecallInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate recall with limit', () => {
      const validInput = { query: 'test', limit: 5 };
      const result = RecallInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should reject invalid limit', () => {
      const invalidInput = { query: 'test', limit: 200 };
      const result = RecallInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 3. REVIEW TOOL TESTS
  // ==========================================================================

  describe('Review Tool', () => {
    it('should have correct tool definition', () => {
      expect(reviewToolDefinition.name).toBe('review');
      expect(reviewToolDefinition.description).toBeDefined();
    });

    it('should validate review input with valid rating', () => {
      const validInput = { id: 'node-123', rating: 3 };
      const result = ReviewInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should accept all valid ratings (1-4)', () => {
      for (const rating of [1, 2, 3, 4]) {
        const input = { id: 'node-123', rating };
        const result = ReviewInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid rating', () => {
      const invalidInput = { id: 'node-123', rating: 5 };
      const result = ReviewInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should reject rating 0', () => {
      const invalidInput = { id: 'node-123', rating: 0 };
      const result = ReviewInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 4. STATS TOOL TESTS
  // ==========================================================================

  describe('Stats Tool', () => {
    it('should have correct tool definition', () => {
      expect(statsToolDefinition.name).toBe('stats');
      expect(statsToolDefinition.description).toBeDefined();
    });

    it('should validate empty stats input', () => {
      const validInput = {};
      const result = StatsInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // 5. CONSOLIDATE TOOL TESTS
  // ==========================================================================

  describe('Consolidate Tool', () => {
    it('should have correct tool definition', () => {
      expect(consolidateToolDefinition.name).toBe('consolidate');
      expect(consolidateToolDefinition.description).toBeDefined();
    });

    it('should validate consolidate input', () => {
      const validInput = {};
      const result = ConsolidateInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate with dryRun option', () => {
      const validInput = { dryRun: true };
      const result = ConsolidateInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // 6. CONTEXT TOOL TESTS
  // ==========================================================================

  describe('Context Tool', () => {
    it('should have correct tool definition', () => {
      expect(contextToolDefinition.name).toBe('context');
      expect(contextToolDefinition.description).toBeDefined();
    });

    it('should validate context input with query', () => {
      const validInput = { query: 'authentication flow' };
      const result = ContextInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate context with all options', () => {
      const validInput = {
        query: 'test',
        topics: ['typescript', 'testing'],
        project: 'vestige',
        mood: 'positive',
        timeWeight: 0.5,
        topicWeight: 0.3,
        limit: 20,
      };
      const result = ContextInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate mood enum', () => {
      for (const mood of ['positive', 'negative', 'neutral']) {
        const input = { query: 'test', mood };
        const result = ContextInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid mood', () => {
      const invalidInput = { query: 'test', mood: 'happy' };
      const result = ContextInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // 7. KNOWLEDGE TOOL TESTS
  // ==========================================================================

  describe('Knowledge Tool', () => {
    it('should have correct get tool definition', () => {
      expect(getKnowledgeToolDefinition.name).toBe('get_knowledge');
      expect(getKnowledgeToolDefinition.description).toBeDefined();
    });

    it('should have correct delete tool definition', () => {
      expect(deleteKnowledgeToolDefinition.name).toBe('delete_knowledge');
      expect(deleteKnowledgeToolDefinition.description).toBeDefined();
    });

    it('should validate get knowledge input', () => {
      const validInput = { id: 'node-123' };
      const result = GetKnowledgeInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate delete knowledge input', () => {
      const validInput = { id: 'node-123', confirm: true };
      const result = DeleteKnowledgeInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should default confirm to false', () => {
      const input = { id: 'node-123' };
      const parsed = DeleteKnowledgeInputSchema.parse(input);

      expect(parsed.confirm).toBe(false);
    });
  });

  // ==========================================================================
  // 8. MEMORY STATES TOOL TESTS
  // ==========================================================================

  describe('Memory States Tool', () => {
    it('should have correct tool definitions', () => {
      expect(getMemoryStateToolDefinition.name).toBe('get_memory_state');
      expect(listByStateToolDefinition.name).toBe('list_by_state');
      expect(stateStatsToolDefinition.name).toBe('state_stats');
    });

    it('should validate get memory state input', () => {
      const validInput = { id: 'node-123' };
      const result = GetMemoryStateInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate list by state input', () => {
      const validInput = { state: 'active' };
      const result = ListByStateInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate all state values', () => {
      for (const state of ['active', 'dormant', 'silent', 'unavailable']) {
        const input = { state };
        const result = ListByStateInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid state', () => {
      const invalidInput = { state: 'forgotten' };
      const result = ListByStateInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should have correct state thresholds', () => {
      expect(STATE_THRESHOLDS.active).toBe(0.7);
      expect(STATE_THRESHOLDS.dormant).toBe(0.4);
      expect(STATE_THRESHOLDS.silent).toBe(0.1);
    });

    it('should have correct accessibility values', () => {
      expect(STATE_ACCESSIBILITY.active).toBe(1.0);
      expect(STATE_ACCESSIBILITY.dormant).toBe(0.7);
      expect(STATE_ACCESSIBILITY.silent).toBe(0.3);
      expect(STATE_ACCESSIBILITY.unavailable).toBe(0.05);
    });

    it('should correctly determine state from retention', () => {
      expect(getStateFromRetention(0.9)).toBe('active');
      expect(getStateFromRetention(0.7)).toBe('active');
      expect(getStateFromRetention(0.5)).toBe('dormant');
      expect(getStateFromRetention(0.4)).toBe('dormant');
      expect(getStateFromRetention(0.2)).toBe('silent');
      expect(getStateFromRetention(0.1)).toBe('silent');
      expect(getStateFromRetention(0.05)).toBe('unavailable');
      expect(getStateFromRetention(0)).toBe('unavailable');
    });

    it('should provide state descriptions', () => {
      expect(getStateDescription('active')).toContain('accessible');
      expect(getStateDescription('dormant')).toContain('cue');
      expect(getStateDescription('silent')).toContain('Difficult');
      expect(getStateDescription('unavailable')).toContain('forgotten');
    });
  });

  // ==========================================================================
  // 9. TAGGING TOOL TESTS
  // ==========================================================================

  describe('Tagging Tool', () => {
    it('should have correct tool definitions', () => {
      expect(triggerImportanceToolDefinition.name).toBe('trigger_importance');
      expect(findTaggedToolDefinition.name).toBe('find_tagged');
      expect(tagStatsToolDefinition.name).toBe('tag_stats');
    });

    it('should validate trigger importance input', () => {
      const validInput = { eventType: 'breakthrough' };
      const result = TriggerImportanceInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate all event types', () => {
      const eventTypes = [
        'breakthrough',
        'deadline_met',
        'user_feedback',
        'repeated_access',
        'explicit_mark',
        'emotional',
        'novel_connection',
      ];

      for (const eventType of eventTypes) {
        const input = { eventType };
        const result = TriggerImportanceInputSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid event type', () => {
      const invalidInput = { eventType: 'random_event' };
      const result = TriggerImportanceInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should validate trigger with specific memory', () => {
      const validInput = {
        eventType: 'explicit_mark',
        memoryId: 'node-123',
      };
      const result = TriggerImportanceInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should validate trigger with capture window', () => {
      const validInput = {
        eventType: 'breakthrough',
        hoursBack: 12,
        hoursForward: 4,
      };
      const result = TriggerImportanceInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should apply default capture window', () => {
      const input = { eventType: 'breakthrough' };
      const parsed = TriggerImportanceInputSchema.parse(input);

      expect(parsed.hoursBack).toBe(9);
      expect(parsed.hoursForward).toBe(2);
    });

    it('should reject out of range hoursBack', () => {
      const invalidInput = { eventType: 'breakthrough', hoursBack: 100 };
      const result = TriggerImportanceInputSchema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('should validate find tagged input', () => {
      const validInput = { minStrength: 0.6, limit: 10 };
      const result = FindTaggedInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('should apply default find tagged values', () => {
      const input = {};
      const parsed = FindTaggedInputSchema.parse(input);

      expect(parsed.minStrength).toBe(0.5);
      expect(parsed.limit).toBe(20);
    });

    it('should validate tag stats input', () => {
      const validInput = {};
      const result = TagStatsInputSchema.safeParse(validInput);

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // 10. TOOL DEFINITION COMPLETENESS
  // ==========================================================================

  describe('Tool Definition Completeness', () => {
    const toolDefinitions = [
      searchToolDefinition,
      recallToolDefinition,
      reviewToolDefinition,
      statsToolDefinition,
      consolidateToolDefinition,
      contextToolDefinition,
      getKnowledgeToolDefinition,
      deleteKnowledgeToolDefinition,
      getMemoryStateToolDefinition,
      listByStateToolDefinition,
      stateStatsToolDefinition,
      triggerImportanceToolDefinition,
      findTaggedToolDefinition,
      tagStatsToolDefinition,
    ];

    it('should have all required tool definition fields', () => {
      for (const def of toolDefinitions) {
        expect(def.name).toBeDefined();
        expect(typeof def.name).toBe('string');
        expect(def.name.length).toBeGreaterThan(0);

        expect(def.description).toBeDefined();
        expect(typeof def.description).toBe('string');
        expect(def.description.length).toBeGreaterThan(0);

        expect(def.inputSchema).toBeDefined();
      }
    });

    it('should have unique tool names', () => {
      const names = toolDefinitions.map(d => d.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });
  });
});
