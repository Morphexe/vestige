/**
 * Vestige Adapters
 *
 * Database adapters and HTTP server for integrating Vestige into any application.
 *
 * @example Turso + HTTP Server
 * ```typescript
 * import { createTursoAdapter, createVestigeHttpServer } from '@vestige/core/adapters';
 *
 * const db = createTursoAdapter({
 *   url: process.env.TURSO_DATABASE_URL,
 *   authToken: process.env.TURSO_AUTH_TOKEN,
 * });
 *
 * await db.initialize();
 *
 * const vestige = await createVestigeHttpServer({ database: db });
 *
 * // Use with any framework
 * app.post('/mcp', (req) => vestige.handleWebRequest(req));
 * ```
 */

// Database adapter interface
export type {
  DatabaseAdapter,
  QueryResult,
  TransactionScope,
} from './database-adapter.ts';

export {
  VESTIGE_SCHEMA,
  getSchemaStatements,
} from './database-adapter.ts';

// Turso adapter
export {
  TursoAdapter,
  createTursoAdapter,
  type TursoConfig,
} from './turso-adapter.ts';

// HTTP server
export {
  createVestigeHttpServer,
  type VestigeHttpServer,
  type VestigeHttpServerConfig,
} from './http-server.ts';
