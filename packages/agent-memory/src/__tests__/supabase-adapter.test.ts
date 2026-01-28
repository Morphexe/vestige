/**
 * Tests for Supabase Adapter
 *
 * Tests the DatabaseAdapter interface implementation and configuration.
 * Note: Full Supabase tests require a real Supabase connection.
 */

import { describe, it, expect } from 'bun:test';
import type { DatabaseAdapter, QueryResult, TransactionScope } from '../supabase-adapter.js';

describe('SupabaseAdapter Interface', () => {
  // ==========================================================================
  // MOCK ADAPTER FOR INTERFACE TESTING
  // ==========================================================================

  // Mock adapter to verify interface compliance without real Supabase connection
  class MockSupabaseAdapter implements DatabaseAdapter {
    readonly type = 'supabase' as const;
    private closed = false;

    async execute<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      if (this.closed) throw new Error('Connection closed');
      return { rows: [] as T[], rowsAffected: 0 };
    }

    async query<T = Record<string, unknown>>(
      sql: string,
      params?: unknown[]
    ): Promise<T[]> {
      return (await this.execute<T>(sql, params)).rows;
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
      return Promise.all(statements.map(s => this.execute(s.sql, s.params)));
    }

    async transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T> {
      const scope: TransactionScope = {
        execute: (sql, params) => this.execute(sql, params),
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

  // ==========================================================================
  // INTERFACE COMPLIANCE TESTS
  // ==========================================================================

  describe('Interface Compliance', () => {
    it('should have type = supabase', () => {
      const adapter = new MockSupabaseAdapter();
      expect(adapter.type).toBe('supabase');
    });

    it('should implement execute', async () => {
      const adapter = new MockSupabaseAdapter();
      const result = await adapter.execute('SELECT 1');
      expect(result.rowsAffected).toBeDefined();
      expect(result.rows).toBeDefined();
      expect(Array.isArray(result.rows)).toBe(true);
    });

    it('should implement query', async () => {
      const adapter = new MockSupabaseAdapter();
      const rows = await adapter.query('SELECT 1');
      expect(Array.isArray(rows)).toBe(true);
    });

    it('should implement queryOne', async () => {
      const adapter = new MockSupabaseAdapter();
      const row = await adapter.queryOne('SELECT 1');
      expect(row).toBeNull(); // Mock returns empty
    });

    it('should implement batch', async () => {
      const adapter = new MockSupabaseAdapter();
      const results = await adapter.batch([
        { sql: 'INSERT INTO t VALUES (1)' },
        { sql: 'INSERT INTO t VALUES (2)' },
      ]);
      expect(results.length).toBe(2);
      expect(results[0].rowsAffected).toBeDefined();
    });

    it('should implement transaction', async () => {
      const adapter = new MockSupabaseAdapter();
      const result = await adapter.transaction(async (tx) => {
        await tx.execute('INSERT INTO t VALUES (1)');
        return 'done';
      });
      expect(result).toBe('done');
    });

    it('should implement isHealthy', async () => {
      const adapter = new MockSupabaseAdapter();
      expect(await adapter.isHealthy()).toBe(true);
      await adapter.close();
      expect(await adapter.isHealthy()).toBe(false);
    });

    it('should implement close', async () => {
      const adapter = new MockSupabaseAdapter();
      await adapter.close();
      await expect(adapter.execute('SELECT 1')).rejects.toThrow('Connection closed');
    });
  });

  // ==========================================================================
  // TRANSACTION BEHAVIOR
  // ==========================================================================

  describe('Transaction Behavior', () => {
    it('should rollback on error', async () => {
      const adapter = new MockSupabaseAdapter();
      let rolledBack = false;

      // Create a custom mock that tracks rollback
      class TrackingAdapter extends MockSupabaseAdapter {
        async transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T> {
          const scope: TransactionScope = {
            execute: (sql, params) => this.execute(sql, params),
            commit: async () => {},
            rollback: async () => { rolledBack = true; },
          };

          try {
            return await fn(scope);
          } catch (error) {
            await scope.rollback();
            throw error;
          }
        }
      }

      const trackingAdapter = new TrackingAdapter();

      await expect(
        trackingAdapter.transaction(async (tx) => {
          await tx.execute('INSERT INTO t VALUES (1)');
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(rolledBack).toBe(true);
    });

    it('should provide commit and rollback on TransactionScope', async () => {
      const adapter = new MockSupabaseAdapter();

      await adapter.transaction(async (tx) => {
        expect(typeof tx.execute).toBe('function');
        expect(typeof tx.commit).toBe('function');
        expect(typeof tx.rollback).toBe('function');
        return null;
      });
    });
  });
});

describe('SupabaseAdapter Configuration', () => {
  // ==========================================================================
  // MODULE EXPORTS
  // ==========================================================================

  describe('Module Exports', () => {
    it('should export SupabaseAdapter class', async () => {
      const { SupabaseAdapter } = await import('../supabase-adapter.js');
      expect(SupabaseAdapter).toBeDefined();
    });

    it('should export createSupabaseAdapter factory', async () => {
      const { createSupabaseAdapter } = await import('../supabase-adapter.js');
      expect(typeof createSupabaseAdapter).toBe('function');
    });

    it('should export SupabaseConfig type', async () => {
      // Type-only export, just verify import works
      const module = await import('../supabase-adapter.js');
      expect(module).toBeDefined();
    });
  });

  // ==========================================================================
  // CONFIGURATION VALIDATION
  // ==========================================================================

  describe('Configuration Validation', () => {
    it('should require URL in config', async () => {
      const { createSupabaseAdapter } = await import('../supabase-adapter.js');

      // Clear env vars temporarily
      const originalUrl = process.env['SUPABASE_URL'];
      const originalKey = process.env['SUPABASE_SERVICE_KEY'];
      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_SERVICE_KEY'];

      expect(() => createSupabaseAdapter({})).toThrow();

      // Restore
      if (originalUrl) process.env['SUPABASE_URL'] = originalUrl;
      if (originalKey) process.env['SUPABASE_SERVICE_KEY'] = originalKey;
    });

    it('should require service key in config', async () => {
      const { createSupabaseAdapter } = await import('../supabase-adapter.js');

      const originalKey = process.env['SUPABASE_SERVICE_KEY'];
      delete process.env['SUPABASE_SERVICE_KEY'];

      expect(() => createSupabaseAdapter({ url: 'https://test.supabase.co' })).toThrow();

      if (originalKey) process.env['SUPABASE_SERVICE_KEY'] = originalKey;
    });

    it('should accept config object with url and serviceKey', async () => {
      const { SupabaseAdapter } = await import('../supabase-adapter.js');

      const adapter = new SupabaseAdapter({
        url: 'https://test.supabase.co',
        serviceKey: 'test-service-key',
      });

      expect(adapter.type).toBe('supabase');
    });

    it('should read from environment variables when config not provided', async () => {
      const { createSupabaseAdapter } = await import('../supabase-adapter.js');

      // Set env vars
      process.env['SUPABASE_URL'] = 'https://env-test.supabase.co';
      process.env['SUPABASE_SERVICE_KEY'] = 'env-test-key';

      const adapter = createSupabaseAdapter();
      expect(adapter.type).toBe('supabase');

      // Cleanup
      delete process.env['SUPABASE_URL'];
      delete process.env['SUPABASE_SERVICE_KEY'];
    });
  });

  // ==========================================================================
  // TYPE PROPERTY
  // ==========================================================================

  describe('Type Property', () => {
    it('should have readonly type property', async () => {
      const { SupabaseAdapter } = await import('../supabase-adapter.js');

      const adapter = new SupabaseAdapter({
        url: 'https://test.supabase.co',
        serviceKey: 'test-key',
      });

      expect(adapter.type).toBe('supabase');

      // Type is a getter, so assignment throws
      expect(() => {
        // @ts-expect-error - type is readonly
        adapter.type = 'postgres';
      }).toThrow();
    });
  });
});

describe('SupabaseAdapter SQL Conversion', () => {
  // ==========================================================================
  // SQL CONVERSION INTEGRATION
  // ==========================================================================

  describe('SQL Conversion Integration', () => {
    it('should convert SQLite syntax before execution', async () => {
      // This test verifies the adapter uses the SQL converter
      const { SupabaseAdapter } = await import('../supabase-adapter.js');

      let capturedSql = '';

      // Create adapter with mock client
      class TestableAdapter extends SupabaseAdapter {
        protected async executeRaw<T>(sql: string, _params: unknown[]): Promise<{ rows: T[]; rowsAffected: number }> {
          capturedSql = sql;
          return { rows: [], rowsAffected: 0 };
        }
      }

      const adapter = new TestableAdapter({
        url: 'https://test.supabase.co',
        serviceKey: 'test-key',
      });

      await adapter.execute(
        "SELECT * FROM knowledge_nodes WHERE created_at > datetime('now', '-7 days')",
        []
      );

      expect(capturedSql).toContain('vestige_knowledge');
      expect(capturedSql).toContain('CURRENT_TIMESTAMP');
      expect(capturedSql).not.toContain('knowledge_nodes');
      expect(capturedSql).not.toContain("datetime('now')");
    });
  });
});
