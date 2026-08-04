import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Adapter
 *
 * Implements DatabaseAdapter interface for Supabase PostgreSQL with RLS multi-tenancy.
 * Converts SQLite-style queries to PostgreSQL syntax automatically.
 */

/**
 * Query result from database operations
 */
interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    rowsAffected: number;
    lastInsertRowid?: number | bigint | undefined;
}
/**
 * Transaction scope for executing queries within a transaction
 */
interface TransactionScope {
    execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}
/**
 * Database adapter interface
 */
interface DatabaseAdapter {
    execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
    batch(statements: Array<{
        sql: string;
        params?: unknown[];
    }>): Promise<QueryResult[]>;
    transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T>;
    isHealthy(): Promise<boolean>;
    close(): Promise<void>;
    readonly type: 'turso' | 'sqlite' | 'postgres' | 'supabase';
}
interface SupabaseConfig {
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
declare class SupabaseAdapter implements DatabaseAdapter {
    private client;
    private config;
    private closed;
    get type(): 'supabase';
    constructor(config: SupabaseConfig);
    /**
     * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
     */
    execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    /**
     * Execute raw PostgreSQL SQL (after conversion)
     * Protected to allow subclassing for testing
     */
    protected executeRaw<T>(sql: string, params: unknown[]): Promise<QueryResult<T>>;
    /**
     * Execute a query and return all rows
     */
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /**
     * Execute a query and return a single row (or null)
     */
    queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
    /**
     * Execute multiple statements in a batch
     */
    batch(statements: Array<{
        sql: string;
        params?: unknown[];
    }>): Promise<QueryResult[]>;
    /**
     * Execute operations within a transaction
     *
     * Note: Supabase doesn't support true multi-statement transactions via RPC.
     * This implementation uses a savepoint pattern for basic rollback support.
     */
    transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T>;
    /**
     * Check if the database is available
     */
    isHealthy(): Promise<boolean>;
    /**
     * Initialize the database schema
     */
    initialize(): Promise<void>;
    /**
     * Close the database connection
     */
    close(): Promise<void>;
    /**
     * Get the underlying Supabase client for direct access
     * Use with caution - bypasses SQL conversion
     */
    getClient(): SupabaseClient<any, any, any>;
}
/**
 * Create a SupabaseAdapter with configuration from environment variables
 *
 * Environment variables:
 * - SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_KEY: Service role key
 * - SUPABASE_ANON_KEY: Anon key (alternative to service key)
 */
declare function createSupabaseAdapter(config?: Partial<SupabaseConfig>): SupabaseAdapter;

export { type DatabaseAdapter, type QueryResult, SupabaseAdapter, type SupabaseConfig, type TransactionScope, createSupabaseAdapter };
