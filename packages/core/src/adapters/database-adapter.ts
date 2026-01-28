/**
 * Database Adapter Interface
 *
 * Abstracts database operations to support multiple backends:
 * - Turso (libSQL)
 * - Local SQLite (bun:sqlite, better-sqlite3)
 * - PostgreSQL (future)
 *
 * All operations are async to support remote databases.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowsAffected: number;
  lastInsertRowid?: number | bigint | undefined;
}

export interface TransactionScope {
  execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface DatabaseAdapter {
  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  execute<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

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
  batch(statements: Array<{ sql: string; params?: unknown[] }>): Promise<QueryResult[]>;

  /**
   * Execute operations within a transaction
   */
  transaction<T>(fn: (tx: TransactionScope) => Promise<T>): Promise<T>;

  /**
   * Check if the database is available
   */
  isHealthy(): Promise<boolean>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;

  /**
   * Get adapter type identifier
   */
  readonly type: 'turso' | 'sqlite' | 'postgres' | 'supabase';
}

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

/**
 * SQL statements to create the Vestige schema
 * Compatible with SQLite and Turso (libSQL)
 */
export const VESTIGE_SCHEMA = `
-- Knowledge Nodes table
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  summary TEXT,

  -- Temporal metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT NOT NULL DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0,

  -- FSRS-6 fields
  stability REAL DEFAULT 1.0,
  difficulty REAL DEFAULT 0.3,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT DEFAULT 'New',
  last_review TEXT,
  next_review TEXT,

  -- Legacy/backward compatibility
  retention_strength REAL DEFAULT 1.0,
  stability_factor REAL DEFAULT 1.0,
  sentiment_intensity REAL DEFAULT 0,
  review_count INTEGER DEFAULT 0,

  -- Dual-Strength Memory Model (Bjork & Bjork, 1992)
  storage_strength REAL DEFAULT 1.0,
  retrieval_strength REAL DEFAULT 1.0,

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'note',
  source_platform TEXT NOT NULL DEFAULT 'api',
  source_id TEXT,
  source_url TEXT,
  source_chain TEXT DEFAULT '[]',
  git_context TEXT,

  -- Confidence
  confidence REAL DEFAULT 0.8,
  is_contradicted INTEGER DEFAULT 0,
  contradiction_ids TEXT DEFAULT '[]',

  -- Extracted entities (JSON arrays)
  people TEXT DEFAULT '[]',
  concepts TEXT DEFAULT '[]',
  events TEXT DEFAULT '[]',
  tags TEXT DEFAULT '[]'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON knowledge_nodes(created_at);
CREATE INDEX IF NOT EXISTS idx_nodes_last_accessed ON knowledge_nodes(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_nodes_retention ON knowledge_nodes(retention_strength);
CREATE INDEX IF NOT EXISTS idx_nodes_next_review ON knowledge_nodes(next_review);
CREATE INDEX IF NOT EXISTS idx_nodes_state ON knowledge_nodes(state);

-- Full-text search for content
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  id,
  content,
  summary,
  tags,
  content='knowledge_nodes',
  content_rowid='rowid'
);

-- FTS sync triggers
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge_nodes BEGIN
  INSERT INTO knowledge_fts(rowid, id, content, summary, tags)
  VALUES (NEW.rowid, NEW.id, NEW.content, NEW.summary, NEW.tags);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge_nodes BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, id, content, summary, tags)
  VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.summary, OLD.tags);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge_nodes BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, id, content, summary, tags)
  VALUES ('delete', OLD.rowid, OLD.id, OLD.content, OLD.summary, OLD.tags);
  INSERT INTO knowledge_fts(rowid, id, content, summary, tags)
  VALUES (NEW.rowid, NEW.id, NEW.content, NEW.summary, NEW.tags);
END;

-- People table
CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT DEFAULT '[]',
  how_we_met TEXT,
  relationship_type TEXT,
  organization TEXT,
  role TEXT,
  location TEXT,
  email TEXT,
  phone TEXT,
  social_links TEXT DEFAULT '{}',
  last_contact_at TEXT,
  contact_frequency REAL DEFAULT 0,
  preferred_channel TEXT,
  shared_topics TEXT DEFAULT '[]',
  shared_projects TEXT DEFAULT '[]',
  notes TEXT,
  relationship_health REAL DEFAULT 0.5,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
CREATE INDEX IF NOT EXISTS idx_people_last_contact ON people(last_contact_at);

-- Graph edges table
CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  metadata TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_id, to_id, edge_type)
);

CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON graph_edges(edge_type);

-- Intentions table (prospective memory)
CREATE TABLE IF NOT EXISTS intentions (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_data TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'active',
  deadline TEXT,
  fulfilled_at TEXT,
  reminder_count INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]',
  related_memories TEXT DEFAULT '[]',
  source TEXT DEFAULT 'api',
  snoozed_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intentions_status ON intentions(status);
CREATE INDEX IF NOT EXISTS idx_intentions_priority ON intentions(priority);

-- Metadata table
CREATE TABLE IF NOT EXISTS vestige_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Split schema into individual statements for batch execution
 */
export function getSchemaStatements(): string[] {
  return VESTIGE_SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s + ';');
}
