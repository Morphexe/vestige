/**
 * Prospective Memory Module
 *
 * Implements "remembering to remember" - the ability to remember to
 * perform intended actions in the future.
 *
 * Types of prospective memory:
 * - Time-based: "At 3pm, remind me to..."
 * - Event-based: "When I open file X, remind me to..."
 * - Activity-based: "When I finish task Y, remind me to..."
 *
 * Based on:
 * - McDaniel & Einstein (2007) - Prospective Memory Theory
 * - Multiprocess framework for prospective memory
 */

import { nanoid } from 'nanoid';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Priority levels for intentions
 */
export type Priority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Status of an intention
 */
export type IntentionStatus =
  | 'active'     // Waiting for trigger
  | 'triggered'  // Trigger condition met
  | 'fulfilled'  // Successfully completed
  | 'cancelled'  // User cancelled
  | 'expired'    // Deadline passed without fulfillment
  | 'snoozed';   // Temporarily deferred

/**
 * Pattern for exact or fuzzy text matching
 */
export interface TriggerPattern {
  type: 'exact' | 'contains' | 'regex' | 'any_of' | 'all_of';
  value: string | string[];
}

/**
 * Pattern for context-based triggers
 */
export interface ContextPattern {
  type: 'in_codebase' | 'file_pattern' | 'topic_active' | 'user_mode' | 'composite';
  value: string | ContextPattern[];
}

/**
 * Recurrence patterns for recurring intentions
 */
export type RecurrencePattern =
  | 'every_hour'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | { custom: { minutes: number } };

/**
 * Trigger types for intentions
 */
export type IntentionTrigger =
  | { type: 'time_based'; at: Date }
  | { type: 'duration_based'; inMinutes: number; from?: Date }
  | { type: 'event_based'; event: string; pattern?: TriggerPattern }
  | { type: 'context_based'; pattern: ContextPattern }
  | { type: 'recurring'; pattern: RecurrencePattern; lastTriggered?: Date };

/**
 * An intention to perform a future action
 */
export interface Intention {
  /** Unique ID */
  id: string;
  /** What to remember to do */
  content: string;
  /** When/how to trigger */
  trigger: IntentionTrigger;
  /** Priority level */
  priority: Priority;
  /** Current status */
  status: IntentionStatus;
  /** Optional deadline */
  deadline?: Date;
  /** When fulfilled (if fulfilled) */
  fulfilledAt?: Date;
  /** Number of times reminded */
  reminderCount: number;
  /** Associated tags */
  tags: string[];
  /** Related memory IDs */
  relatedMemories: string[];
  /** How the intention was created */
  source: 'api' | 'natural_language' | 'inferred';
  /** When created */
  createdAt: Date;
  /** When snoozed until (if snoozed) */
  snoozedUntil?: Date;
}

/**
 * Current context for trigger evaluation
 */
