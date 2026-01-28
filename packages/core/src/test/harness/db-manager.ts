/**
 * Test Database Manager
 *
 * Provides isolated database instances for testing:
 * - Temporary databases that are automatically cleaned up
 * - Pre-seeded databases with test data
 * - Database snapshots and restoration
 * - Concurrent test isolation
 *
 * Note: This uses bun:sqlite for database operations.
 */

import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nanoid } from 'nanoid';

/**
 * Knowledge node row from database
 */
export interface KnowledgeNodeRow {
  id: string;
  content: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string;
  access_count: number;
  retention_strength: number;
  stability_factor: number;
  sentiment_intensity: number;
  next_review_date: string | null;
  review_count: number;
  storage_strength: number;
  retrieval_strength: number;
  source_type: string;
  source_platform: string;
  source_id: string | null;
  source_url: string | null;
  tags: string;
}

/**
 * Manager for test databases
 *
 * Creates isolated database instances for each test to prevent interference.
 * Automatically cleans up temporary databases when disposed.
 *
 * @example
 * ```typescript
 * const db = TestDatabaseManager.newTemp();
 *
 * // Use the database
 * db.seedNodes(10);
 *
 * // Database is automatically deleted when disposed
 * db.dispose();
 * ```
 */
export class TestDatabaseManager {
  /** The SQLite database instance */
  db: Database;
  /** Temporary directory (for cleanup) */
  private tempDir: string | null;
  /** Path to the database file */
  private dbPath: string;
  /** Snapshot path if one exists */
  private snapshotPath: string | null = null;

  private constructor(db: Database, dbPath: string, tempDir: string | null) {
    this.db = db;
    this.dbPath = dbPath;
    this.tempDir = tempDir;
  }

  /**
   * Create a new test database in a temporary directory
   *
   * The database is automatically deleted when the manager is disposed.
   */
  static newTemp(): TestDatabaseManager {
    const tempDir = mkdtempSync(join(tmpdir(), 'vestige-test-'));
    const dbPath = join(tempDir, 'test_vestige.db');

    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    const manager = new TestDatabaseManager(db, dbPath, tempDir);
    manager.initializeSchema();

    return manager;
  }

  /**
   * Create a test database at a specific path
   *
   * The database is NOT automatically deleted.
   */
  static newAtPath(path: string): TestDatabaseManager {
    const db = new Database(path);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');

    const manager = new TestDatabaseManager(db, path, null);
    manager.initializeSchema();

    return manager;
  }

  /**
   * Create an in-memory database
   */
  static newInMemory(): TestDatabaseManager {
    const db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');

    const manager = new TestDatabaseManager(db, ':memory:', null);
    manager.initializeSchema();

    return manager;
  }

  /**
   * Initialize the database schema
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_nodes (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        summary TEXT,

        -- Temporal metadata
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_accessed_at TEXT NOT NULL,
        access_count INTEGER DEFAULT 0,

        -- FSRS-6 scheduling
        retention_strength REAL DEFAULT 1.0,
        stability_factor REAL DEFAULT 1.0,
        sentiment_intensity REAL DEFAULT 0,
        next_review_date TEXT,
        review_count INTEGER DEFAULT 0,

        -- Dual-Strength Memory Model
        storage_strength REAL DEFAULT 1.0,
        retrieval_strength REAL DEFAULT 1.0,

        -- Provenance
        source_type TEXT NOT NULL,
        source_platform TEXT NOT NULL,
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
        tags TEXT DEFAULT '[]',

        -- FSRS state (JSON)
        fsrs_state TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_nodes_created_at ON knowledge_nodes(created_at);
      CREATE INDEX IF NOT EXISTS idx_nodes_last_accessed ON knowledge_nodes(last_accessed_at);
      CREATE INDEX IF NOT EXISTS idx_nodes_retention ON knowledge_nodes(retention_strength);
      CREATE INDEX IF NOT EXISTS idx_nodes_source_type ON knowledge_nodes(source_type);
    `);

    // Full-text search for content
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
        id,
        content,
        summary,
        tags,
        content='knowledge_nodes',
        content_rowid='rowid'
      );
    `);

    // Triggers to keep FTS in sync
    this.db.exec(`
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
    `);

    // Embeddings table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        node_id TEXT PRIMARY KEY,
        embedding BLOB,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (node_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
      );
    `);

    // Graph edges table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL,
        to_id TEXT NOT NULL,
        edge_type TEXT NOT NULL,
        weight REAL DEFAULT 0.5,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(from_id, to_id, edge_type)
      );

      CREATE INDEX IF NOT EXISTS idx_edges_from ON graph_edges(from_id);
      CREATE INDEX IF NOT EXISTS idx_edges_to ON graph_edges(to_id);
    `);
  }

  /**
   * Get the database path
   */
  path(): string {
    return this.dbPath;
  }

