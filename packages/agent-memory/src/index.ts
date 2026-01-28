/**
 * Vestige Agent Memory
 *
 * Supabase adapter with RLS multi-tenancy for Vestige cognitive memory.
 * Provides per-agent data isolation using PostgreSQL Row Level Security.
 *
 * @example Basic Usage
 * ```typescript
 * import { createSupabaseAdapter } from '@vestige/agent-memory';
 *
 * const db = createSupabaseAdapter({
 *   url: process.env.SUPABASE_URL,
 *   serviceKey: process.env.SUPABASE_SERVICE_KEY,
 * });
 *
 * await db.initialize();
 *
 * // All queries are automatically converted from SQLite syntax
 * const memories = await db.query(
 *   "SELECT * FROM knowledge_nodes WHERE created_at > datetime('now', '-7 days')"
 * );
 * ```
 *
 * @example With HTTP Server
 * ```typescript
 * import { createSupabaseAdapter } from '@vestige/agent-memory';
 * import { createVestigeHttpServer } from '@vestige/core/adapters';
 *
 * const db = createSupabaseAdapter();
 * await db.initialize();
 *
 * const vestige = await createVestigeHttpServer({ database: db });
 * ```
 */

// Supabase adapter
export {
  SupabaseAdapter,
  createSupabaseAdapter,
  type SupabaseConfig,
  type DatabaseAdapter,
  type QueryResult,
  type TransactionScope,
} from './supabase-adapter.ts';

// SQL converter utilities
export {
  convertSql,
  isReadOnlyQuery,
  extractTableName,
  type ConvertedQuery,
} from './sql-converter.ts';

// PostgreSQL schema
export {
  POSTGRES_SCHEMA,
  getSchemaStatements,
  getSchema,
} from './schema.ts';
