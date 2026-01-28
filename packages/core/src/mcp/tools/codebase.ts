/**
 * Unified Codebase Tool
 *
 * Merges remember_pattern, remember_decision, and get_codebase_context into a single
 * `codebase` tool with action-based dispatch.
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const CodebaseInputSchema = z.object({
  action: z.enum(['remember_pattern', 'remember_decision', 'get_context']).describe(
    "Action to perform: 'remember_pattern' stores a code pattern, 'remember_decision' stores an architectural decision, 'get_context' retrieves patterns and decisions for a codebase"
  ),
  // remember_pattern fields
  name: z.string().optional().describe('Name/title for the pattern (required for remember_pattern)'),
  description: z.string().optional().describe('Detailed description of the pattern (required for remember_pattern)'),
  // remember_decision fields
  decision: z.string().optional().describe('The architectural or design decision made (required for remember_decision)'),
  rationale: z.string().optional().describe('Why this decision was made (required for remember_decision)'),
  alternatives: z.array(z.string()).optional().describe('Alternatives that were considered (optional for remember_decision)'),
  // Shared fields
  files: z.array(z.string()).optional().describe('Files where this pattern is used or affected by this decision'),
  codebase: z.string().optional().describe("Codebase/project identifier (e.g., 'vestige-tauri')"),
  // get_context fields
  limit: z.number().int().min(1).max(50).default(10).describe('Maximum items per category (default: 10, for get_context)'),
});

export type CodebaseInput = z.infer<typeof CodebaseInputSchema>;

// ============================================================================
// TOOL DEFINITION
// ============================================================================

export const codebaseToolDefinition = {
  name: 'codebase',
  description: 'Unified codebase knowledge tool. Remember code patterns, architectural decisions, and retrieve codebase context.',
  inputSchema: CodebaseInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executeCodebase(
  db: VestigeDatabase,
  args: CodebaseInput
): Promise<{
  success: boolean;
  action: string;
  nodeId?: string;
  patternName?: string;
  message: string;
  patterns?: { count: number; items: unknown[] };
  decisions?: { count: number; items: unknown[] };
  codebase?: string;
}> {
  switch (args.action) {
    case 'remember_pattern':
      return executeRememberPattern(db, args);
    case 'remember_decision':
      return executeRememberDecision(db, args);
    case 'get_context':
      return executeGetContext(db, args);
    default:
      throw new Error(`Invalid action. Must be one of: remember_pattern, remember_decision, get_context`);
  }
}

async function executeRememberPattern(
  db: VestigeDatabase,
  args: CodebaseInput
): Promise<{
  success: boolean;
  action: string;
  nodeId: string;
  patternName: string;
  message: string;
}> {
  if (!args.name) {
    throw new Error("'name' is required for remember_pattern action");
  }
  if (!args.description) {
    throw new Error("'description' is required for remember_pattern action");
  }
  if (args.name.trim() === '') {
    throw new Error('Pattern name cannot be empty');
  }

  // Build content with structured format
  let content = `# Code Pattern: ${args.name}\n\n${args.description}`;

  if (args.files && args.files.length > 0) {
    content += '\n\n## Files:\n';
    for (const f of args.files) {
      content += `- ${f}\n`;
    }
  }

  // Build tags
  const tags = ['pattern', 'codebase'];
  if (args.codebase) {
    tags.push(`codebase:${args.codebase}`);
  }

  const node = db.insertNode({
    content,
    sourceType: 'pattern',
    sourcePlatform: args.codebase ? 'mcp' : 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 0,
    retentionStrength: 1.0,
    stabilityFactor: 1.0,
    reviewCount: 0,
    confidence: 0.8,
    isContradicted: false,
    contradictionIds: [],
    people: [],
    concepts: [],
    events: [],
    tags,
    sourceChain: [],
  });

  return {
    success: true,
    action: 'remember_pattern',
    nodeId: node.id,
    patternName: args.name,
    message: `Pattern '${args.name}' remembered successfully`,
  };
}

async function executeRememberDecision(
  db: VestigeDatabase,
  args: CodebaseInput
): Promise<{
  success: boolean;
  action: string;
  nodeId: string;
  message: string;
}> {
  if (!args.decision) {
    throw new Error("'decision' is required for remember_decision action");
  }
  if (!args.rationale) {
    throw new Error("'rationale' is required for remember_decision action");
  }
  if (args.decision.trim() === '') {
    throw new Error('Decision cannot be empty');
  }

  // Build content with structured format (ADR-like)
  const decisionTitle = args.decision.slice(0, 50);
  let content = `# Decision: ${decisionTitle}\n\n## Context\n\n${args.rationale}\n\n## Decision\n\n${args.decision}`;

  if (args.alternatives && args.alternatives.length > 0) {
    content += '\n\n## Alternatives Considered:\n';
    for (const alt of args.alternatives) {
      content += `- ${alt}\n`;
    }
  }

  if (args.files && args.files.length > 0) {
    content += '\n\n## Affected Files:\n';
    for (const f of args.files) {
      content += `- ${f}\n`;
    }
  }

  // Build tags
  const tags = ['decision', 'architecture', 'codebase'];
  if (args.codebase) {
    tags.push(`codebase:${args.codebase}`);
  }

  const node = db.insertNode({
    content,
    sourceType: 'decision',
    sourcePlatform: args.codebase ? 'mcp' : 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 0,
    retentionStrength: 1.0,
    stabilityFactor: 1.0,
    reviewCount: 0,
    confidence: 0.8,
    isContradicted: false,
    contradictionIds: [],
    people: [],
    concepts: [],
    events: [],
    tags,
    sourceChain: [],
  });

  return {
    success: true,
    action: 'remember_decision',
    nodeId: node.id,
    message: 'Architectural decision remembered successfully',
  };
}

async function executeGetContext(
  db: VestigeDatabase,
  args: CodebaseInput
): Promise<{
  success: boolean;
  action: string;
  codebase: string | undefined;
  patterns: { count: number; items: unknown[] };
  decisions: { count: number; items: unknown[] };
  message: string;
}> {
  const limit = args.limit ?? 10;

  // Use direct SQL to query by source_type
  const internalDb = (db as unknown as { db: { prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] } } }).db;

  // Build codebase filter for tags
  const codebaseTag = args.codebase ? `%codebase:${args.codebase}%` : '%codebase%';

  // Get patterns (source_type = 'pattern')
  const patternRows = internalDb.prepare(`
    SELECT id, content, tags, retention_strength, created_at
    FROM knowledge_nodes
    WHERE source_type = 'pattern'
    AND tags LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(codebaseTag, limit) as Array<{
    id: string;
    content: string;
    tags: string;
    retention_strength: number;
    created_at: string;
  }>;

  const patterns = patternRows.map(row => ({
    id: row.id,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    retentionStrength: row.retention_strength,
    createdAt: row.created_at,
  }));

  // Get decisions (source_type = 'decision')
  const decisionRows = internalDb.prepare(`
    SELECT id, content, tags, retention_strength, created_at
    FROM knowledge_nodes
    WHERE source_type = 'decision'
    AND tags LIKE ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(codebaseTag, limit) as Array<{
    id: string;
    content: string;
    tags: string;
    retention_strength: number;
    created_at: string;
  }>;

  const decisions = decisionRows.map(row => ({
    id: row.id,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    retentionStrength: row.retention_strength,
    createdAt: row.created_at,
  }));

  return {
    success: true,
    action: 'get_context',
    codebase: args.codebase,
    patterns: {
      count: patterns.length,
      items: patterns,
    },
    decisions: {
      count: decisions.length,
      items: decisions,
    },
    message: `Found ${patterns.length} patterns and ${decisions.length} decisions`,
  };
}
