/**
 * Tests for HTTP Server
 *
 * Tests the Vestige HTTP server implementation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { DatabaseAdapter, QueryResult, TransactionScope } from '../../adapters/database-adapter.js';
import { createVestigeHttpServer, type VestigeHttpServer } from '../../adapters/http-server.js';

// ============================================================================
// MOCK DATABASE ADAPTER
// ============================================================================

class MockDatabaseAdapter implements DatabaseAdapter {
  readonly type = 'sqlite' as const;
  private memories: Map<string, Record<string, unknown>> = new Map();
  private healthy = true;

  async execute<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    // Simple mock implementation
    const upperSql = sql.toUpperCase();

    if (upperSql.includes('INSERT INTO KNOWLEDGE_NODES')) {
      const id = params?.[0] as string;
      this.memories.set(id, {
        id,
        content: params?.[1] as string,
        summary: params?.[2],
        tags: params?.[3] as string,
        stability: params?.[9] as number,
        difficulty: params?.[10] as number,
        state: 'New',
        created_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        retention_strength: 1.0,
        access_count: 0,
      });
      return { rows: [] as T[], rowsAffected: 1 };
    }

    if (upperSql.includes('UPDATE KNOWLEDGE_NODES')) {
      return { rows: [] as T[], rowsAffected: 1 };
    }

    if (upperSql.includes('DELETE FROM KNOWLEDGE_NODES')) {
      const id = params?.[0] as string;
      const existed = this.memories.has(id);
      this.memories.delete(id);
      return { rows: [] as T[], rowsAffected: existed ? 1 : 0 };
    }

    return { rows: [] as T[], rowsAffected: 0 };
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const upperSql = sql.toUpperCase();

    // Return all memories for FTS or search queries
    if (upperSql.includes('KNOWLEDGE_FTS') || upperSql.includes('LIKE')) {
      return Array.from(this.memories.values()) as T[];
    }

    // Return empty for due queries (no next_review set)
    if (upperSql.includes('NEXT_REVIEW')) {
      return [] as T[];
    }

    // Stats query
    if (upperSql.includes('COUNT(*)')) {
      return [{
        total: this.memories.size,
        active: this.memories.size,
        dormant: 0,
        silent: 0,
        due: 0,
        avg_stability: 1.0,
        avg_retention: 1.0,
      }] as T[];
    }

    // State distribution
    if (upperSql.includes('GROUP BY STATE')) {
      return [{ state: 'New', count: this.memories.size }] as T[];
    }

    return [] as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null> {
    const upperSql = sql.toUpperCase();

    // Get specific memory by ID
    if (upperSql.includes('WHERE ID = ?')) {
      const id = params?.[0] as string;
      const memory = this.memories.get(id);
      return (memory as T) ?? null;
    }

    // Stats query
    if (upperSql.includes('COUNT(*)')) {
      const rows = await this.query<T>(sql, params);
      return rows[0] ?? null;
    }

    return null;
  }

  async batch(
    statements: Array<{ sql: string; params?: unknown[] }>
  ): Promise<QueryResult[]> {
    const results: QueryResult[] = [];
    for (const stmt of statements) {
      results.push(await this.execute(stmt.sql, stmt.params));
    }
    return results;
  }

  async transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T> {
    const scope: TransactionScope = {
      execute: async (sql, params) => this.execute(sql, params),
      commit: async () => {},
      rollback: async () => {},
    };
    return fn(scope);
  }

  async isHealthy(): Promise<boolean> {
    return this.healthy;
  }

  async close(): Promise<void> {
    this.healthy = false;
  }

  // Test helpers
  getMemoryCount(): number {
    return this.memories.size;
  }

  clear(): void {
    this.memories.clear();
  }
}

// ============================================================================
// TESTS
// ============================================================================

describe('HTTP Server', () => {
  let db: MockDatabaseAdapter;
  let server: VestigeHttpServer;

  beforeEach(async () => {
    db = new MockDatabaseAdapter();
    server = await createVestigeHttpServer({
      database: db,
      name: 'test-vestige',
      version: '1.0.0',
      debug: false,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  // ==========================================================================
  // SERVER CREATION
  // ==========================================================================

  describe('Server Creation', () => {
    it('should create server with config', () => {
      expect(server).toBeDefined();
      expect(server.server).toBeDefined();
      expect(server.handleWebRequest).toBeDefined();
      expect(server.handleNodeRequest).toBeDefined();
      expect(server.close).toBeDefined();
    });

    it('should have MCP server instance', () => {
      expect(server.server).toBeDefined();
    });
  });

  // ==========================================================================
  // MCP PROTOCOL
  // ==========================================================================

  describe('MCP Protocol', () => {
    it('should handle initialize request', async () => {
      const request = createMcpRequest('initialize', {});
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { serverInfo?: { name: string } } };

      expect(response.status).toBe(200);
      expect(result.result?.serverInfo?.name).toBe('test-vestige');
    });

    it('should handle tools/list request', async () => {
      const request = createMcpRequest('tools/list', {});
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { tools?: unknown[] } };

      expect(response.status).toBe(200);
      expect(result.result?.tools).toBeDefined();
      expect(Array.isArray(result.result?.tools)).toBe(true);
    });

    it('should reject non-POST requests', async () => {
      const request = new Request('http://localhost/mcp', { method: 'GET' });
      const response = await server.handleWebRequest(request);

      expect(response.status).toBe(405);
    });

    it('should handle invalid JSON-RPC', async () => {
      const request = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'request' }),
      });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { error?: { code: number } };

      expect(response.status).toBe(400);
      expect(result.error?.code).toBe(-32600);
    });
  });

  // ==========================================================================
  // INGEST TOOL
  // ==========================================================================

  describe('Ingest Tool', () => {
    it('should store a memory', async () => {
      const request = createToolRequest('ingest', {
        content: 'Test memory content',
        tags: ['test', 'memory'],
      });

      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      expect(response.status).toBe(200);

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.success).toBe(true);
      expect(toolResult.id).toBeDefined();
    });

    it('should require content', async () => {
      const request = createToolRequest('ingest', { tags: ['test'] });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { error?: unknown };

      // Zod validation should fail
      expect(result.error).toBeDefined();
    });

    it('should include FSRS data in response', async () => {
      const request = createToolRequest('ingest', {
        content: 'Memory with FSRS',
      });

      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.fsrs).toBeDefined();
      expect(toolResult.fsrs.stability).toBeDefined();
      expect(toolResult.fsrs.difficulty).toBeDefined();
    });
  });

  // ==========================================================================
  // RECALL TOOL
  // ==========================================================================

  describe('Recall Tool', () => {
    it('should search memories', async () => {
      // First ingest a memory
      await server.handleWebRequest(
        createToolRequest('ingest', { content: 'Searchable content' })
      );

      // Then search
      const request = createToolRequest('recall', {
        query: 'searchable',
        limit: 10,
      });

      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.query).toBe('searchable');
      expect(toolResult.results).toBeDefined();
    });

    it('should require query', async () => {
      const request = createToolRequest('recall', { limit: 10 });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { error?: unknown };

      expect(result.error).toBeDefined();
    });

    it('should respect limit parameter', async () => {
      const request = createToolRequest('recall', {
        query: 'test',
        limit: 5,
      });

      const response = await server.handleWebRequest(request);
      expect(response.status).toBe(200);
    });
  });

  // ==========================================================================
  // REVIEW TOOL
  // ==========================================================================

  describe('Review Tool', () => {
    it('should review a memory', async () => {
      // First ingest
      const ingestResponse = await server.handleWebRequest(
        createToolRequest('ingest', { content: 'Memory to review' })
      );
      const ingestResult = await ingestResponse.json() as { result?: { content?: Array<{ text: string }> } };
      const { id } = JSON.parse(ingestResult.result?.content?.[0]?.text ?? '{}');

      // Then review
      const request = createToolRequest('review', { id, grade: 3 });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.success).toBe(true);
      expect(toolResult.grade).toBe('Good');
      expect(toolResult.fsrs).toBeDefined();
      expect(toolResult.nextReview).toBeDefined();
    });

    it('should accept grades 1-4', async () => {
      const ingestResponse = await server.handleWebRequest(
        createToolRequest('ingest', { content: 'Memory for grades' })
      );
      const ingestResult = await ingestResponse.json() as { result?: { content?: Array<{ text: string }> } };
      const { id } = JSON.parse(ingestResult.result?.content?.[0]?.text ?? '{}');

      for (const grade of [1, 2, 3, 4]) {
        const request = createToolRequest('review', { id, grade });
        const response = await server.handleWebRequest(request);
        expect(response.status).toBe(200);
      }
    });

    it('should reject invalid grades', async () => {
      const request = createToolRequest('review', { id: 'test', grade: 5 });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { error?: unknown };

      expect(result.error).toBeDefined();
    });
  });

  // ==========================================================================
  // STATS TOOL
  // ==========================================================================

  describe('Stats Tool', () => {
    it('should return statistics', async () => {
      const request = createToolRequest('stats', {});
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.overview).toBeDefined();
      expect(toolResult.retention).toBeDefined();
      expect(toolResult.healthy).toBeDefined();
    });

    it('should include overview counts', async () => {
      const request = createToolRequest('stats', {});
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(typeof toolResult.overview.total).toBe('number');
    });
  });

  // ==========================================================================
  // DUE TOOL
  // ==========================================================================

  describe('Due Tool', () => {
    it('should return due memories', async () => {
      const request = createToolRequest('due', { limit: 10 });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.total).toBeDefined();
      expect(toolResult.memories).toBeDefined();
    });
  });

  // ==========================================================================
  // DELETE TOOL
  // ==========================================================================

  describe('Delete Tool', () => {
    it('should require confirmation', async () => {
      const request = createToolRequest('delete', { id: 'test-id' });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.warning).toBeDefined();
    });

    it('should delete with confirmation', async () => {
      // First ingest
      const ingestResponse = await server.handleWebRequest(
        createToolRequest('ingest', { content: 'To delete' })
      );
      const ingestResult = await ingestResponse.json() as { result?: { content?: Array<{ text: string }> } };
      const { id } = JSON.parse(ingestResult.result?.content?.[0]?.text ?? '{}');

      // Then delete
      const request = createToolRequest('delete', { id, confirm: true });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.success).toBe(true);
    });
  });

  // ==========================================================================
  // CONSOLIDATE TOOL
  // ==========================================================================

  describe('Consolidate Tool', () => {
    it('should run consolidation', async () => {
      const request = createToolRequest('consolidate', {});
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.success).toBe(true);
      expect(typeof toolResult.nodesProcessed).toBe('number');
    });

    it('should support dry run', async () => {
      const request = createToolRequest('consolidate', { dryRun: true });
      const response = await server.handleWebRequest(request);
      const result = await response.json() as { result?: { content?: Array<{ text: string }> } };

      const toolResult = JSON.parse(result.result?.content?.[0]?.text ?? '{}');
      expect(toolResult.dryRun).toBe(true);
    });
  });
});

// ============================================================================
// HELPERS
// ============================================================================

function createMcpRequest(method: string, params: unknown): Request {
  return new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });
}

function createToolRequest(name: string, args: unknown): Request {
  return createMcpRequest('tools/call', {
    name,
    arguments: args,
  });
}
