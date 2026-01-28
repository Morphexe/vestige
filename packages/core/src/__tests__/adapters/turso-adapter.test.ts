/**
 * Tests for Turso Adapter
 *
 * Tests the database adapter interface and schema generation.
 * Note: Full Turso tests require a real Turso database connection.
 */

import { describe, it, expect } from 'bun:test';
import {
  getSchemaStatements,
  VESTIGE_SCHEMA,
  type DatabaseAdapter,
  type QueryResult,
  type TransactionScope,
} from '../../adapters/database-adapter.js';

describe('Database Adapter Interface', () => {
  // ==========================================================================
  // SCHEMA TESTS
  // ==========================================================================

  describe('Schema Generation', () => {
    it('should have non-empty schema', () => {
      expect(VESTIGE_SCHEMA.length).toBeGreaterThan(100);
    });

    it('should generate individual statements', () => {
      const statements = getSchemaStatements();
      expect(statements.length).toBeGreaterThan(5);
    });

    it('should have CREATE TABLE statements', () => {
      const statements = getSchemaStatements();
      const createTables = statements.filter(s =>
        s.toUpperCase().includes('CREATE TABLE')
      );
      expect(createTables.length).toBeGreaterThan(3);
    });

    it('should have CREATE INDEX statements', () => {
      const statements = getSchemaStatements();
      const createIndexes = statements.filter(s =>
        s.toUpperCase().includes('CREATE INDEX')
      );
      expect(createIndexes.length).toBeGreaterThan(5);
    });

    it('should have FTS table', () => {
      const statements = getSchemaStatements();
      const ftsStatements = statements.filter(s =>
        s.toUpperCase().includes('FTS5')
      );
      expect(ftsStatements.length).toBeGreaterThan(0);
    });

    it('should have trigger statements', () => {
      const statements = getSchemaStatements();
      const triggers = statements.filter(s =>
        s.toUpperCase().includes('CREATE TRIGGER')
      );
      expect(triggers.length).toBeGreaterThan(0);
    });

    it('should include knowledge_nodes table', () => {
      expect(VESTIGE_SCHEMA).toContain('knowledge_nodes');
    });

    it('should include people table', () => {
      expect(VESTIGE_SCHEMA).toContain('people');
    });

    it('should include graph_edges table', () => {
      expect(VESTIGE_SCHEMA).toContain('graph_edges');
    });

    it('should include intentions table', () => {
      expect(VESTIGE_SCHEMA).toContain('intentions');
    });

    it('should include FSRS fields', () => {
      expect(VESTIGE_SCHEMA).toContain('stability');
      expect(VESTIGE_SCHEMA).toContain('difficulty');
      expect(VESTIGE_SCHEMA).toContain('reps');
      expect(VESTIGE_SCHEMA).toContain('lapses');
    });

    it('should include dual-strength fields', () => {
      expect(VESTIGE_SCHEMA).toContain('storage_strength');
      expect(VESTIGE_SCHEMA).toContain('retrieval_strength');
    });
  });

  // ==========================================================================
  // MOCK ADAPTER TESTS
  // ==========================================================================

  describe('Mock Adapter Implementation', () => {
    // Create a simple in-memory mock adapter for testing the interface
    class MockAdapter implements DatabaseAdapter {
      readonly type = 'sqlite' as const;
      private data: Map<string, Record<string, unknown>[]> = new Map();
      private closed = false;

      async execute<T = Record<string, unknown>>(
        sql: string,
        _params?: unknown[]
      ): Promise<QueryResult<T>> {
        if (this.closed) throw new Error('Connection closed');

        // Simple mock - just track that execute was called
        return {
          rows: [] as T[],
          rowsAffected: 1,
        };
      }

      async query<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
      ): Promise<T[]> {
        const result = await this.execute<T>(sql, params);
        return result.rows;
      }

      async queryOne<T = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
      ): Promise<T | null> {
        const rows = await this.query<T>(sql, params);
        return rows[0] ?? null;
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

        try {
          return await fn(scope);
        } catch (error) {
          await scope.rollback();
          throw error;
        }
      }

      async isHealthy(): Promise<boolean> {
        return !this.closed;
      }

      async close(): Promise<void> {
        this.closed = true;
      }
    }

    it('should implement execute', async () => {
      const adapter = new MockAdapter();
      const result = await adapter.execute('SELECT 1');
      expect(result.rowsAffected).toBeDefined();
    });

    it('should implement query', async () => {
      const adapter = new MockAdapter();
      const rows = await adapter.query('SELECT 1');
      expect(Array.isArray(rows)).toBe(true);
    });

    it('should implement queryOne', async () => {
      const adapter = new MockAdapter();
      const row = await adapter.queryOne('SELECT 1');
      expect(row).toBeNull(); // Mock returns empty
    });

    it('should implement batch', async () => {
      const adapter = new MockAdapter();
      const results = await adapter.batch([
        { sql: 'INSERT INTO test VALUES (1)' },
        { sql: 'INSERT INTO test VALUES (2)' },
      ]);
      expect(results.length).toBe(2);
    });

    it('should implement transaction', async () => {
      const adapter = new MockAdapter();
      const result = await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO test VALUES (1)');
        return 'done';
      });
      expect(result).toBe('done');
    });

    it('should implement isHealthy', async () => {
      const adapter = new MockAdapter();
      expect(await adapter.isHealthy()).toBe(true);
    });

    it('should implement close', async () => {
      const adapter = new MockAdapter();
      await adapter.close();
      expect(await adapter.isHealthy()).toBe(false);
    });

    it('should have type property', () => {
      const adapter = new MockAdapter();
      expect(adapter.type).toBe('sqlite');
    });
  });
});

describe('Turso Adapter', () => {
  // ==========================================================================
  // IMPORT TESTS
  // ==========================================================================

  describe('Module Exports', () => {
    it('should export TursoAdapter class', async () => {
      const { TursoAdapter } = await import('../../adapters/turso-adapter.js');
      expect(TursoAdapter).toBeDefined();
    });

    it('should export createTursoAdapter factory', async () => {
      const { createTursoAdapter } = await import('../../adapters/turso-adapter.js');
      expect(typeof createTursoAdapter).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should require URL', async () => {
      const { createTursoAdapter } = await import('../../adapters/turso-adapter.js');

      // Clear env vars temporarily
      const originalUrl = process.env['TURSO_DATABASE_URL'];
      delete process.env['TURSO_DATABASE_URL'];
      delete process.env['TURSO_URL'];

      expect(() => createTursoAdapter()).toThrow('Turso URL not provided');

      // Restore
      if (originalUrl) {
        process.env['TURSO_DATABASE_URL'] = originalUrl;
      }
    });

    it('should accept config object', async () => {
      const { TursoAdapter } = await import('../../adapters/turso-adapter.js');

      const adapter = new TursoAdapter({
        url: 'libsql://test.turso.io',
        authToken: 'test-token',
        debug: false,
      });

      expect(adapter.type).toBe('turso');
    });
  });
});
