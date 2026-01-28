/**
 * Memory States Tool
 *
 * Get and manage memory states based on retention strength.
 *
 * States:
 * - Active: retention >= 0.7 (readily accessible)
 * - Dormant: 0.4 <= retention < 0.7 (accessible with cue)
 * - Silent: 0.1 <= retention < 0.4 (difficult to access)
 * - Unavailable: retention < 0.1 (effectively forgotten)
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/memory_states.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

const MemoryStateEnum = z.enum(['active', 'dormant', 'silent', 'unavailable']);

export const GetMemoryStateInputSchema = z.object({
  id: z.string().describe('The ID of the memory to check'),
});

export const ListByStateInputSchema = z.object({
  state: MemoryStateEnum.describe('The state to filter by'),
  limit: z.number().int().min(1).max(100).default(20).describe('Maximum results'),
});

export const StateStatsInputSchema = z.object({});

export type GetMemoryStateInput = z.infer<typeof GetMemoryStateInputSchema>;
export type ListByStateInput = z.infer<typeof ListByStateInputSchema>;
export type StateStatsInput = z.infer<typeof StateStatsInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export type MemoryState = 'active' | 'dormant' | 'silent' | 'unavailable';

export interface MemoryStateInfo {
  id: string;
  state: MemoryState;
  retentionStrength: number;
  accessCount: number;
  lastAccessedAt: string;
  createdAt: string;
  contentPreview: string;
}

export interface GetMemoryStateOutput {
  success: boolean;
  id: string;
  state: MemoryState;
  retentionStrength: number;
  accessibility: number;
  description: string;
}

export interface ListByStateOutput {
  state: MemoryState;
  total: number;
  memories: MemoryStateInfo[];
}

export interface StateStatsOutput {
  total: number;
  active: number;
  dormant: number;
  silent: number;
  unavailable: number;
  distribution: {
    active: number;
    dormant: number;
    silent: number;
    unavailable: number;
  };
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** State thresholds based on retention strength */
export const STATE_THRESHOLDS = {
  active: 0.7,
  dormant: 0.4,
  silent: 0.1,
} as const;

/** Accessibility multipliers for each state */
export const STATE_ACCESSIBILITY = {
  active: 1.0,
  dormant: 0.7,
  silent: 0.3,
  unavailable: 0.05,
} as const;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const getMemoryStateToolDefinition = {
  name: 'get_memory_state',
  description: 'Get the current state (active/dormant/silent/unavailable) of a memory based on its retention strength.',
  inputSchema: GetMemoryStateInputSchema.shape,
};

export const listByStateToolDefinition = {
  name: 'list_by_state',
  description: 'List memories in a specific state (active/dormant/silent/unavailable).',
  inputSchema: ListByStateInputSchema.shape,
};

export const stateStatsToolDefinition = {
  name: 'state_stats',
  description: 'Get statistics about memory states distribution.',
  inputSchema: StateStatsInputSchema.shape,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getStateFromRetention(retention: number): MemoryState {
  if (retention >= STATE_THRESHOLDS.active) return 'active';
  if (retention >= STATE_THRESHOLDS.dormant) return 'dormant';
  if (retention >= STATE_THRESHOLDS.silent) return 'silent';
  return 'unavailable';
}

export function getStateDescription(state: MemoryState): string {
  switch (state) {
    case 'active':
      return 'Readily accessible - recently used or well-established memory';
    case 'dormant':
      return 'Accessible with cue - may need a reminder to recall';
    case 'silent':
      return 'Difficult to access - needs strong cue or review';
    case 'unavailable':
      return 'Effectively forgotten - requires relearning';
  }
}

function getRetentionRangeForState(state: MemoryState): { min: number; max: number } {
  switch (state) {
    case 'active':
      return { min: STATE_THRESHOLDS.active, max: 1.0 };
    case 'dormant':
      return { min: STATE_THRESHOLDS.dormant, max: STATE_THRESHOLDS.active };
    case 'silent':
      return { min: STATE_THRESHOLDS.silent, max: STATE_THRESHOLDS.dormant };
    case 'unavailable':
      return { min: 0, max: STATE_THRESHOLDS.silent };
  }
}

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executeGetMemoryState(
  db: VestigeDatabase,
  args: GetMemoryStateInput
): Promise<GetMemoryStateOutput> {
  const { id } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
      };
    };
  });

  const row = internalDb.db.prepare(`
    SELECT retention_strength
    FROM knowledge_nodes
    WHERE id = ?
  `).get(id) as { retention_strength: number } | undefined;

  if (!row) {
    throw new Error(`Memory not found: ${id}`);
  }

  const state = getStateFromRetention(row.retention_strength);
  const accessibility = STATE_ACCESSIBILITY[state];
  const description = getStateDescription(state);

  return {
    success: true,
    id,
    state,
    retentionStrength: row.retention_strength,
    accessibility,
    description,
  };
}

export async function executeListByState(
  db: VestigeDatabase,
  args: ListByStateInput
): Promise<ListByStateOutput> {
  const { state, limit } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        all: (...args: unknown[]) => unknown[];
      };
    };
  });

  const range = getRetentionRangeForState(state);

  const rows = internalDb.db.prepare(`
    SELECT
      id,
      content,
      retention_strength,
      access_count,
      last_accessed_at,
      created_at
    FROM knowledge_nodes
    WHERE retention_strength >= ? AND retention_strength < ?
    ORDER BY retention_strength DESC, last_accessed_at DESC
    LIMIT ?
  `).all(range.min, range.max, limit) as Array<{
    id: string;
    content: string;
    retention_strength: number;
    access_count: number;
    last_accessed_at: string;
    created_at: string;
  }>;

  const memories: MemoryStateInfo[] = rows.map(row => ({
    id: row.id,
    state,
    retentionStrength: row.retention_strength,
    accessCount: row.access_count,
    lastAccessedAt: row.last_accessed_at,
    createdAt: row.created_at,
    contentPreview: row.content.slice(0, 100),
  }));

  return {
    state,
    total: memories.length,
    memories,
  };
}

export async function executeStateStats(
  db: VestigeDatabase,
  _args: StateStatsInput
): Promise<StateStatsOutput> {
  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
      };
    };
  });

  const row = internalDb.db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN retention_strength >= ? THEN 1 END) as active,
      COUNT(CASE WHEN retention_strength >= ? AND retention_strength < ? THEN 1 END) as dormant,
      COUNT(CASE WHEN retention_strength >= ? AND retention_strength < ? THEN 1 END) as silent,
      COUNT(CASE WHEN retention_strength < ? THEN 1 END) as unavailable
    FROM knowledge_nodes
  `).get(
    STATE_THRESHOLDS.active,
    STATE_THRESHOLDS.dormant, STATE_THRESHOLDS.active,
    STATE_THRESHOLDS.silent, STATE_THRESHOLDS.dormant,
    STATE_THRESHOLDS.silent
  ) as {
    total: number;
    active: number;
    dormant: number;
    silent: number;
    unavailable: number;
  };

  const distribution = {
    active: row.total > 0 ? row.active / row.total : 0,
    dormant: row.total > 0 ? row.dormant / row.total : 0,
    silent: row.total > 0 ? row.silent / row.total : 0,
    unavailable: row.total > 0 ? row.unavailable / row.total : 0,
  };

  return {
    total: row.total,
    active: row.active,
    dormant: row.dormant,
    silent: row.silent,
    unavailable: row.unavailable,
    distribution,
  };
}