export interface Context {
  /** Current timestamp */
  timestamp: Date;
  /** Current project/codebase */
  project?: string;
  /** Active files */
  files: string[];
  /** Active topics */
  topics: string[];
  /** Current user mode (e.g., 'coding', 'reviewing', 'planning') */
  mode?: string;
  /** Recent events */
  events: string[];
  /** Active entities (functions, classes being worked on) */
  entities: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Priority escalation threshold (hours before deadline) */
export const ESCALATION_THRESHOLD_HOURS = 2;

/** Default snooze duration in minutes */
export const DEFAULT_SNOOZE_MINUTES = 30;

/** Maximum reminder count before auto-escalation */
export const MAX_REMINDERS_BEFORE_ESCALATION = 3;

/** NLU trigger keywords */
export const NLU_TIME_KEYWORDS = [
  'at', 'on', 'by', 'before', 'after', 'tomorrow', 'next',
  'morning', 'afternoon', 'evening', 'night', 'noon', 'midnight'
];

export const NLU_DURATION_KEYWORDS = [
  'in', 'after', 'wait', 'later'
];

export const NLU_EVENT_KEYWORDS = [
  'when', 'if', 'once', 'after', 'before'
];

export const NLU_PRIORITY_KEYWORDS: Record<string, Priority> = {
  'urgent': 'critical',
  'important': 'high',
  'critical': 'critical',
  'asap': 'critical',
  'high priority': 'high',
  'low priority': 'low',
  'whenever': 'low',
  'eventually': 'low',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a new intention
 */
export function createIntention(
  content: string,
  trigger: IntentionTrigger,
  options?: {
    priority?: Priority;
    deadline?: Date;
    tags?: string[];
    relatedMemories?: string[];
    source?: 'api' | 'natural_language' | 'inferred';
  }
): Intention {
  return {
    id: nanoid(),
    content,
    trigger,
    priority: options?.priority ?? 'normal',
    status: 'active',
    deadline: options?.deadline,
    fulfilledAt: undefined,
    reminderCount: 0,
    tags: options?.tags ?? [],
    relatedMemories: options?.relatedMemories ?? [],
    source: options?.source ?? 'api',
    createdAt: new Date(),
    snoozedUntil: undefined,
  };
}

/**
 * Get priority numeric value for sorting
 */
export function getPriorityValue(priority: Priority): number {
  const values: Record<Priority, number> = {
    low: 1,
    normal: 2,
    high: 3,
    critical: 4,
  };
  return values[priority];
}

/**
 * Check if intention is overdue
 */
export function isOverdue(intention: Intention): boolean {
  if (!intention.deadline) return false;
  return intention.deadline.getTime() < Date.now();
}

/**
 * Check if intention should be escalated
 */
export function shouldEscalate(intention: Intention): boolean {
  if (intention.priority === 'critical') return false; // Already max

  // Check deadline proximity
  if (intention.deadline) {
    const hoursUntilDeadline = (intention.deadline.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilDeadline <= ESCALATION_THRESHOLD_HOURS && hoursUntilDeadline > 0) {
      return true;
    }
  }

  // Check reminder count
  if (intention.reminderCount >= MAX_REMINDERS_BEFORE_ESCALATION) {
    return true;
  }

  return false;
}

/**
 * Escalate priority by one level
 */
export function escalatePriority(priority: Priority): Priority {
  const escalation: Record<Priority, Priority> = {
    low: 'normal',
    normal: 'high',
    high: 'critical',
    critical: 'critical',
  };
  return escalation[priority];
}

// ============================================================================
// TRIGGER EVALUATION
// ============================================================================

/**
 * Check if a time-based trigger is met
 */
export function checkTimeTrigger(trigger: { type: 'time_based'; at: Date }, now: Date): boolean {
  return trigger.at.getTime() <= now.getTime();
}

/**
 * Check if a duration-based trigger is met
 */
export function checkDurationTrigger(
  trigger: { type: 'duration_based'; inMinutes: number; from?: Date },
  now: Date,
  createdAt: Date
): boolean {
  const from = trigger.from ?? createdAt;
  const triggerTime = from.getTime() + trigger.inMinutes * 60 * 1000;
  return triggerTime <= now.getTime();
}

/**
 * Check if an event-based trigger is met
 */
export function checkEventTrigger(
  trigger: { type: 'event_based'; event: string; pattern?: TriggerPattern },
  events: string[]
): boolean {
  // Check if trigger event is in the events list
  for (const event of events) {
    if (trigger.pattern) {
      if (matchesPattern(event, trigger.pattern)) {
        return true;
      }
    } else {
      if (event.toLowerCase().includes(trigger.event.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a context-based trigger is met
 */
export function checkContextTrigger(
  trigger: { type: 'context_based'; pattern: ContextPattern },
  context: Context
): boolean {
  return matchesContextPattern(trigger.pattern, context);
}

/**
 * Check if a recurring trigger should fire
 */
export function checkRecurringTrigger(
  trigger: { type: 'recurring'; pattern: RecurrencePattern; lastTriggered?: Date },
  now: Date
): boolean {
  const lastTriggered = trigger.lastTriggered ?? new Date(0);
  const msSinceLast = now.getTime() - lastTriggered.getTime();

  let intervalMs: number;

  if (trigger.pattern === 'every_hour') {
    intervalMs = 60 * 60 * 1000;
  } else if (trigger.pattern === 'daily') {
    intervalMs = 24 * 60 * 60 * 1000;
  } else if (trigger.pattern === 'weekly') {
    intervalMs = 7 * 24 * 60 * 60 * 1000;
  } else if (trigger.pattern === 'monthly') {
    intervalMs = 30 * 24 * 60 * 60 * 1000; // Approximate
  } else {
    intervalMs = trigger.pattern.custom.minutes * 60 * 1000;
  }

  return msSinceLast >= intervalMs;
}

/**
 * Check if text matches a trigger pattern
 */
export function matchesPattern(text: string, pattern: TriggerPattern): boolean {
  const textLower = text.toLowerCase();

  switch (pattern.type) {
    case 'exact':
      return textLower === (pattern.value as string).toLowerCase();

    case 'contains':
      return textLower.includes((pattern.value as string).toLowerCase());

    case 'regex':
      try {
        const regex = new RegExp(pattern.value as string, 'i');
        return regex.test(text);
      } catch {
        return false;
      }

    case 'any_of':
      return (pattern.value as string[]).some(v =>
        textLower.includes(v.toLowerCase())
      );

    case 'all_of':
      return (pattern.value as string[]).every(v =>
        textLower.includes(v.toLowerCase())
      );

    default:
      return false;
  }
}

/**
 * Check if context matches a context pattern
 */
export function matchesContextPattern(pattern: ContextPattern, context: Context): boolean {
  switch (pattern.type) {
    case 'in_codebase':
      return context.project?.toLowerCase() === (pattern.value as string).toLowerCase();

    case 'file_pattern':
      return context.files.some(f =>
        f.includes(pattern.value as string) ||
        (pattern.value as string).includes('*') &&
          matchesGlob(f, pattern.value as string)
      );

    case 'topic_active':
      return context.topics.some(t =>
        t.toLowerCase().includes((pattern.value as string).toLowerCase())
      );

    case 'user_mode':
      return context.mode?.toLowerCase() === (pattern.value as string).toLowerCase();

    case 'composite':
      // All sub-patterns must match
      return (pattern.value as ContextPattern[]).every(subPattern =>
        matchesContextPattern(subPattern, context)
      );

    default:
      return false;
  }
}

/**
 * Simple glob matching (only * wildcard)
 */
function matchesGlob(text: string, pattern: string): boolean {
  const regex = new RegExp(
    '^' + pattern.split('*').map(s =>
      s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    ).join('.*') + '$'
  );
  return regex.test(text);
}

// ============================================================================
// NLU PARSING
// ============================================================================

/**
 * Parse natural language to create an intention
 */
export function createFromText(text: string): Intention | null {
  // Extract priority from text
  let priority: Priority = 'normal';
  let cleanText = text;

  for (const [keyword, p] of Object.entries(NLU_PRIORITY_KEYWORDS)) {
    if (text.toLowerCase().includes(keyword)) {
      priority = p;
      cleanText = cleanText.replace(new RegExp(keyword, 'gi'), '').trim();
      break;
    }
  }

  // Try to parse trigger type
  const trigger = parseTrigger(cleanText);
  if (!trigger) return null;

  // Extract the action part
  const content = extractContent(cleanText);
  if (!content) return null;

  return createIntention(content, trigger, {
    priority,
    source: 'natural_language',
  });
}

/**
 * Parse trigger from natural language
 */
function parseTrigger(text: string): IntentionTrigger | null {
  const textLower = text.toLowerCase();

  // Check for duration pattern: "in X minutes/hours"
  const durationMatch = textLower.match(/in\s+(\d+)\s+(minute|hour|min|hr)s?/i);
  if (durationMatch) {
    let minutes = parseInt(durationMatch[1]!, 10);
    if (durationMatch[2]!.startsWith('hour') || durationMatch[2]!.startsWith('hr')) {
      minutes *= 60;
    }
    return { type: 'duration_based', inMinutes: minutes };
  }

  // Check for event pattern: "when X"
  const eventMatch = textLower.match(/when\s+(.+?)(?:\s+remind|\s+remember|$)/i);
  if (eventMatch) {
    return { type: 'event_based', event: eventMatch[1]! };
  }

  // Check for time pattern: "at X:XX" or "at X pm/am"
  const timeMatch = textLower.match(/at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1]!, 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const period = timeMatch[3]?.toLowerCase();

    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const triggerDate = new Date();
    triggerDate.setHours(hours, minutes, 0, 0);

    // If time has passed, set for tomorrow
    if (triggerDate.getTime() < Date.now()) {
      triggerDate.setDate(triggerDate.getDate() + 1);
    }

    return { type: 'time_based', at: triggerDate };
  }

  // Default to 30 minute duration
  return { type: 'duration_based', inMinutes: 30 };
}

/**
 * Extract the action content from text
 */
function extractContent(text: string): string {
  // Remove trigger phrases
  let content = text
    .replace(/remind\s+me\s+to\s*/gi, '')
    .replace(/remember\s+to\s*/gi, '')
    .replace(/don't\s+forget\s+to\s*/gi, '')
    .replace(/in\s+\d+\s+(minute|hour|min|hr)s?\s*/gi, '')
    .replace(/when\s+.+?\s*,?\s*/gi, '')
    .replace(/at\s+\d{1,2}(:\d{2})?\s*(am|pm)?\s*/gi, '')
    .trim();

  // Remove leading/trailing punctuation
  content = content.replace(/^[,.\s]+|[,.\s]+$/g, '');

  return content || null;
}

// ============================================================================
// PROSPECTIVE MEMORY MANAGER
// ============================================================================

/**
 * Prospective Memory Manager
 *
 * Manages intentions and triggers for prospective memory.
 */
export class ProspectiveMemoryManager {
  private intentions: Map<string, Intention> = new Map();
  private stats = {
    created: 0,
    triggered: 0,
    fulfilled: 0,
    cancelled: 0,
    expired: 0,
  };

  /**
   * Create and add an intention
   */
  addIntention(
    content: string,
    trigger: IntentionTrigger,
    options?: {
      priority?: Priority;
      deadline?: Date;
      tags?: string[];
      relatedMemories?: string[];
      source?: 'api' | 'natural_language' | 'inferred';
    }
  ): Intention {
    const intention = createIntention(content, trigger, options);
    this.intentions.set(intention.id, intention);
    this.stats.created++;
    return intention;
  }

  /**
   * Create intention from natural language
   */
  addFromText(text: string): Intention | null {
    const intention = createFromText(text);
    if (!intention) return null;

    this.intentions.set(intention.id, intention);
    this.stats.created++;
    return intention;
  }

  /**
   * Get an intention by ID
   */
  getIntention(id: string): Intention | null {
    return this.intentions.get(id) ?? null;
  }

  /**
   * Get all active intentions
   */
  getActiveIntentions(): Intention[] {
    return Array.from(this.intentions.values())
      .filter(i => i.status === 'active')
      .sort((a, b) => getPriorityValue(b.priority) - getPriorityValue(a.priority));
  }

  /**
   * Get intentions by priority
   */
  getByPriority(priority: Priority): Intention[] {
    return Array.from(this.intentions.values())
      .filter(i => i.priority === priority && i.status === 'active');
  }

  /**
   * Get overdue intentions
   */
  getOverdue(): Intention[] {
    return Array.from(this.intentions.values())
      .filter(i => i.status === 'active' && isOverdue(i))
      .sort((a, b) =>
        (a.deadline?.getTime() ?? 0) - (b.deadline?.getTime() ?? 0)
      );
  }

  /**
   * Check triggers against current context
   * Returns intentions that should be triggered
   */
  checkTriggers(context: Context): Intention[] {
    const triggered: Intention[] = [];

    for (const intention of this.intentions.values()) {
      if (intention.status !== 'active') continue;

      // Check if snoozed
      if (intention.snoozedUntil && intention.snoozedUntil.getTime() > context.timestamp.getTime()) {
        continue;
      }

      let shouldTrigger = false;

      switch (intention.trigger.type) {
        case 'time_based':
          shouldTrigger = checkTimeTrigger(intention.trigger, context.timestamp);
          break;

        case 'duration_based':
          shouldTrigger = checkDurationTrigger(
            intention.trigger,
            context.timestamp,
            intention.createdAt
          );
          break;

        case 'event_based':
          shouldTrigger = checkEventTrigger(intention.trigger, context.events);
          break;

        case 'context_based':
          shouldTrigger = checkContextTrigger(intention.trigger, context);
          break;

        case 'recurring':
          shouldTrigger = checkRecurringTrigger(intention.trigger, context.timestamp);
          break;
      }

      if (shouldTrigger) {
        intention.status = 'triggered';
        intention.reminderCount++;

        // Update last triggered for recurring
        if (intention.trigger.type === 'recurring') {
          intention.trigger.lastTriggered = context.timestamp;
          intention.status = 'active'; // Stay active for next occurrence
        }

        triggered.push(intention);
        this.stats.triggered++;
      }

      // Check for auto-escalation
      if (shouldEscalate(intention)) {
        intention.priority = escalatePriority(intention.priority);
      }
    }

    return triggered.sort((a, b) =>
      getPriorityValue(b.priority) - getPriorityValue(a.priority)
    );
  }

  /**
   * Mark intention as fulfilled
   */
  fulfill(id: string): boolean {
    const intention = this.intentions.get(id);
    if (!intention) return false;

    intention.status = 'fulfilled';
    intention.fulfilledAt = new Date();
    this.stats.fulfilled++;
    return true;
  }

  /**
   * Snooze an intention
   */
  snooze(id: string, minutes: number = DEFAULT_SNOOZE_MINUTES): boolean {
    const intention = this.intentions.get(id);
    if (!intention) return false;

    intention.status = 'snoozed';
    intention.snoozedUntil = new Date(Date.now() + minutes * 60 * 1000);
    return true;
  }

  /**
   * Reactivate a snoozed intention
   */
  reactivate(id: string): boolean {
    const intention = this.intentions.get(id);
    if (!intention || intention.status !== 'snoozed') return false;

    intention.status = 'active';
    intention.snoozedUntil = undefined;
    return true;
  }

  /**
   * Cancel an intention
   */
  cancel(id: string): boolean {
    const intention = this.intentions.get(id);
    if (!intention) return false;

    intention.status = 'cancelled';
    this.stats.cancelled++;
    return true;
  }

  /**
   * Mark intention as expired
   */
  expire(id: string): boolean {
    const intention = this.intentions.get(id);
    if (!intention) return false;

    intention.status = 'expired';
    this.stats.expired++;
    return true;
  }

  /**
   * Process expired intentions
   */
  processExpired(): Intention[] {
    const expired: Intention[] = [];
    const now = Date.now();

    for (const intention of this.intentions.values()) {
      if (intention.status === 'active' && intention.deadline) {
        if (intention.deadline.getTime() < now) {
          intention.status = 'expired';
          this.stats.expired++;
          expired.push(intention);
        }
      }
    }

    return expired;
  }

  /**
   * Remove an intention completely
   */
  remove(id: string): boolean {
    return this.intentions.delete(id);
  }

  /**
   * Get all intentions
   */
  getAllIntentions(): Intention[] {
    return Array.from(this.intentions.values());
  }

  /**
   * Get statistics
   */
  getStats(): {
    created: number;
    triggered: number;
    fulfilled: number;
    cancelled: number;
    expired: number;
    active: number;
    fulfillmentRate: number;
  } {
    const active = Array.from(this.intentions.values())
      .filter(i => i.status === 'active').length;

    return {
      ...this.stats,
      active,
      fulfillmentRate: this.stats.triggered > 0
        ? this.stats.fulfilled / this.stats.triggered
        : 0,
    };
  }

  /**
   * Export intentions for persistence
   */
  export(): Intention[] {
    return Array.from(this.intentions.values());
  }

  /**
   * Import intentions
   */
  import(intentions: Intention[]): void {
    for (const intention of intentions) {
      this.intentions.set(intention.id, intention);
    }
  }

  /**
   * Clear all intentions
   */
  clear(): void {
    this.intentions.clear();
    this.stats = {
      created: 0,
      triggered: 0,
      fulfilled: 0,
      cancelled: 0,
      expired: 0,
    };
  }
}
