/**
 * Vestige HTTP Server
 *
 * Streamable HTTP transport for running Vestige MCP server in web applications.
 * Provides all 20 tools from the stdio version.
 *
 * Tools:
 * - Core: ingest, search, recall, get, delete
 * - Review: review, due, decay
 * - Stats: stats, consolidate
 * - Context: context
 * - Memory States: get_memory_state, list_by_state, state_stats
 * - Tagging: trigger_importance, find_tagged, tag_stats
 * - Codebase: codebase
 * - Intentions: intention
 * - Feedback: promote_memory, demote_memory, request_feedback
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import type { DatabaseAdapter } from './database-adapter.ts';
import { FSRSScheduler, type FSRSState, type ReviewGrade } from '../core/fsrs.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface VestigeHttpServerConfig {
  database: DatabaseAdapter;
  name?: string;
  version?: string;
  desiredRetention?: number;
  debug?: boolean;
}

export interface VestigeHttpServer {
  server: McpServer;
  handleWebRequest(request: Request): Promise<Response>;
  handleNodeRequest(
    req: import('http').IncomingMessage,
    res: import('http').ServerResponse
  ): Promise<void>;
  close(): Promise<void>;
}

interface MemoryRow {
  id: string;
  content: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  access_count: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: string;
  last_review: string | null;
  next_review: string | null;
  retention_strength: number;
  stability_factor: number;
  sentiment_intensity: number;
  storage_strength: number;
  retrieval_strength: number;
  source_type: string;
  source_platform: string;
  source_url: string | null;
  tags: string;
  people: string;
  concepts: string;
  confidence: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STATE_THRESHOLDS = { active: 0.7, dormant: 0.4, silent: 0.1 };

const EVENT_STRENGTH_BOOST: Record<string, number> = {
  breakthrough: 0.3, deadline_met: 0.2, user_feedback: 0.25,
  repeated_access: 0.15, explicit_mark: 0.35, emotional: 0.2, novel_connection: 0.25,
};

const EVENT_STABILITY_BOOST: Record<string, number> = {
  breakthrough: 2.0, deadline_met: 1.5, user_feedback: 1.8,
  repeated_access: 1.3, explicit_mark: 2.5, emotional: 1.6, novel_connection: 1.7,
};

// ============================================================================
// CREATE SERVER
// ============================================================================

export async function createVestigeHttpServer(
  config: VestigeHttpServerConfig
): Promise<VestigeHttpServer> {
  const {
    database: db,
    name = 'vestige',
    version = '0.3.0',
    desiredRetention = 0.9,
    debug = false,
  } = config;

  const fsrs = new FSRSScheduler({ desiredRetention });
  const server = new McpServer({ name, version });
  const toolHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();

  const log = (...args: unknown[]) => { if (debug) console.log(`[${name}]`, ...args); };
  const jsonResponse = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
  const errorResponse = (message: string, code?: string) => jsonResponse({ error: message, code });
  const generateId = () => crypto.randomUUID();
  const parseJson = <T>(s: string, fallback: T): T => { try { return JSON.parse(s); } catch { return fallback; } };
  const getState = (r: number) => r >= 0.7 ? 'active' : r >= 0.4 ? 'dormant' : r >= 0.1 ? 'silent' : 'unavailable';

  function registerTool(
    toolName: string,
    description: string,
    schema: Record<string, unknown>,
    handler: (args: Record<string, unknown>) => Promise<unknown>
  ) {
    server.tool(toolName, description, schema, handler);
    const zodSchema = z.object(schema as z.ZodRawShape);
    toolHandlers.set(toolName, async (args) => {
      const parsed = zodSchema.safeParse(args);
      if (!parsed.success) throw new Error(`Validation failed: ${parsed.error.message}`);
      return handler(parsed.data);
    });
  }

  // ==========================================================================
  // TOOL 1: INGEST (smart_ingest)
  // ==========================================================================
  registerTool('ingest', 'Store new knowledge with FSRS scheduling', {
    content: z.string().min(1).describe('Content to remember'),
    summary: z.string().optional().describe('Brief summary'),
    tags: z.array(z.string()).optional().describe('Tags'),
    source: z.string().optional().default('note').describe('Source type'),
    platform: z.string().optional().default('api').describe('Platform'),
    sourceUrl: z.string().optional().describe('Source URL'),
    people: z.array(z.string()).optional().describe('People mentioned'),
  }, async (args) => {
    const id = generateId();
    const card = fsrs.newCard();
    const now = new Date().toISOString();
    await db.execute(`INSERT INTO knowledge_nodes (id, content, summary, tags, people, concepts, source_type, source_platform, source_url, stability, difficulty, reps, lapses, state, retention_strength, storage_strength, retrieval_strength, created_at, updated_at, last_accessed_at) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, 0, 0, 'New', 1.0, 1.0, 1.0, ?, ?, ?)`,
      [id, args.content, args.summary ?? null, JSON.stringify(args.tags ?? []), JSON.stringify(args.people ?? []), args.source, args.platform, args.sourceUrl ?? null, card.stability, card.difficulty, now, now, now]);
    log('Ingested:', id);
    return jsonResponse({ success: true, id, fsrs: { stability: card.stability, difficulty: card.difficulty, state: 'New' } });
  });

  // ==========================================================================
  // TOOL 2: SEARCH
  // ==========================================================================
  registerTool('search', 'Hybrid search (vector + keyword)', {
    query: z.string().min(1).describe('Search query'),
    limit: z.number().int().min(1).max(100).optional().default(10),
    minRetention: z.number().min(0).max(1).optional(),
    minSimilarity: z.number().min(0).max(1).optional().default(0.3),
  }, async (args) => {
    const { query, limit, minRetention } = args as { query: string; limit: number; minRetention?: number };
    const sanitized = query.replace(/[^\w\s\-]/g, ' ').trim();
    if (!sanitized) return jsonResponse({ query, method: 'hybrid', total: 0, results: [] });

    let sql = `SELECT kn.* FROM knowledge_nodes kn JOIN knowledge_fts fts ON kn.id = fts.id WHERE knowledge_fts MATCH ?`;
    const params: unknown[] = [sanitized];
    if (minRetention !== undefined) { sql += ` AND kn.retention_strength >= ?`; params.push(minRetention); }
    sql += ` ORDER BY rank LIMIT ?`; params.push(limit);

    try {
      const rows = await db.query<MemoryRow>(sql, params);
      for (const r of rows) await db.execute(`UPDATE knowledge_nodes SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?`, [r.id]);
      return jsonResponse({ query, method: 'hybrid', total: rows.length, results: rows.map(r => ({ id: r.id, content: r.content.slice(0, 500), summary: r.summary, score: 1, retentionStrength: r.retention_strength, tags: parseJson(r.tags, []), sourceType: r.source_type, createdAt: r.created_at })) });
    } catch {
      const rows = await db.query<MemoryRow>(`SELECT * FROM knowledge_nodes WHERE content LIKE ? LIMIT ?`, [`%${query}%`, limit]);
      return jsonResponse({ query, method: 'hybrid', total: rows.length, results: rows.map(r => ({ id: r.id, content: r.content.slice(0, 500), summary: r.summary, tags: parseJson(r.tags, []) })), fallback: true });
    }
  });

  // ==========================================================================
  // TOOL 3: RECALL
  // ==========================================================================
  registerTool('recall', 'Natural memory recall with Testing Effect', {
    query: z.string().min(1).describe('Recall query'),
    limit: z.number().int().min(1).max(100).optional().default(10),
    minRetention: z.number().min(0).max(1).optional(),
  }, async (args) => {
    const { query, limit, minRetention } = args as { query: string; limit: number; minRetention?: number };
    let sql = `SELECT * FROM knowledge_nodes WHERE content LIKE ? OR summary LIKE ?`;
    const params: unknown[] = [`%${query}%`, `%${query}%`];
    if (minRetention !== undefined) { sql += ` AND retention_strength >= ?`; params.push(minRetention); }
    sql += ` ORDER BY retention_strength DESC, last_accessed_at DESC LIMIT ?`; params.push(limit);
    const rows = await db.query<MemoryRow>(sql, params);
    for (const r of rows) await db.execute(`UPDATE knowledge_nodes SET last_accessed_at = datetime('now'), access_count = access_count + 1, storage_strength = storage_strength + 0.05, retrieval_strength = 1.0 WHERE id = ?`, [r.id]);
    return jsonResponse({ query, total: rows.length, results: rows.map(r => ({ id: r.id, content: r.content.slice(0, 500), summary: r.summary, retention: r.retention_strength, tags: parseJson(r.tags, []) })) });
  });

  // ==========================================================================
  // TOOL 4: REVIEW
  // ==========================================================================
  registerTool('review', 'Review memory with spaced repetition (1=Again, 2=Hard, 3=Good, 4=Easy)', {
    id: z.string().describe('Memory ID'),
    grade: z.number().int().min(1).max(4).describe('Review grade'),
  }, async (args) => {
    const { id, grade } = args as { id: string; grade: 1|2|3|4 };
    const memory = await db.queryOne<MemoryRow>('SELECT * FROM knowledge_nodes WHERE id = ?', [id]);
    if (!memory) return errorResponse('Memory not found', 'NOT_FOUND');

    const state: FSRSState = { stability: memory.stability, difficulty: memory.difficulty, reps: memory.reps, lapses: memory.lapses, lastReview: memory.last_review ? new Date(memory.last_review) : undefined, state: memory.state as 'New'|'Learning'|'Review'|'Relearning' };
    const daysSince = memory.last_review ? (Date.now() - new Date(memory.last_review).getTime()) / 86400000 : 0;
    const result = fsrs.review(state, grade, daysSince);
    const nextReview = new Date(Date.now() + result.interval * 86400000);

    await db.execute(`UPDATE knowledge_nodes SET stability = ?, difficulty = ?, reps = reps + 1, lapses = lapses + ?, state = ?, last_review = datetime('now'), next_review = ?, retention_strength = ?, retrieval_strength = 1.0, storage_strength = storage_strength + ?, updated_at = datetime('now') WHERE id = ?`,
      [result.state.stability, result.state.difficulty, result.isLapse ? 1 : 0, result.state.state, nextReview.toISOString(), result.retrievability, result.isLapse ? 0.3 : 0.1, id]);

    const grades = ['', 'Again', 'Hard', 'Good', 'Easy'];
    log('Reviewed:', id, grades[grade], result.interval.toFixed(1), 'days');
    return jsonResponse({ success: true, id, grade: grades[grade], fsrs: result, nextReview: { date: nextReview.toISOString(), days: Math.round(result.interval) } });
  });

  // ==========================================================================
  // TOOL 5: DUE
  // ==========================================================================
  registerTool('due', 'Get memories due for review', {
    limit: z.number().int().min(1).max(100).optional().default(10),
  }, async (args) => {
    const rows = await db.query<MemoryRow>(`SELECT * FROM knowledge_nodes WHERE next_review IS NOT NULL AND next_review <= datetime('now') ORDER BY next_review ASC LIMIT ?`, [(args as {limit:number}).limit]);
    return jsonResponse({ total: rows.length, memories: rows.map(r => ({ id: r.id, content: r.content.slice(0, 200), summary: r.summary, tags: parseJson(r.tags, []), dueDate: r.next_review, stability: r.stability, state: r.state })) });
  });

  // ==========================================================================
  // TOOL 6: GET (get_knowledge)
  // ==========================================================================
  registerTool('get', 'Get a specific memory by ID', {
    id: z.string().describe('Memory ID'),
  }, async (args) => {
    const memory = await db.queryOne<MemoryRow>('SELECT * FROM knowledge_nodes WHERE id = ?', [(args as {id:string}).id]);
    if (!memory) return errorResponse('Memory not found', 'NOT_FOUND');
    await db.execute(`UPDATE knowledge_nodes SET last_accessed_at = datetime('now'), access_count = access_count + 1 WHERE id = ?`, [memory.id]);
    return jsonResponse({ ...memory, tags: parseJson(memory.tags, []), people: parseJson(memory.people, []), concepts: parseJson(memory.concepts, []) });
  });

  // ==========================================================================
  // TOOL 7: DELETE (delete_knowledge)
  // ==========================================================================
  registerTool('delete', 'Delete a memory', {
    id: z.string().describe('Memory ID'),
    confirm: z.boolean().optional().default(false).describe('Confirm deletion'),
  }, async (args) => {
    const { id, confirm } = args as { id: string; confirm: boolean };
    if (!confirm) return jsonResponse({ warning: 'Set confirm: true to delete', id });
    const result = await db.execute('DELETE FROM knowledge_nodes WHERE id = ?', [id]);
    if (result.rowsAffected === 0) return errorResponse('Memory not found', 'NOT_FOUND');
    log('Deleted:', id);
    return jsonResponse({ success: true, id, message: 'Memory deleted' });
  });

  // ==========================================================================
  // TOOL 8: STATS
  // ==========================================================================
  registerTool('stats', 'Get memory statistics', {}, async () => {
    const stats = await db.queryOne<{total:number;active:number;dormant:number;silent:number;due:number;avg_stability:number;avg_retention:number}>(`SELECT COUNT(*) as total, COUNT(CASE WHEN retention_strength >= 0.7 THEN 1 END) as active, COUNT(CASE WHEN retention_strength >= 0.4 AND retention_strength < 0.7 THEN 1 END) as dormant, COUNT(CASE WHEN retention_strength < 0.4 THEN 1 END) as silent, COUNT(CASE WHEN next_review <= datetime('now') THEN 1 END) as due, AVG(stability) as avg_stability, AVG(retention_strength) as avg_retention FROM knowledge_nodes`);
    const states = await db.query<{state:string;count:number}>(`SELECT state, COUNT(*) as count FROM knowledge_nodes GROUP BY state`);
    return jsonResponse({ overview: { total: stats?.total??0, dueForReview: stats?.due??0, avgStability: (stats?.avg_stability??0).toFixed(2), avgRetention: (stats?.avg_retention??0).toFixed(2) }, retention: { active: stats?.active??0, dormant: stats?.dormant??0, silent: stats?.silent??0 }, states: Object.fromEntries(states.map(s => [s.state, s.count])), healthy: await db.isHealthy() });
  });

  // ==========================================================================
  // TOOL 9: CONSOLIDATE
  // ==========================================================================
  registerTool('consolidate', 'Run memory consolidation (decay, promotion, pruning)', {
    dryRun: z.boolean().optional().default(false).describe('Preview without applying'),
  }, async (args) => {
    const dryRun = (args as {dryRun:boolean}).dryRun;
    const nodes = await db.query<{id:string;last_accessed_at:string;stability:number;storage_strength:number;retrieval_strength:number;retention_strength:number}>(`SELECT id, last_accessed_at, stability, storage_strength, retrieval_strength, retention_strength FROM knowledge_nodes`);
    const now = Date.now();
    let decayed = 0, promoted = 0, pruned = 0;

    for (const n of nodes) {
      const days = (now - new Date(n.last_accessed_at).getTime()) / 86400000;
      const newRetrieval = Math.max(0.1, Math.exp(-days / n.stability));
      const normalizedStorage = Math.min(1, n.storage_strength / 10);
      const newRetention = (newRetrieval * 0.7) + (normalizedStorage * 0.3);

      if (newRetention < 0.05 && !dryRun) { await db.execute('DELETE FROM knowledge_nodes WHERE id = ?', [n.id]); pruned++; }
      else if (Math.abs(newRetention - n.retention_strength) > 0.01) {
        if (!dryRun) await db.execute(`UPDATE knowledge_nodes SET retrieval_strength = ?, retention_strength = ? WHERE id = ?`, [newRetrieval, newRetention, n.id]);
        if (newRetention > n.retention_strength) promoted++; else decayed++;
      }
    }
    log('Consolidated:', { decayed, promoted, pruned });
    return jsonResponse({ success: true, dryRun, nodesProcessed: nodes.length, decayed, promoted, pruned });
  });

  // ==========================================================================
  // TOOL 10: CONTEXT
  // ==========================================================================
  registerTool('context', 'Context-aware memory retrieval', {
    query: z.string().min(1).describe('Context query'),
    topics: z.array(z.string()).optional().describe('Topics to boost'),
    project: z.string().optional().describe('Project name'),
    mood: z.enum(['positive', 'negative', 'neutral']).optional(),
    timeWeight: z.number().min(0).max(1).optional().default(0.3),
    topicWeight: z.number().min(0).max(1).optional().default(0.4),
    limit: z.number().int().min(1).max(50).optional().default(10),
  }, async (args) => {
    const { query, topics, project, mood, timeWeight, topicWeight, limit } = args as {query:string;topics?:string[];project?:string;mood?:string;timeWeight:number;topicWeight:number;limit:number};
    const rows = await db.query<MemoryRow>(`SELECT * FROM knowledge_nodes WHERE retention_strength > 0.1 AND (content LIKE ? OR summary LIKE ?) ORDER BY retention_strength DESC LIMIT ?`, [`%${query}%`, `%${query}%`, limit * 3]);

    const scored = rows.map(r => {
      const tags = parseJson<string[]>(r.tags, []);
      const days = (Date.now() - new Date(r.created_at).getTime()) / 86400000;
      const temporal = Math.pow(0.5, days / 14);
      const topicScore = topics?.length ? tags.filter(t => topics.some(tp => t.toLowerCase().includes(tp.toLowerCase()))).length / topics.length : 0;
      const projectScore = project && (r.content.toLowerCase().includes(project.toLowerCase()) || tags.some(t => t.toLowerCase().includes(project.toLowerCase()))) ? 1 : 0;
      const moodScore = mood === 'neutral' ? 1 - r.sentiment_intensity : r.sentiment_intensity;
      const total = timeWeight + topicWeight + 0.2 + 0.1;
      const relevance = (temporal * timeWeight + topicScore * topicWeight + projectScore * 0.2 + moodScore * 0.1) / total;
      return { ...r, relevance, temporal, topicScore, projectScore, moodScore, tags };
    }).sort((a, b) => b.relevance - a.relevance).slice(0, limit);

    return jsonResponse({ query, context: { topics: topics??[], project: project??null, mood: mood??null }, total: scored.length, results: scored.map(r => ({ id: r.id, content: r.content.slice(0, 500), summary: r.summary, relevanceScore: r.relevance, temporalScore: r.temporal, topicScore: r.topicScore, projectScore: r.projectScore, moodScore: r.moodScore, tags: r.tags, sourceType: r.source_type, createdAt: r.created_at })) });
  });

  // ==========================================================================
  // TOOL 11: GET_MEMORY_STATE
  // ==========================================================================
  registerTool('get_memory_state', 'Get memory state (active/dormant/silent/unavailable)', {
    id: z.string().describe('Memory ID'),
  }, async (args) => {
    const m = await db.queryOne<MemoryRow>('SELECT * FROM knowledge_nodes WHERE id = ?', [(args as {id:string}).id]);
    if (!m) return errorResponse('Memory not found', 'NOT_FOUND');
    const state = getState(m.retention_strength);
    return jsonResponse({ id: m.id, state, retention: m.retention_strength, stability: m.stability, accessibility: state === 'active' ? 1.0 : state === 'dormant' ? 0.7 : state === 'silent' ? 0.3 : 0.05, description: state === 'active' ? 'Readily accessible' : state === 'dormant' ? 'Needs cue to access' : state === 'silent' ? 'Difficult to access' : 'Effectively forgotten' });
  });

  // ==========================================================================
  // TOOL 12: LIST_BY_STATE
  // ==========================================================================
  registerTool('list_by_state', 'List memories by retention state', {
    state: z.enum(['active', 'dormant', 'silent', 'unavailable']).describe('Memory state'),
    limit: z.number().int().min(1).max(100).optional().default(20),
  }, async (args) => {
    const { state, limit } = args as {state:string;limit:number};
    const [min, max] = state === 'active' ? [0.7, 1.1] : state === 'dormant' ? [0.4, 0.7] : state === 'silent' ? [0.1, 0.4] : [0, 0.1];
    const rows = await db.query<MemoryRow>(`SELECT * FROM knowledge_nodes WHERE retention_strength >= ? AND retention_strength < ? ORDER BY retention_strength DESC LIMIT ?`, [min, max, limit]);
    return jsonResponse({ state, total: rows.length, memories: rows.map(r => ({ id: r.id, content: r.content.slice(0, 200), retention: r.retention_strength, lastAccessed: r.last_accessed_at })) });
  });

  // ==========================================================================
  // TOOL 13: STATE_STATS
  // ==========================================================================
  registerTool('state_stats', 'Get statistics by memory state', {}, async () => {
    const stats = await db.queryOne<{active:number;dormant:number;silent:number;unavailable:number}>(`SELECT COUNT(CASE WHEN retention_strength >= 0.7 THEN 1 END) as active, COUNT(CASE WHEN retention_strength >= 0.4 AND retention_strength < 0.7 THEN 1 END) as dormant, COUNT(CASE WHEN retention_strength >= 0.1 AND retention_strength < 0.4 THEN 1 END) as silent, COUNT(CASE WHEN retention_strength < 0.1 THEN 1 END) as unavailable FROM knowledge_nodes`);
    const total = (stats?.active??0) + (stats?.dormant??0) + (stats?.silent??0) + (stats?.unavailable??0);
    return jsonResponse({ total, distribution: stats, percentages: { active: total ? ((stats?.active??0)/total*100).toFixed(1)+'%' : '0%', dormant: total ? ((stats?.dormant??0)/total*100).toFixed(1)+'%' : '0%', silent: total ? ((stats?.silent??0)/total*100).toFixed(1)+'%' : '0%', unavailable: total ? ((stats?.unavailable??0)/total*100).toFixed(1)+'%' : '0%' } });
  });

  // ==========================================================================
  // TOOL 14: TRIGGER_IMPORTANCE (Synaptic Tagging)
  // ==========================================================================
  registerTool('trigger_importance', 'Tag memories as important (Synaptic Tagging & Capture)', {
    eventType: z.enum(['breakthrough', 'deadline_met', 'user_feedback', 'repeated_access', 'explicit_mark', 'emotional', 'novel_connection']).describe('Event type'),
    memoryId: z.string().optional().describe('Specific memory to tag'),
    hoursBack: z.number().min(0).max(48).optional().default(9),
    hoursForward: z.number().min(0).max(12).optional().default(2),
  }, async (args) => {
    const { eventType, memoryId, hoursBack, hoursForward } = args as {eventType:string;memoryId?:string;hoursBack:number;hoursForward:number};
    const now = new Date();
    const windowStart = new Date(now.getTime() - hoursBack * 3600000);
    const windowEnd = new Date(now.getTime() + hoursForward * 3600000);
    const strength = EVENT_STRENGTH_BOOST[eventType] ?? 0.2;
    const stability = EVENT_STABILITY_BOOST[eventType] ?? 1.5;
    const taggedIds: string[] = [];

    if (memoryId) {
      const result = await db.execute(`UPDATE knowledge_nodes SET retention_strength = MIN(1.0, retention_strength + ?), stability_factor = stability_factor * ?, updated_at = ? WHERE id = ?`, [strength, stability, now.toISOString(), memoryId]);
      if (result.rowsAffected > 0) taggedIds.push(memoryId);
    } else {
      const rows = await db.query<{id:string}>(`SELECT id FROM knowledge_nodes WHERE (created_at >= ? AND created_at <= ?) OR (last_accessed_at >= ? AND last_accessed_at <= ?) LIMIT 50`, [windowStart.toISOString(), windowEnd.toISOString(), windowStart.toISOString(), windowEnd.toISOString()]);
      for (const r of rows) { await db.execute(`UPDATE knowledge_nodes SET retention_strength = MIN(1.0, retention_strength + ?), stability_factor = stability_factor * ?, updated_at = ? WHERE id = ?`, [strength, stability, now.toISOString(), r.id]); taggedIds.push(r.id); }
    }
    log('Tagged', taggedIds.length, 'memories for', eventType);
    return jsonResponse({ success: true, eventType, memoriesTagged: taggedIds.length, captureWindow: { start: windowStart.toISOString(), end: windowEnd.toISOString() }, taggedIds });
  });

  // ==========================================================================
  // TOOL 15: FIND_TAGGED
  // ==========================================================================
  registerTool('find_tagged', 'Find memories tagged as important', {
    minStrength: z.number().min(0).max(1).optional().default(0.5),
    limit: z.number().int().min(1).max(100).optional().default(20),
  }, async (args) => {
    const { minStrength, limit } = args as {minStrength:number;limit:number};
    const rows = await db.query<MemoryRow>(`SELECT * FROM knowledge_nodes WHERE stability_factor > 1.3 AND retention_strength >= ? ORDER BY stability_factor DESC LIMIT ?`, [minStrength, limit]);
    return jsonResponse({ total: rows.length, memories: rows.map(r => ({ id: r.id, content: r.content.slice(0, 200), retention: r.retention_strength, stabilityFactor: r.stability_factor, tagStrength: Math.min(1, (r.stability_factor - 1) / 1.5), taggedAt: r.updated_at })) });
  });

  // ==========================================================================
  // TOOL 16: TAG_STATS
  // ==========================================================================
  registerTool('tag_stats', 'Get tagging statistics', {}, async () => {
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const stats = await db.queryOne<{total:number;avg_stability:number;recent:number}>(`SELECT COUNT(*) as total, AVG(stability_factor) as avg_stability, COUNT(CASE WHEN updated_at >= ? THEN 1 END) as recent FROM knowledge_nodes WHERE stability_factor > 1.3`, [oneDayAgo]);
    return jsonResponse({ totalTagged: stats?.total ?? 0, avgTagStrength: stats?.avg_stability ? Math.min(1, (stats.avg_stability - 1) / 1.5) : 0, recentlyTagged: stats?.recent ?? 0 });
  });

  // ==========================================================================
  // TOOL 17: CODEBASE
  // ==========================================================================
  registerTool('codebase', 'Get codebase-related memories', {
    query: z.string().optional().describe('Search query'),
    project: z.string().optional().describe('Project name'),
    filePattern: z.string().optional().describe('File pattern'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  }, async (args) => {
    const { query, project, limit } = args as {query?:string;project?:string;limit:number};
    let sql = `SELECT * FROM knowledge_nodes WHERE source_type IN ('code', 'codebase', 'file', 'document')`;
    const params: unknown[] = [];
    if (query) { sql += ` AND content LIKE ?`; params.push(`%${query}%`); }
    if (project) { sql += ` AND (content LIKE ? OR tags LIKE ?)`; params.push(`%${project}%`, `%${project}%`); }
    sql += ` ORDER BY last_accessed_at DESC LIMIT ?`; params.push(limit);
    const rows = await db.query<MemoryRow>(sql, params);
    return jsonResponse({ total: rows.length, results: rows.map(r => ({ id: r.id, content: r.content.slice(0, 500), sourceType: r.source_type, sourceUrl: r.source_url, tags: parseJson(r.tags, []), lastAccessed: r.last_accessed_at })) });
  });

  // ==========================================================================
  // TOOL 18: INTENTION
  // ==========================================================================
  registerTool('intention', 'Manage intentions (prospective memory)', {
    action: z.enum(['create', 'list', 'complete', 'cancel']).describe('Action'),
    content: z.string().optional().describe('Intention content (for create)'),
    id: z.string().optional().describe('Intention ID (for complete/cancel)'),
    triggerType: z.enum(['time_based', 'event_based', 'context_based']).optional().default('event_based'),
    priority: z.enum(['low', 'normal', 'high', 'critical']).optional().default('normal'),
  }, async (args) => {
    const { action, content, id, triggerType, priority } = args as {action:string;content?:string;id?:string;triggerType:string;priority:string};

    if (action === 'create' && content) {
      const intentionId = generateId();
      await db.execute(`INSERT INTO intentions (id, content, trigger_type, trigger_data, priority, status, created_at, updated_at) VALUES (?, ?, ?, '{}', ?, 'active', datetime('now'), datetime('now'))`, [intentionId, content, triggerType, priority]);
      return jsonResponse({ success: true, id: intentionId, action: 'created' });
    }
    if (action === 'list') {
      const rows = await db.query<{id:string;content:string;priority:string;status:string;created_at:string}>(`SELECT * FROM intentions WHERE status = 'active' ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END, created_at DESC`);
      return jsonResponse({ total: rows.length, intentions: rows });
    }
    if ((action === 'complete' || action === 'cancel') && id) {
      const status = action === 'complete' ? 'fulfilled' : 'cancelled';
      await db.execute(`UPDATE intentions SET status = ?, fulfilled_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`, [status, id]);
      return jsonResponse({ success: true, id, action });
    }
    return errorResponse('Invalid action or missing parameters');
  });

  // ==========================================================================
  // TOOL 19: PROMOTE_MEMORY
  // ==========================================================================
  registerTool('promote_memory', 'Promote memory (increase retention)', {
    id: z.string().describe('Memory ID'),
    boost: z.number().min(0.1).max(0.5).optional().default(0.2),
  }, async (args) => {
    const { id, boost } = args as {id:string;boost:number};
    await db.execute(`UPDATE knowledge_nodes SET retention_strength = MIN(1.0, retention_strength + ?), stability_factor = stability_factor * 1.5, updated_at = datetime('now') WHERE id = ?`, [boost, id]);
    return jsonResponse({ success: true, id, action: 'promoted', boost });
  });

  // ==========================================================================
  // TOOL 20: DEMOTE_MEMORY
  // ==========================================================================
  registerTool('demote_memory', 'Demote memory (decrease retention)', {
    id: z.string().describe('Memory ID'),
    penalty: z.number().min(0.1).max(0.5).optional().default(0.2),
  }, async (args) => {
    const { id, penalty } = args as {id:string;penalty:number};
    await db.execute(`UPDATE knowledge_nodes SET retention_strength = MAX(0.1, retention_strength - ?), stability_factor = stability_factor * 0.8, updated_at = datetime('now') WHERE id = ?`, [penalty, id]);
    return jsonResponse({ success: true, id, action: 'demoted', penalty });
  });

  // ==========================================================================
  // HTTP HANDLERS
  // ==========================================================================

  async function handleWebRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
    try {
      const body = await request.json();
      if (!body.method || body.jsonrpc !== '2.0') return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id ?? null, error: { code: -32600, message: 'Invalid Request' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      const result = await handleMcpRequest(body);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      log('Request error:', error);
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  async function handleNodeRequest(req: import('http').IncomingMessage, res: import('http').ServerResponse): Promise<void> {
    if (req.method !== 'POST') { res.writeHead(405, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Method not allowed' })); return; }
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const result = await handleMcpRequest(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      log('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } }));
    }
  }

  async function handleMcpRequest(body: { jsonrpc: string; id?: string | number; method: string; params?: Record<string, unknown> }): Promise<unknown> {
    const { id, method, params } = body;

    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name, version }, capabilities: { tools: { listChanged: false } } } };
    }

    if (method === 'tools/list') {
      const tools = Array.from(toolHandlers.keys()).map(name => ({ name, description: `Vestige ${name} tool` }));
      return { jsonrpc: '2.0', id, result: { tools } };
    }

    if (method === 'tools/call') {
      const toolName = (params?.name as string) ?? '';
      const toolArgs = (params?.arguments as Record<string, unknown>) ?? {};
      const handler = toolHandlers.get(toolName);
      if (!handler) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${toolName}` } };
      try {
        const result = await handler(toolArgs);
        return { jsonrpc: '2.0', id, result };
      } catch (error) {
        return { jsonrpc: '2.0', id, error: { code: -32603, message: error instanceof Error ? error.message : 'Tool execution failed' } };
      }
    }

    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }

  return { server, handleWebRequest, handleNodeRequest, close: () => db.close() };
}
