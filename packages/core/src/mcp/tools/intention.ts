/**
 * Unified Intention Tool
 *
 * A single unified tool that merges all intention operations:
 * - set_intention -> action: "set"
 * - check_intentions -> action: "check"
 * - complete_intention -> action: "update" with status: "complete"
 * - snooze_intention -> action: "update" with status: "snooze"
 * - list_intentions -> action: "list"
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';
import { nanoid } from 'nanoid';

// ============================================================================
// SCHEMAS
// ============================================================================

const TriggerSchema = z.object({
  type: z.enum(['time', 'context', 'event']).optional().describe('Trigger type: time-based, context-based, or event-based'),
  at: z.string().optional().describe('ISO timestamp for time-based triggers'),
  inMinutes: z.number().int().optional().describe('Minutes from now for duration-based triggers'),
  codebase: z.string().optional().describe('Trigger when working in this codebase'),
  filePattern: z.string().optional().describe('Trigger when editing files matching this pattern'),
  topic: z.string().optional().describe('Trigger when discussing this topic'),
  condition: z.string().optional().describe('Natural language condition for event triggers'),
});

const ContextSchema = z.object({
  currentTime: z.string().optional().describe('Current ISO timestamp (defaults to now)'),
  codebase: z.string().optional().describe('Current codebase/project name'),
  file: z.string().optional().describe('Current file path'),
  topics: z.array(z.string()).optional().describe('Current discussion topics'),
});

export const IntentionInputSchema = z.object({
  action: z.enum(['set', 'check', 'update', 'list']).describe(
    "The action to perform: 'set' creates a new intention, 'check' finds triggered intentions, 'update' modifies status (complete/snooze/cancel), 'list' shows intentions"
  ),
  // SET action parameters
  description: z.string().optional().describe('[set] What to remember to do'),
  trigger: TriggerSchema.optional().describe('[set] When to trigger this intention'),
  priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal').describe('[set] Priority level'),
  deadline: z.string().optional().describe('[set] Optional deadline (ISO timestamp)'),
  // UPDATE action parameters
  id: z.string().optional().describe('[update] ID of the intention to update'),
  status: z.enum(['complete', 'snooze', 'cancel']).optional().describe("[update] New status: 'complete' marks as fulfilled, 'snooze' delays, 'cancel' cancels"),
  snoozeMinutes: z.number().int().default(30).describe("[update] Minutes to snooze for (when status is 'snooze')"),
  // CHECK action parameters
  context: ContextSchema.optional().describe('[check] Current context for matching intentions'),
  includeSnoozed: z.boolean().default(false).describe('[check] Include snoozed intentions'),
  // LIST action parameters
  filterStatus: z.enum(['active', 'fulfilled', 'cancelled', 'snoozed', 'all']).default('active').describe('[list] Filter by status'),
  limit: z.number().int().min(1).max(100).default(20).describe('[list] Maximum number to return'),
});

export type IntentionInput = z.infer<typeof IntentionInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface IntentionRecord {
  id: string;
  description: string;
  triggerType: string;
  triggerData: string;
  priority: number;
  status: string;
  createdAt: Date;
  deadline: Date | null;
  fulfilledAt: Date | null;
  snoozedUntil: Date | null;
}

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const intentionToolDefinition = {
  name: 'intention',
  description: 'Unified intention management tool. Supports setting, checking, updating (complete/snooze/cancel), and listing intentions.',
  inputSchema: IntentionInputSchema.shape,
};

// ============================================================================
// STORAGE HELPERS (using knowledge_nodes table with special type)
// ============================================================================

function getIntentions(db: VestigeDatabase, statusFilter?: string): IntentionRecord[] {
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } } }).db;

  let sql = `
    SELECT id, content, source_type, source_platform, source_id,
           created_at, last_accessed_at, retention_strength
    FROM knowledge_nodes
    WHERE source_type = 'intention'
  `;

  if (statusFilter && statusFilter !== 'all') {
    sql += ` AND source_platform = ?`;
  }

  sql += ` ORDER BY retention_strength DESC, created_at DESC`;

  const rows = statusFilter && statusFilter !== 'all'
    ? internalDb.prepare(sql).all(statusFilter) as unknown[]
    : internalDb.prepare(sql).all() as unknown[];

  return (rows as Array<{
    id: string;
    content: string;
    source_type: string;
    source_platform: string;
    source_id: string | null;
    created_at: string;
    last_accessed_at: string;
    retention_strength: number;
  }>).map(row => {
    // Parse stored data from source_id (JSON)
    let parsed: {
      triggerType?: string;
      triggerData?: string;
      priority?: number;
      deadline?: string;
      fulfilledAt?: string;
      snoozedUntil?: string;
    } = {};
    try {
      if (row.source_id) {
        parsed = JSON.parse(row.source_id);
      }
    } catch {
      // Ignore parse errors
    }

    return {
      id: row.id,
      description: row.content,
      triggerType: parsed.triggerType ?? 'manual',
      triggerData: parsed.triggerData ?? '{}',
      priority: parsed.priority ?? 2,
      status: row.source_platform,
      createdAt: new Date(row.created_at),
      deadline: parsed.deadline ? new Date(parsed.deadline) : null,
      fulfilledAt: parsed.fulfilledAt ? new Date(parsed.fulfilledAt) : null,
      snoozedUntil: parsed.snoozedUntil ? new Date(parsed.snoozedUntil) : null,
    };
  });
}

function saveIntention(db: VestigeDatabase, intention: IntentionRecord): void {
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { run: (...args: unknown[]) => void } } }).db;

  const metadata = JSON.stringify({
    triggerType: intention.triggerType,
    triggerData: intention.triggerData,
    priority: intention.priority,
    deadline: intention.deadline?.toISOString(),
    fulfilledAt: intention.fulfilledAt?.toISOString(),
    snoozedUntil: intention.snoozedUntil?.toISOString(),
  });

  internalDb.prepare(`
    INSERT INTO knowledge_nodes (
      id, content, source_type, source_platform, source_id,
      created_at, updated_at, last_accessed_at, access_count,
      retention_strength, stability_factor, review_count, confidence,
      is_contradicted, contradiction_ids, people, concepts, events, tags, source_chain
    ) VALUES (?, ?, 'intention', ?, ?, ?, ?, ?, 0, ?, 1.0, 0, 0.8, 0, '[]', '[]', '[]', '[]', '["intention"]', '[]')
  `).run(
    intention.id,
    intention.description,
    intention.status,
    metadata,
    intention.createdAt.toISOString(),
    intention.createdAt.toISOString(),
    intention.createdAt.toISOString(),
    intention.priority / 4.0  // Use priority as retention strength for ordering
  );
}

function updateIntentionStatus(db: VestigeDatabase, id: string, status: string, extra?: { snoozedUntil?: Date; fulfilledAt?: Date }): boolean {
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { get: (...args: unknown[]) => unknown; run: (...args: unknown[]) => { changes: number } } } }).db;

  // Get current metadata
  const row = internalDb.prepare(`
    SELECT source_id FROM knowledge_nodes WHERE id = ? AND source_type = 'intention'
  `).get(id) as { source_id: string | null } | undefined;

  if (!row) return false;

  let metadata: Record<string, unknown> = {};
  try {
    if (row.source_id) {
      metadata = JSON.parse(row.source_id);
    }
  } catch {
    // Ignore
  }

  if (extra?.snoozedUntil) {
    metadata.snoozedUntil = extra.snoozedUntil.toISOString();
  }
  if (extra?.fulfilledAt) {
    metadata.fulfilledAt = extra.fulfilledAt.toISOString();
  }

  const result = internalDb.prepare(`
    UPDATE knowledge_nodes
    SET source_platform = ?, source_id = ?, updated_at = ?
    WHERE id = ? AND source_type = 'intention'
  `).run(status, JSON.stringify(metadata), new Date().toISOString(), id);

  return result.changes > 0;
}

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executeIntention(
  db: VestigeDatabase,
  args: IntentionInput
): Promise<unknown> {
  switch (args.action) {
    case 'set':
      return executeSet(db, args);
    case 'check':
      return executeCheck(db, args);
    case 'update':
      return executeUpdate(db, args);
    case 'list':
      return executeList(db, args);
    default:
      throw new Error("Unknown action. Valid actions are: set, check, update, list");
  }
}

async function executeSet(
  db: VestigeDatabase,
  args: IntentionInput
): Promise<{
  success: boolean;
  action: string;
  intentionId: string;
  message: string;
  priority: number;
  triggerAt: string | null;
  deadline: string | null;
}> {
  if (!args.description) {
    throw new Error("Missing 'description' for set action");
  }
  if (args.description.trim() === '') {
    throw new Error('Description cannot be empty');
  }

  const now = new Date();
  const id = nanoid();

  // Determine trigger type and data
  let triggerType = 'manual';
  let triggerData = '{}';
  if (args.trigger) {
    triggerType = args.trigger.type ?? 'time';
    triggerData = JSON.stringify(args.trigger);
  }

  // Parse priority
  const priorityMap: Record<string, number> = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
  };
  const priority = priorityMap[args.priority ?? 'normal'] ?? 2;

  // Parse deadline
  const deadline = args.deadline ? new Date(args.deadline) : null;

  // Calculate trigger time if specified
  let triggerAt: Date | null = null;
  if (args.trigger) {
    if (args.trigger.at) {
      triggerAt = new Date(args.trigger.at);
    } else if (args.trigger.inMinutes) {
      triggerAt = new Date(now.getTime() + args.trigger.inMinutes * 60 * 1000);
    }
  }

  const record: IntentionRecord = {
    id,
    description: args.description,
    triggerType,
    triggerData,
    priority,
    status: 'active',
    createdAt: now,
    deadline,
    fulfilledAt: null,
    snoozedUntil: null,
  };

  saveIntention(db, record);

  return {
    success: true,
    action: 'set',
    intentionId: id,
    message: `Intention created: ${args.description}`,
    priority,
    triggerAt: triggerAt?.toISOString() ?? null,
    deadline: deadline?.toISOString() ?? null,
  };
}

async function executeCheck(
  db: VestigeDatabase,
  args: IntentionInput
): Promise<{
  action: string;
  triggered: unknown[];
  pending: unknown[];
  checkedAt: string;
}> {
  const now = new Date();
  const intentions = getIntentions(db, 'active');

  const triggered: unknown[] = [];
  const pending: unknown[] = [];

  for (const intention of intentions) {
    // Parse trigger data
    let trigger: {
      type?: string;
      at?: string;
      inMinutes?: number;
      codebase?: string;
      filePattern?: string;
      topic?: string;
    } = {};
    try {
      trigger = JSON.parse(intention.triggerData);
    } catch {
      // Ignore
    }

    // Check if triggered
    let isTriggered = false;

    if (trigger.type === 'time') {
      if (trigger.at) {
        const triggerTime = new Date(trigger.at);
        isTriggered = triggerTime <= now;
      } else if (trigger.inMinutes) {
        const triggerTime = new Date(intention.createdAt.getTime() + trigger.inMinutes * 60 * 1000);
        isTriggered = triggerTime <= now;
      }
    } else if (trigger.type === 'context' && args.context) {
      // Check codebase match
      if (trigger.codebase && args.context.codebase) {
        isTriggered = args.context.codebase.toLowerCase().includes(trigger.codebase.toLowerCase());
      }
      // Check file pattern match
      if (!isTriggered && trigger.filePattern && args.context.file) {
        isTriggered = args.context.file.includes(trigger.filePattern);
      }
      // Check topic match
      if (!isTriggered && trigger.topic && args.context.topics) {
        isTriggered = args.context.topics.some(t => t.toLowerCase().includes(trigger.topic!.toLowerCase()));
      }
    }

    // Check if overdue
    const isOverdue = intention.deadline ? intention.deadline < now : false;

    const priorityNames: Record<number, string> = {
      1: 'low',
      2: 'normal',
      3: 'high',
      4: 'critical',
    };

    const item = {
      id: intention.id,
      description: intention.description,
      priority: priorityNames[intention.priority] ?? 'normal',
      createdAt: intention.createdAt.toISOString(),
      deadline: intention.deadline?.toISOString() ?? null,
      isOverdue,
    };

    if (isTriggered || isOverdue) {
      triggered.push(item);
    } else {
      pending.push(item);
    }
  }

  return {
    action: 'check',
    triggered,
    pending,
    checkedAt: now.toISOString(),
  };
}

async function executeUpdate(
  db: VestigeDatabase,
  args: IntentionInput
): Promise<{
  success: boolean;
  action: string;
  status: string;
  message: string;
  intentionId: string;
  snoozedUntil?: string;
}> {
  if (!args.id) {
    throw new Error("Missing 'id' for update action");
  }
  if (!args.status) {
    throw new Error("Missing 'status' for update action");
  }

  const now = new Date();

  switch (args.status) {
    case 'complete': {
      const updated = updateIntentionStatus(db, args.id, 'fulfilled', { fulfilledAt: now });
      if (!updated) {
        throw new Error(`Intention not found: ${args.id}`);
      }
      return {
        success: true,
        action: 'update',
        status: 'complete',
        message: 'Intention marked as complete',
        intentionId: args.id,
      };
    }
    case 'snooze': {
      const minutes = args.snoozeMinutes ?? 30;
      const snoozedUntil = new Date(now.getTime() + minutes * 60 * 1000);
      const updated = updateIntentionStatus(db, args.id, 'snoozed', { snoozedUntil });
      if (!updated) {
        throw new Error(`Intention not found: ${args.id}`);
      }
      return {
        success: true,
        action: 'update',
        status: 'snooze',
        message: `Intention snoozed for ${minutes} minutes`,
        intentionId: args.id,
        snoozedUntil: snoozedUntil.toISOString(),
      };
    }
    case 'cancel': {
      const updated = updateIntentionStatus(db, args.id, 'cancelled');
      if (!updated) {
        throw new Error(`Intention not found: ${args.id}`);
      }
      return {
        success: true,
        action: 'update',
        status: 'cancel',
        message: 'Intention cancelled',
        intentionId: args.id,
      };
    }
    default:
      throw new Error("Unknown status. Valid statuses are: complete, snooze, cancel");
  }
}

async function executeList(
  db: VestigeDatabase,
  args: IntentionInput
): Promise<{
  action: string;
  intentions: unknown[];
  total: number;
  status: string;
}> {
  const filterStatus = args.filterStatus ?? 'active';
  const limit = args.limit ?? 20;
  const now = new Date();

  const intentions = getIntentions(db, filterStatus);

  const priorityNames: Record<number, string> = {
    1: 'low',
    2: 'normal',
    3: 'high',
    4: 'critical',
  };

  const items = intentions.slice(0, limit).map(i => {
    const isOverdue = i.deadline ? i.deadline < now : false;
    return {
      id: i.id,
      description: i.description,
      status: i.status,
      priority: priorityNames[i.priority] ?? 'normal',
      createdAt: i.createdAt.toISOString(),
      deadline: i.deadline?.toISOString() ?? null,
      isOverdue,
      snoozedUntil: i.snoozedUntil?.toISOString() ?? null,
    };
  });

  return {
    action: 'list',
    intentions: items,
    total: items.length,
    status: filterStatus,
  };
}
