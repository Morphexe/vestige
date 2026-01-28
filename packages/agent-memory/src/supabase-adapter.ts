/**
 * Supabase Adapter
 *
 * Implements DatabaseAdapter interface for Supabase PostgreSQL with RLS multi-tenancy.
 * Converts SQLite-style queries to PostgreSQL syntax automatically.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { convertSql } from './sql-converter.ts';
import { getSchemaStatements } from './schema.ts';

// =============================================================================
// DATABASE ADAPTER TYPES
// =============================================================================

/**
 * Query result from database operations
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint | undefined;
}

/**
 * Transaction scope for executing queries within a transaction
 */
export interface TransactionScope {
  execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Database adapter interface
 */
export interface DatabaseAdapter {
  execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<QueryResult[]>;
  transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T>;
  isHealthy(): Promise<boolean>;
  close(): Promise<void>;
  readonly type: 'turso' | 'sqlite' | 'postgres' | 'supabase';
}

// =============================================================================
// TYPES
// =============================================================================

export interface SupabaseConfig {
  /**
   * Supabase project URL (e.g., https://xxx.supabase.co)
   */
  url: string;

  /**
   * Supabase service role key (for server-side operations with RLS bypass)
   * or anon key (for client-side with RLS enforcement)
   */
  serviceKey: string;

  /**
   * Optional: Use service role to bypass RLS (for admin operations)
   * Default: false (RLS is enforced)
   */
  bypassRLS?: boolean;

  /**
   * Optional: Enable debug logging
   */
  debug?: boolean;

  /**
   * Optional: Custom schema name (default: 'public')
   */
  schema?: string;
}

// =============================================================================
// SUPABASE ADAPTER
// =============================================================================

export class SupabaseAdapter implements DatabaseAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: SupabaseClient<any, any, any>;
  private config: SupabaseConfig;
  private closed = false;

  get type(): 'supabase' {
    return 'supabase';
  }

  constructor(config: SupabaseConfig) {
    this.config = config;
    this.client = createClient(config.url, config.serviceKey, {
      db: {
        schema: config.schema ?? 'public',
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  async execute<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    if (this.closed) {
      throw new Error('Connection closed');
    }

    const converted = convertSql(sql, params ?? []);

    if (this.config.debug) {
      console.log('[SupabaseAdapter] SQL:', converted.sql);
      console.log('[SupabaseAdapter] Params:', converted.params);
    }

    return this.executeRaw<T>(converted.sql, converted.params);
  }

  /**
   * Execute raw PostgreSQL SQL (after conversion)
   * Protected to allow subclassing for testing
   */
  protected async executeRaw<T>(
    sql: string,
    params: unknown[]
  ): Promise<QueryResult<T>> {
    const { data, error } = await this.client.rpc('vestige_execute', {
      query: sql,
      params: JSON.stringify(params),
    });

    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }

    // Parse the result
    const rows = Array.isArray(data) ? data : (data ? [data] : []);

    return {
      rows: rows as T[],
      rowsAffected: rows.length,
    };
  }

  /**
   * Execute a query and return all rows
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.execute<T>(sql, params);
    return result.rows;
  }

  /**
   * Execute a query and return a single row (or null)
   */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  /**
   * Execute multiple statements in a batch
   */
  async batch(
    statements: Array<{ sql: string; params?: unknown[] }>
  ): Promise<QueryResult[]> {
    const results: QueryResult[] = [];

    for (const stmt of statements) {
      const result = await this.execute(stmt.sql, stmt.params);
      results.push(result);
    }

    return results;
  }

  /**
   * Execute operations within a transaction
   *
   * Note: Supabase doesn't support true multi-statement transactions via RPC.
   * This implementation uses a savepoint pattern for basic rollback support.
   */
  async transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T> {
    if (this.closed) {
      throw new Error('Connection closed');
    }

    const savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Create savepoint
    await this.executeRaw('SAVEPOINT ' + savepointName, []);

    const scope: TransactionScope = {
      execute: async (sql, params) => {
        const converted = convertSql(sql, params ?? []);
        return this.executeRaw(converted.sql, converted.params);
      },
      commit: async () => {
        await this.executeRaw('RELEASE SAVEPOINT ' + savepointName, []);
      },
      rollback: async () => {
        await this.executeRaw('ROLLBACK TO SAVEPOINT ' + savepointName, []);
      },
    };

    try {
      const result = await fn(scope);
      await scope.commit();
      return result;
    } catch (error) {
      await scope.rollback();
      throw error;
    }
  }

  /**
   * Check if the database is available
   */
  async isHealthy(): Promise<boolean> {
    if (this.closed) {
      return false;
    }

    try {
      const { error } = await this.client.from('vestige_metadata').select('key').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the database schema
   */
  async initialize(): Promise<void> {
    if (this.config.debug) {
      console.log('[SupabaseAdapter] Initializing schema...');
    }

    const statements = getSchemaStatements();

    for (const statement of statements) {
      try {
        await this.executeRaw(statement, []);
      } catch (error) {
        // Ignore "already exists" errors
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already exists')) {
          throw error;
        }
      }
    }

    if (this.config.debug) {
      console.log('[SupabaseAdapter] Schema initialized');
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    this.closed = true;
    // Supabase client doesn't have an explicit close method
    // Mark as closed to prevent further operations
  }

  /**
   * Get the underlying Supabase client for direct access
   * Use with caution - bypasses SQL conversion
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(): SupabaseClient<any, any, any> {
    return this.client;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a SupabaseAdapter with configuration from environment variables
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Service role key
 * - SUPABASE_ANON_KEY: Anon key (alternative to service key)
 */
export function createSupabaseAdapter(config?: Partial<SupabaseConfig>): SupabaseAdapter {
  const url = config?.url ?? process.env['SUPABASE_URL'];
  const serviceKey = config?.serviceKey
    ?? process.env['SUPABASE_SERVICE_KEY']
    ?? process.env['SUPABASE_ANON_KEY'];

  if (!url) {
    throw new Error(
      'Supabase URL not provided. Set SUPABASE_URL environment variable or pass url in config.'
    );
  }

  if (!serviceKey) {
    throw new Error(
      'Supabase key not provided. Set SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY environment variable or pass serviceKey in config.'
    );
  }

  return new SupabaseAdapter({
    url,
    serviceKey,
    debug: config?.debug ?? process.env['DEBUG'] === 'true',
    schema: config?.schema,
    bypassRLS: config?.bypassRLS,
  });
}
