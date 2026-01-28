/**
 * Knowledge Tool
 *
 * Direct knowledge node operations: get and delete.
 *
 * Reference: Rust implementation in crates/vestige-mcp/src/tools/knowledge.rs
 */

import { z } from 'zod';
import type { VestigeDatabase } from '../../core/database.js';

// ============================================================================
// SCHEMAS
// ============================================================================

export const GetKnowledgeInputSchema = z.object({
  id: z.string().describe('The ID of the knowledge node to retrieve'),
});

export const DeleteKnowledgeInputSchema = z.object({
  id: z.string().describe('The ID of the knowledge node to delete'),
  confirm: z.boolean().default(false).describe('Confirm deletion'),
});

export type GetKnowledgeInput = z.infer<typeof GetKnowledgeInputSchema>;
export type DeleteKnowledgeInput = z.infer<typeof DeleteKnowledgeInputSchema>;

// ============================================================================
// TYPES
// ============================================================================

export interface KnowledgeNodeDetail {
  id: string;
  content: string;
  summary: string | null;
  retentionStrength: number;
  stabilityFactor: number;
  storageStrength: number;
  retrievalStrength: number;
  sentimentIntensity: number;
  accessCount: number;
  reviewCount: number;
  confidence: number;
  isContradicted: boolean;
  sourceType: string;
  sourcePlatform: string;
  sourceId: string | null;
  sourceUrl: string | null;
  tags: string[];
  people: string[];
  concepts: string[];
  events: string[];
  createdAt: string;
  updatedAt: string;
  lastAccessedAt: string;
  nextReviewDate: string | null;
  gitContext: Record<string, unknown> | null;
}

export interface GetKnowledgeOutput {
  success: boolean;
  node: KnowledgeNodeDetail | null;
}

export interface DeleteKnowledgeOutput {
  success: boolean;
  deleted: boolean;
  id: string;
  message: string;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const getKnowledgeToolDefinition = {
  name: 'get_knowledge',
  description: 'Get detailed information about a specific knowledge node by ID.',
  inputSchema: GetKnowledgeInputSchema.shape,
};

export const deleteKnowledgeToolDefinition = {
  name: 'delete_knowledge',
  description: 'Delete a knowledge node by ID. Requires confirm=true to actually delete.',
  inputSchema: DeleteKnowledgeInputSchema.shape,
};

// ============================================================================
// EXECUTE FUNCTIONS
// ============================================================================

export async function executeGetKnowledge(
  db: VestigeDatabase,
  args: GetKnowledgeInput
): Promise<GetKnowledgeOutput> {
  const { id } = args;

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        get: (...args: unknown[]) => unknown;
      };
    };
    updateNodeAccess: (id: string) => void;
  });

  const row = internalDb.db.prepare(`
    SELECT
      id,
      content,
      summary,
      retention_strength,
      stability_factor,
      storage_strength,
      retrieval_strength,
      sentiment_intensity,
      access_count,
      review_count,
      confidence,
      is_contradicted,
      contradiction_ids,
      source_type,
      source_platform,
      source_id,
      source_url,
      tags,
      people,
      concepts,
      events,
      created_at,
      updated_at,
      last_accessed_at,
      next_review_date,
      git_context
    FROM knowledge_nodes
    WHERE id = ?
  `).get(id) as {
    id: string;
    content: string;
    summary: string | null;
    retention_strength: number;
    stability_factor: number;
    storage_strength: number;
    retrieval_strength: number;
    sentiment_intensity: number;
    access_count: number;
    review_count: number;
    confidence: number;
    is_contradicted: number;
    contradiction_ids: string;
    source_type: string;
    source_platform: string;
    source_id: string | null;
    source_url: string | null;
    tags: string;
    people: string;
    concepts: string;
    events: string;
    created_at: string;
    updated_at: string;
    last_accessed_at: string;
    next_review_date: string | null;
    git_context: string | null;
  } | undefined;

  if (!row) {
    return {
      success: false,
      node: null,
    };
  }

  // Update access
  try {
    internalDb.updateNodeAccess(id);
  } catch {
    // Non-critical
  }

  // Parse JSON fields
  const parseJsonArray = (str: string): string[] => {
    try {
      return JSON.parse(str);
    } catch {
      return [];
    }
  };

  const parseJsonObject = (str: string | null): Record<string, unknown> | null => {
    if (!str) return null;
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  };

  const node: KnowledgeNodeDetail = {
    id: row.id,
    content: row.content,
    summary: row.summary,
    retentionStrength: row.retention_strength,
    stabilityFactor: row.stability_factor,
    storageStrength: row.storage_strength,
    retrievalStrength: row.retrieval_strength,
    sentimentIntensity: row.sentiment_intensity,
    accessCount: row.access_count,
    reviewCount: row.review_count,
    confidence: row.confidence,
    isContradicted: row.is_contradicted === 1,
    sourceType: row.source_type,
    sourcePlatform: row.source_platform,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    tags: parseJsonArray(row.tags),
    people: parseJsonArray(row.people),
    concepts: parseJsonArray(row.concepts),
    events: parseJsonArray(row.events),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastAccessedAt: row.last_accessed_at,
    nextReviewDate: row.next_review_date,
    gitContext: parseJsonObject(row.git_context),
  };

  return {
    success: true,
    node,
  };
}

export async function executeDeleteKnowledge(
  db: VestigeDatabase,
  args: DeleteKnowledgeInput
): Promise<DeleteKnowledgeOutput> {
  const { id, confirm } = args;

  if (!confirm) {
    return {
      success: true,
      deleted: false,
      id,
      message: 'Deletion not confirmed. Set confirm=true to delete.',
    };
  }

  const internalDb = (db as unknown as {
    db: {
      prepare: (sql: string) => {
        run: (...args: unknown[]) => { changes: number };
      };
    };
  });

  // Delete the node
  const result = internalDb.db.prepare(`
    DELETE FROM knowledge_nodes WHERE id = ?
  `).run(id);

  if (result.changes === 0) {
    return {
      success: false,
      deleted: false,
      id,
      message: `Node not found: ${id}`,
    };
  }

  // Also delete related embeddings
  internalDb.db.prepare(`
    DELETE FROM embeddings WHERE node_id = ?
  `).run(id);

  // Delete edges involving this node
  internalDb.db.prepare(`
    DELETE FROM graph_edges WHERE from_id = ? OR to_id = ?
  `).run(id, id);

  return {
    success: true,
    deleted: true,
    id,
    message: `Successfully deleted node: ${id}`,
  };
}