  /**
   * Check if the database is empty
   */
  isEmpty(): boolean {
    const result = this.db.query<{ count: number }, []>(
      'SELECT COUNT(*) as count FROM knowledge_nodes'
    ).get();
    return (result?.count ?? 0) === 0;
  }

  /**
   * Get the number of nodes in the database
   */
  nodeCount(): number {
    const result = this.db.query<{ count: number }, []>(
      'SELECT COUNT(*) as count FROM knowledge_nodes'
    ).get();
    return result?.count ?? 0;
  }

  // ========================================================================
  // SEEDING METHODS
  // ========================================================================

  /**
   * Seed the database with a specified number of test nodes
   */
  seedNodes(count: number): string[] {
    const ids: string[] = [];
    const now = new Date().toISOString();

    const insert = this.db.query(`
      INSERT INTO knowledge_nodes (
        id, content, created_at, updated_at, last_accessed_at,
        source_type, source_platform, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < count; i++) {
      const id = nanoid();
      const tags = JSON.stringify([`test-${i % 5}`]);

      insert.run(
        id,
        `Test memory content ${i}`,
        now,
        now,
        now,
        'fact',
        'test',
        tags
      );
      ids.push(id);
    }

    return ids;
  }

  /**
   * Seed with diverse node types
   */
  seedDiverse(countPerType: number): string[] {
    const types = ['fact', 'concept', 'procedure', 'event', 'code'];
    const ids: string[] = [];
    const now = new Date().toISOString();

    const insert = this.db.query(`
      INSERT INTO knowledge_nodes (
        id, content, created_at, updated_at, last_accessed_at,
        source_type, source_platform, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const nodeType of types) {
      for (let i = 0; i < countPerType; i++) {
        const id = nanoid();
        const tags = JSON.stringify([nodeType]);

        insert.run(
          id,
          `Test ${nodeType} content ${i}`,
          now,
          now,
          now,
          nodeType,
          'test',
          tags
        );
        ids.push(id);
      }
    }

    return ids;
  }

  /**
   * Seed with nodes having various retention states
   */
  seedWithRetentionStates(): string[] {
    const ids: string[] = [];
    const now = new Date().toISOString();

    const insert = this.db.query(`
      INSERT INTO knowledge_nodes (
        id, content, created_at, updated_at, last_accessed_at,
        source_type, source_platform, tags, review_count, stability_factor, retention_strength
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // New node (never reviewed)
    const newId = nanoid();
    insert.run(newId, 'New memory - never reviewed', now, now, now, 'fact', 'test', '["new"]', 0, 1.0, 1.0);
    ids.push(newId);

    // Well-learned node (multiple good reviews)
    const learnedId = nanoid();
    insert.run(learnedId, 'Well-learned memory - reviewed multiple times', now, now, now, 'fact', 'test', '["learned"]', 5, 30.0, 0.95);
    ids.push(learnedId);

    // Struggling node (multiple lapses)
    const strugglingId = nanoid();
    insert.run(strugglingId, 'Struggling memory - has lapses', now, now, now, 'fact', 'test', '["struggling"]', 3, 2.0, 0.6);
    ids.push(strugglingId);

    return ids;
  }

  /**
   * Seed with emotional memories (different sentiment magnitudes)
   */
  seedEmotional(count: number): string[] {
    const ids: string[] = [];
    const now = new Date().toISOString();

    const insert = this.db.query(`
      INSERT INTO knowledge_nodes (
        id, content, created_at, updated_at, last_accessed_at,
        source_type, source_platform, tags, sentiment_intensity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < count; i++) {
      const id = nanoid();
      const magnitude = i / count;

      insert.run(
        id,
        `Emotional memory with magnitude ${magnitude.toFixed(2)}`,
        now,
        now,
        now,
        'event',
        'test',
        '["emotional"]',
        magnitude
      );
      ids.push(id);
    }

    return ids;
  }

  // ========================================================================
  // SNAPSHOT/RESTORE
  // ========================================================================

  /**
   * Take a snapshot of current database state
   */
  takeSnapshot(): void {
    if (this.dbPath === ':memory:') {
      throw new Error('Cannot snapshot in-memory database');
    }

    this.snapshotPath = `${this.dbPath}.snapshot`;

    // Close and copy the file
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    copyFileSync(this.dbPath, this.snapshotPath);
  }

  /**
   * Restore from the last snapshot
   */
  restoreSnapshot(): boolean {
    if (!this.snapshotPath || !existsSync(this.snapshotPath)) {
      return false;
    }

    // Close current database
    this.db.close();

    // Restore from snapshot
    copyFileSync(this.snapshotPath, this.dbPath);

    // Reopen
    this.db = new Database(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');

    return true;
  }

  /**
   * Check if a snapshot exists
   */
  hasSnapshot(): boolean {
    return this.snapshotPath !== null && existsSync(this.snapshotPath);
  }

  // ========================================================================
  // QUERY HELPERS
  // ========================================================================

  /**
   * Get all nodes
   */
  getAllNodes(limit = 1000, offset = 0): KnowledgeNodeRow[] {
    return this.db.query<KnowledgeNodeRow, [number, number]>(
      'SELECT * FROM knowledge_nodes ORDER BY created_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): KnowledgeNodeRow | null {
    return this.db.query<KnowledgeNodeRow, [string]>(
      'SELECT * FROM knowledge_nodes WHERE id = ?'
    ).get(id) ?? null;
  }

  /**
   * Delete a node by ID
   */
  deleteNode(id: string): boolean {
    const result = this.db.query('DELETE FROM knowledge_nodes WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ========================================================================
  // CLEANUP
  // ========================================================================

  /**
   * Clear all data from the database
   */
  clear(): void {
    this.db.exec('DELETE FROM embeddings');
    this.db.exec('DELETE FROM graph_edges');
    this.db.exec('DELETE FROM knowledge_nodes');
  }

  /**
   * Recreate the database (useful for testing migrations)
   */
  recreate(): void {
    if (this.dbPath === ':memory:') {
      this.clear();
      return;
    }

    this.db.close();

    if (existsSync(this.dbPath)) {
      rmSync(this.dbPath, { force: true });
      rmSync(`${this.dbPath}-wal`, { force: true });
      rmSync(`${this.dbPath}-shm`, { force: true });
    }

    this.db = new Database(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.initializeSchema();
  }

  /**
   * Dispose of the database and clean up temporary files
   */
  dispose(): void {
    try {
      this.db.close();
    } catch {
      // Ignore close errors
    }

    if (this.tempDir) {
      try {
        rmSync(this.tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    if (this.snapshotPath && existsSync(this.snapshotPath)) {
      try {
        rmSync(this.snapshotPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export default TestDatabaseManager;
