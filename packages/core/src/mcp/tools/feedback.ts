/**
 * Feedback Tools
 *
 * Promote and demote memories based on outcome quality.
 * Implements preference learning for Vestige.
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const PromoteMemoryInputSchema = z.object({
  id: z.string().describe('The ID of the memory to promote'),
  reason: z.string().optional().describe('Why this memory was helpful (optional, for logging)'),
});

export const DemoteMemoryInputSchema = z.object({
  id: z.string().describe('The ID of the memory to demote'),
  reason: z.string().optional().describe('Why this memory was unhelpful or wrong (optional, for logging)'),
});

export const RequestFeedbackInputSchema = z.object({
  id: z.string().describe('The ID of the memory to request feedback on'),
  context: z.string().optional().describe("What the memory was used for (e.g., 'error handling advice')"),
});

export type PromoteMemoryInput = z.infer<typeof PromoteMemoryInputSchema>;
export type DemoteMemoryInput = z.infer<typeof DemoteMemoryInputSchema>;
export type RequestFeedbackInput = z.infer<typeof RequestFeedbackInputSchema>;

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const promoteMemoryToolDefinition = {
  name: 'promote_memory',
  description: 'Promote a memory (thumbs up) - it led to a good outcome. Memory will surface more often in searches.',
  inputSchema: PromoteMemoryInputSchema.shape,
};

export const demoteMemoryToolDefinition = {
  name: 'demote_memory',
  description: 'Demote a memory (thumbs down) - it led to a bad outcome. Better alternatives will surface instead.',
  inputSchema: DemoteMemoryInputSchema.shape,
};

export const requestFeedbackToolDefinition = {
  name: 'request_feedback',
  description: "Request feedback from the user about a memory's usefulness. Returns a structured prompt for Claude to ask the user.",
  inputSchema: RequestFeedbackInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executePromoteMemory(
  db: VestigeDatabase,
  args: PromoteMemoryInput
): Promise<{
  success: boolean;
  action: string;
  nodeId: string;
  reason: string | undefined;
  changes: {
    retentionStrength: { before: number; after: number; delta: string };
    stability: { before: number; after: number; multiplier: string };
  };
  message: string;
}> {
  const node = db.getNode(args.id);
  if (!node) {
    throw new Error(`Node not found: ${args.id}`);
  }

  const before = {
    retentionStrength: node.retentionStrength,
    stability: node.stabilityFactor,
  };

  // Promote: increase retention strength and stability
  const newRetention = Math.min(1.0, before.retentionStrength + 0.2);
  const newStability = Math.min(365, before.stability * 1.5);

  // Update node via direct SQL
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
  internalDb.prepare(`
    UPDATE knowledge_nodes
    SET retention_strength = ?,
        stability_factor = ?,
        updated_at = ?
    WHERE id = ?
  `).run(newRetention, newStability, new Date().toISOString(), args.id);

  return {
    success: true,
    action: 'promoted',
    nodeId: args.id,
    reason: args.reason,
    changes: {
      retentionStrength: {
        before: before.retentionStrength,
        after: newRetention,
        delta: '+0.20',
      },
      stability: {
        before: before.stability,
        after: newStability,
        multiplier: '1.5x',
      },
    },
    message: `Memory promoted. It will now surface more often in searches. Retention: ${before.retentionStrength.toFixed(2)} -> ${newRetention.toFixed(2)}`,
  };
}

export async function executeDemoteMemory(
  db: VestigeDatabase,
  args: DemoteMemoryInput
): Promise<{
  success: boolean;
  action: string;
  nodeId: string;
  reason: string | undefined;
  changes: {
    retentionStrength: { before: number; after: number; delta: string };
    stability: { before: number; after: number; multiplier: string };
  };
  message: string;
  note: string;
}> {
  const node = db.getNode(args.id);
  if (!node) {
    throw new Error(`Node not found: ${args.id}`);
  }

  const before = {
    retentionStrength: node.retentionStrength,
    stability: node.stabilityFactor,
  };

  // Demote: decrease retention strength and stability
  const newRetention = Math.max(0.1, before.retentionStrength - 0.3);
  const newStability = Math.max(1, before.stability * 0.5);

  // Update node via direct SQL
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;
  internalDb.prepare(`
    UPDATE knowledge_nodes
    SET retention_strength = ?,
        stability_factor = ?,
        updated_at = ?
    WHERE id = ?
  `).run(newRetention, newStability, new Date().toISOString(), args.id);

  return {
    success: true,
    action: 'demoted',
    nodeId: args.id,
    reason: args.reason,
    changes: {
      retentionStrength: {
        before: before.retentionStrength,
        after: newRetention,
        delta: '-0.30',
      },
      stability: {
        before: before.stability,
        after: newStability,
        multiplier: '0.5x',
      },
    },
    message: `Memory demoted. Better alternatives will now surface instead. Retention: ${before.retentionStrength.toFixed(2)} -> ${newRetention.toFixed(2)}`,
    note: 'Memory is NOT deleted - it remains searchable but ranks lower.',
  };
}

export async function executeRequestFeedback(
  db: VestigeDatabase,
  args: RequestFeedbackInput
): Promise<{
  action: string;
  nodeId: string;
  memoryPreview: string;
  context: string | undefined;
  prompt: string;
  options: Array<{
    key: string;
    label: string;
    action: string;
    description: string;
  }>;
  instruction: string;
}> {
  const node = db.getNode(args.id);
  if (!node) {
    throw new Error(`Node not found: ${args.id}`);
  }

  // Truncate content for display
  let preview = node.content.slice(0, 100);
  if (node.content.length > 100) {
    preview += '...';
  }

  return {
    action: 'request_feedback',
    nodeId: args.id,
    memoryPreview: preview,
    context: args.context,
    prompt: 'Was this memory helpful?',
    options: [
      {
        key: 'A',
        label: 'Yes, helpful',
        action: 'promote',
        description: 'Memory will surface more often',
      },
      {
        key: 'B',
        label: 'No, wrong/outdated',
        action: 'demote',
        description: 'Better alternatives will surface instead',
      },
      {
        key: 'C',
        label: 'Ask Claude...',
        action: 'custom',
        description: "Give Claude a custom instruction (e.g., 'update this memory', 'merge with X', 'add tag Y')",
      },
    ],
    instruction:
      "PRESENT THESE OPTIONS TO THE USER. If they choose A, call promote_memory. If B, call demote_memory. If C, they will provide a custom instruction - execute it (could be: update the memory content, delete it, merge it, add tags, research something, etc.).",
  };
}
