/**
 * Turso Database Adapter
 *
 * Implements DatabaseAdapter for Turso (libSQL) - a distributed SQLite database.
 *
 * Features:
 * - Full async support for edge/serverless environments
 * - Transaction support with automatic rollback
 * - Batch operations for efficiency
 * - Connection health checking
 * - Automatic retry with exponential backoff
 *
 * Usage:
 * ```typescript
 * import { TursoAdapter } from '@vestige/core/adapters';
 *
 * const db = new TursoAdapter({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN,
 * });
 *
 * await db.initialize(); // Creates schema if needed
 * ```
 */

import type {
  DatabaseAdapter,
  QueryResult,
  TransactionScope,
} from './database-adapter.ts';
import { getSchemaStatements } from './database-adapter.ts';

// ============================================================================
// TYPES
// ============================================================================

export interface TursoConfig {
  /** Turso database URL (e.g., libsql://your-db-name.turso.io) */
  url: string;

  /** Turso auth token */
  authToken?: string;

  /** Enable sync with local replica (optional) */
  syncUrl?: string;

  /** Sync interval in milliseconds (default: 60000) */
  syncInterval?: number;

  /** Connection timeout in milliseconds (default: 10000) */
  timeout?: number;

  /** Max retry attempts for failed operations (default: 3) */
  maxRetries?: number;

  /** Enable debug logging (default: false) */
  debug?: boolean;
}

// libSQL client types (subset of @libsql/client)
interface LibsqlClient {
  execute(stmt: { sql: string; args?: unknown[] }): Promise<LibsqlResult>;
  batch(stmts: Array<{ sql: string; args?: unknown[] }>, mode?: string): Promise<LibsqlResult[]>;
  transaction(mode?: 'write' | 'read'): Promise<LibsqlTransaction>;
  sync?(): Promise<void>;
  close(): void;
}

interface LibsqlTransaction {
  execute(stmt: { sql: string; args?: unknown[] }): Promise<LibsqlResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): void;
}

interface LibsqlResult {
  rows: Array<Record<string, unknown>>;
  rowsAffected: number;
  lastInsertRowid?: bigint;
  columns?: string[];
}

// ============================================================================
// TURSO ADAPTER
// ============================================================================

export class TursoAdapter implements DatabaseAdapter {
  readonly type = 'turso' as const;

  private client: LibsqlClient | null = null;
  private config: Required<TursoConfig>;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor(config: TursoConfig) {
    this.config = {
      url: config.url,
      authToken: config.authToken ?? '',
      syncUrl: config.syncUrl ?? '',
      syncInterval: config.syncInterval ?? 60000,
      timeout: config.timeout ?? 10000,
      maxRetries: config.maxRetries ?? 3,
      debug: config.debug ?? false,
    };
  }

  /**
   * Initialize the adapter and create schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.connect();
    await this.createSchema();
    this.initialized = true;

    // Start sync timer if using embedded replica
    if (this.config.syncUrl && this.client?.sync) {
      this.syncTimer = setInterval(async () => {
        try {
          await this.client?.sync?.();
          this.log('Synced with remote database');
        } catch (error) {
          this.log('Sync failed:', error);
        }
      }, this.config.syncInterval);
    }
  }

  /**
   * Connect to Turso database
   */
  private async connect(): Promise<void> {
    // Dynamic import to avoid bundling issues
    const { createClient } = await import('@libsql/client');

    const clientConfig: Record<string, unknown> = {
      url: this.config.url,
    };

    if (this.config.authToken) {
      clientConfig.authToken = this.config.authToken;
    }

    if (this.config.syncUrl) {
      clientConfig.syncUrl = this.config.syncUrl;
      clientConfig.syncInterval = this.config.syncInterval;
    }

    this.client = createClient(clientConfig) as LibsqlClient;
    this.log('Connected to Turso database');
  }

  /**
   * Create database schema
   */
  private async createSchema(): Promise<void> {
    const statements = getSchemaStatements();

    // Execute schema statements in batches
    // (Turso has limits on batch size)
    const batchSize = 10;
    for (let i = 0; i < statements.length; i += batchSize) {
      const batch = statements.slice(i, i + batchSize);
      await this.batch(batch.map(sql => ({ sql })));
    }

    this.log('Schema created/verified');
  }

  // ============================================================================
  // DATABASE OPERATIONS
  // ============================================================================

  async execute<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    this.ensureConnected();

    return this.withRetry(async () => {
      const result = await this.client!.execute({
        sql,
        args: params ?? [],
      });

      return {
        rows: result.rows as T[],
        rowsAffected: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid,
      };
    });
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
    this.ensureConnected();

    return this.withRetry(async () => {
      const stmts = statements.map(s => ({
        sql: s.sql,
        args: s.params ?? [],
      }));

      const results = await this.client!.batch(stmts, 'write');

      return results.map(r => ({
        rows: r.rows,
        rowsAffected: r.rowsAffected,
        lastInsertRowid: r.lastInsertRowid,
      }));
    });
  }

  async transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T> {
    this.ensureConnected();

    const tx = await this.client!.transaction('write');

    const scope: TransactionScope = {
      execute: async <R = Record<string, unknown>>(
        sql: string,
        params?: unknown[]
      ): Promise<QueryResult<R>> => {
        const result = await tx.execute({ sql, args: params ?? [] });
        return {
          rows: result.rows as R[],
          rowsAffected: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
      commit: () => tx.commit(),
      rollback: () => tx.rollback(),
    };

    try {
      const result = await fn(scope);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      tx.close();
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client) return false;
      await this.client.execute({ sql: 'SELECT 1' });
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    this.initialized = false;
    this.log('Connection closed');
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private ensureConnected(): void {
    if (!this.client) {
      throw new Error('TursoAdapter not initialized. Call initialize() first.');
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.log(`Attempt ${attempt} failed:`, lastError.message);

        if (attempt < this.config.maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms, ...
          const delay = 100 * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[TursoAdapter]', ...args);
    }
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a Turso adapter from environment variables
 *
 * Expected env vars:
 * - TURSO_DATABASE_URL or TURSO_URL
 * - TURSO_AUTH_TOKEN
 * - TURSO_SYNC_URL (optional, for embedded replica)
 */
export function createTursoAdapter(config?: Partial<TursoConfig>): TursoAdapter {
  const url = config?.url
    ?? process.env['TURSO_DATABASE_URL']
    ?? process.env['TURSO_URL'];

  if (!url) {
    throw new Error(
      'Turso URL not provided. Set TURSO_DATABASE_URL environment variable or pass url in config.'
    );
  }

  const authToken = config?.authToken ?? process.env['TURSO_AUTH_TOKEN'];
  const syncUrl = config?.syncUrl ?? process.env['TURSO_SYNC_URL'];

  const tursoConfig: TursoConfig = {
    url,
    ...config,
  };

  if (authToken) tursoConfig.authToken = authToken;
  if (syncUrl) tursoConfig.syncUrl = syncUrl;

  return new TursoAdapter(tursoConfig);
}
