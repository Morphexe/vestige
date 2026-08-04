// src/supabase-adapter.ts
import { createClient } from "@supabase/supabase-js";

// src/sql-converter.ts
var TABLE_MAPPINGS = {
  knowledge_nodes: "vestige_knowledge",
  people: "vestige_people",
  graph_edges: "vestige_edges",
  intentions: "vestige_intentions",
  vestige_metadata: "vestige_metadata"
};
function convertSql(sql, params) {
  const safeParams = params ?? [];
  if (!sql || sql.trim() === "") {
    return { sql, params: safeParams };
  }
  let converted = sql;
  for (const [sqliteTable, postgresTable] of Object.entries(TABLE_MAPPINGS)) {
    const tablePattern = new RegExp(
      `(?<![a-zA-Z0-9_])${sqliteTable}(?![a-zA-Z0-9_])`,
      "g"
    );
    converted = converted.replace(tablePattern, postgresTable);
  }
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*\)/gi,
    "CURRENT_TIMESTAMP"
  );
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*,\s*'\+(\d+)\s*(days?|hours?|minutes?)'\s*\)/gi,
    (_, num, unit) => `CURRENT_TIMESTAMP + INTERVAL '${num} ${unit}'`
  );
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*,\s*'-(\d+)\s*(days?|hours?|minutes?)'\s*\)/gi,
    (_, num, unit) => `CURRENT_TIMESTAMP - INTERVAL '${num} ${unit}'`
  );
  converted = converted.replace(
    /json_extract\s*\(\s*(\w+)\s*,\s*'\$\.([^']+)'\s*\)/gi,
    (_, column, path) => {
      const parts = path.split(".");
      if (parts.length === 1) {
        return `${column}->>'${parts[0]}'`;
      }
      const intermediate = parts.slice(0, -1).map((p) => `'${p}'`).join("->");
      const final = parts[parts.length - 1];
      return `${column}->${intermediate}->>'${final}'`;
    }
  );
  converted = converted.replace(
    /\bJOIN\s+knowledge_fts\s+\w+\s+ON\s+[^W]+/gi,
    " "
  );
  converted = converted.replace(
    /knowledge_fts\s+MATCH\s+\?/gi,
    "search_vector @@ plainto_tsquery(?)"
  );
  converted = converted.replace(
    /WHERE\s+knowledge_fts\s+MATCH/gi,
    "WHERE search_vector @@"
  );
  let paramIndex = 0;
  converted = converted.replace(/\?/g, () => `$${++paramIndex}`);
  converted = converted.replace(/\s{2,}/g, " ");
  return { sql: converted, params: safeParams };
}
function isReadOnlyQuery(sql) {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("EXPLAIN");
}
function extractTableName(sql) {
  const match = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
  return match ? match[1] : null;
}

// src/schema.ts
var POSTGRES_SCHEMA = `
-- =============================================================================
-- VESTIGE KNOWLEDGE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS vestige_knowledge (
  id TEXT PRIMARY KEY,
  agent_id UUID NOT NULL DEFAULT auth.uid(),

  content TEXT NOT NULL,
  summary TEXT,

  -- Temporal metadata (TIMESTAMPTZ for timezone support)
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  access_count INTEGER DEFAULT 0,

  -- FSRS-6 fields
  stability REAL DEFAULT 1.0,
  difficulty REAL DEFAULT 0.3,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT DEFAULT 'New',
  last_review TIMESTAMPTZ,
  next_review TIMESTAMPTZ,

  -- Dual-Strength Memory Model (Bjork & Bjork, 1992)
  retention_strength REAL DEFAULT 1.0,
  storage_strength REAL DEFAULT 1.0,
  retrieval_strength REAL DEFAULT 1.0,
  stability_factor REAL DEFAULT 1.0,
  sentiment_intensity REAL DEFAULT 0,

  -- Legacy/backward compatibility
  review_count INTEGER DEFAULT 0,

  -- Provenance
  source_type TEXT NOT NULL DEFAULT 'note',
  source_platform TEXT NOT NULL DEFAULT 'api',
  source_id TEXT,
  source_url TEXT,
  source_chain JSONB DEFAULT '[]',
  git_context JSONB,

  -- Confidence
  confidence REAL DEFAULT 0.8,
  is_contradicted BOOLEAN DEFAULT FALSE,
  contradiction_ids JSONB DEFAULT '[]',

  -- Extracted entities (JSONB for efficient querying)
  people JSONB DEFAULT '[]',
  concepts JSONB DEFAULT '[]',
  events JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',

  -- Full-text search (generated column)
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(content, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(summary, '')), 'B')
  ) STORED
);

-- Indexes for vestige_knowledge
CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON vestige_knowledge(agent_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_created_at ON vestige_knowledge(created_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_last_accessed ON vestige_knowledge(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_knowledge_retention ON vestige_knowledge(retention_strength);
CREATE INDEX IF NOT EXISTS idx_knowledge_next_review ON vestige_knowledge(next_review);
CREATE INDEX IF NOT EXISTS idx_knowledge_state ON vestige_knowledge(state);
CREATE INDEX IF NOT EXISTS idx_knowledge_search ON vestige_knowledge USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_knowledge_tags ON vestige_knowledge USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_concepts ON vestige_knowledge USING GIN(concepts);

-- RLS Policy for vestige_knowledge
ALTER TABLE vestige_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_isolation_knowledge" ON vestige_knowledge
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- =============================================================================
-- VESTIGE PEOPLE TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS vestige_people (
  id TEXT PRIMARY KEY,
  agent_id UUID NOT NULL DEFAULT auth.uid(),

  name TEXT NOT NULL,
  aliases JSONB DEFAULT '[]',
  how_we_met TEXT,
  relationship_type TEXT,
  organization TEXT,
  role TEXT,
  location TEXT,

  -- Contact information
  email TEXT,
  phone TEXT,
  social_links JSONB DEFAULT '{}',

  -- Relationship tracking
  last_contact_at TIMESTAMPTZ,
  contact_frequency REAL DEFAULT 0,
  preferred_channel TEXT,
  shared_topics JSONB DEFAULT '[]',
  shared_projects JSONB DEFAULT '[]',
  notes TEXT,
  relationship_health REAL DEFAULT 0.5,

  -- Temporal metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vestige_people
CREATE INDEX IF NOT EXISTS idx_people_agent ON vestige_people(agent_id);
CREATE INDEX IF NOT EXISTS idx_people_name ON vestige_people(name);
CREATE INDEX IF NOT EXISTS idx_people_last_contact ON vestige_people(last_contact_at);

-- RLS Policy for vestige_people
ALTER TABLE vestige_people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_isolation_people" ON vestige_people
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- =============================================================================
-- VESTIGE EDGES TABLE (Knowledge Graph)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vestige_edges (
  id TEXT PRIMARY KEY,
  agent_id UUID NOT NULL DEFAULT auth.uid(),

  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  edge_type TEXT NOT NULL,
  weight REAL DEFAULT 0.5,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(agent_id, from_id, to_id, edge_type)
);

-- Indexes for vestige_edges
CREATE INDEX IF NOT EXISTS idx_edges_agent ON vestige_edges(agent_id);
CREATE INDEX IF NOT EXISTS idx_edges_from ON vestige_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON vestige_edges(to_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON vestige_edges(edge_type);

-- RLS Policy for vestige_edges
ALTER TABLE vestige_edges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_isolation_edges" ON vestige_edges
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- =============================================================================
-- VESTIGE INTENTIONS TABLE (Prospective Memory)
-- =============================================================================

CREATE TABLE IF NOT EXISTS vestige_intentions (
  id TEXT PRIMARY KEY,
  agent_id UUID NOT NULL DEFAULT auth.uid(),

  content TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_data TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'active',
  deadline TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  reminder_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  related_memories JSONB DEFAULT '[]',
  source TEXT DEFAULT 'api',
  snoozed_until TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for vestige_intentions
CREATE INDEX IF NOT EXISTS idx_intentions_agent ON vestige_intentions(agent_id);
CREATE INDEX IF NOT EXISTS idx_intentions_status ON vestige_intentions(status);
CREATE INDEX IF NOT EXISTS idx_intentions_priority ON vestige_intentions(priority);
CREATE INDEX IF NOT EXISTS idx_intentions_deadline ON vestige_intentions(deadline);

-- RLS Policy for vestige_intentions
ALTER TABLE vestige_intentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_isolation_intentions" ON vestige_intentions
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- =============================================================================
-- VESTIGE METADATA TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS vestige_metadata (
  key TEXT PRIMARY KEY,
  agent_id UUID NOT NULL DEFAULT auth.uid(),
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(agent_id, key)
);

-- RLS Policy for vestige_metadata
ALTER TABLE vestige_metadata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_isolation_metadata" ON vestige_metadata
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

-- =============================================================================
-- RPC FUNCTION FOR RAW SQL EXECUTION
-- =============================================================================

CREATE OR REPLACE FUNCTION vestige_execute(query TEXT, params JSONB DEFAULT '[]')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  param_array TEXT[];
BEGIN
  -- Convert JSONB array to TEXT array for EXECUTE
  SELECT array_agg(value::TEXT)
  INTO param_array
  FROM jsonb_array_elements_text(params);

  -- Execute the query with parameters
  IF param_array IS NULL OR array_length(param_array, 1) IS NULL THEN
    EXECUTE query INTO result;
  ELSE
    EXECUTE query INTO result USING VARIADIC param_array;
  END IF;

  RETURN COALESCE(result, '[]'::JSONB);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION vestige_execute TO authenticated;
`;
function getSchemaStatements() {
  const statements = [];
  let current = "";
  let inFunctionBody = false;
  const lines = POSTGRES_SCHEMA.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (current === "" && (trimmed === "" || trimmed.startsWith("--"))) {
      continue;
    }
    current += line + "\n";
    if (trimmed.includes("$$")) {
      const dollarCount = (trimmed.match(/\$\$/g) || []).length;
      if (dollarCount === 1) {
        inFunctionBody = !inFunctionBody;
      }
    }
    if (!inFunctionBody && trimmed.endsWith(";")) {
      const statement = current.trim();
      if (statement.length > 1) {
        statements.push(statement);
      }
      current = "";
    }
  }
  if (current.trim().length > 1) {
    statements.push(current.trim());
  }
  return statements;
}
function getSchema() {
  return POSTGRES_SCHEMA;
}

// src/supabase-adapter.ts
var SupabaseAdapter = class {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client;
  config;
  closed = false;
  get type() {
    return "supabase";
  }
  constructor(config) {
    this.config = config;
    this.client = createClient(config.url, config.serviceKey, {
      db: {
        schema: config.schema ?? "public"
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE, etc.)
   */
  async execute(sql, params) {
    if (this.closed) {
      throw new Error("Connection closed");
    }
    const converted = convertSql(sql, params ?? []);
    if (this.config.debug) {
      console.log("[SupabaseAdapter] SQL:", converted.sql);
      console.log("[SupabaseAdapter] Params:", converted.params);
    }
    return this.executeRaw(converted.sql, converted.params);
  }
  /**
   * Execute raw PostgreSQL SQL (after conversion)
   * Protected to allow subclassing for testing
   */
  async executeRaw(sql, params) {
    const { data, error } = await this.client.rpc("vestige_execute", {
      query: sql,
      params: JSON.stringify(params)
    });
    if (error) {
      throw new Error(`Supabase error: ${error.message}`);
    }
    const rows = Array.isArray(data) ? data : data ? [data] : [];
    return {
      rows,
      rowsAffected: rows.length
    };
  }
  /**
   * Execute a query and return all rows
   */
  async query(sql, params) {
    const result = await this.execute(sql, params);
    return result.rows;
  }
  /**
   * Execute a query and return a single row (or null)
   */
  async queryOne(sql, params) {
    const rows = await this.query(sql, params);
    return rows[0] ?? null;
  }
  /**
   * Execute multiple statements in a batch
   */
  async batch(statements) {
    const results = [];
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
  async transaction(fn) {
    if (this.closed) {
      throw new Error("Connection closed");
    }
    const savepointName = `sp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    await this.executeRaw("SAVEPOINT " + savepointName, []);
    const scope = {
      execute: async (sql, params) => {
        const converted = convertSql(sql, params ?? []);
        return this.executeRaw(converted.sql, converted.params);
      },
      commit: async () => {
        await this.executeRaw("RELEASE SAVEPOINT " + savepointName, []);
      },
      rollback: async () => {
        await this.executeRaw("ROLLBACK TO SAVEPOINT " + savepointName, []);
      }
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
  async isHealthy() {
    if (this.closed) {
      return false;
    }
    try {
      const { error } = await this.client.from("vestige_metadata").select("key").limit(1);
      return !error;
    } catch {
      return false;
    }
  }
  /**
   * Initialize the database schema
   */
  async initialize() {
    if (this.config.debug) {
      console.log("[SupabaseAdapter] Initializing schema...");
    }
    const statements = getSchemaStatements();
    for (const statement of statements) {
      try {
        await this.executeRaw(statement, []);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already exists")) {
          throw error;
        }
      }
    }
    if (this.config.debug) {
      console.log("[SupabaseAdapter] Schema initialized");
    }
  }
  /**
   * Close the database connection
   */
  async close() {
    this.closed = true;
  }
  /**
   * Get the underlying Supabase client for direct access
   * Use with caution - bypasses SQL conversion
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient() {
    return this.client;
  }
};
function createSupabaseAdapter(config) {
  const url = config?.url ?? process.env["SUPABASE_URL"];
  const serviceKey = config?.serviceKey ?? process.env["SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url) {
    throw new Error(
      "Supabase URL not provided. Set SUPABASE_URL environment variable or pass url in config."
    );
  }
  if (!serviceKey) {
    throw new Error(
      "Supabase key not provided. Set SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY environment variable or pass serviceKey in config."
    );
  }
  return new SupabaseAdapter({
    url,
    serviceKey,
    debug: config?.debug ?? process.env["DEBUG"] === "true",
    schema: config?.schema,
    bypassRLS: config?.bypassRLS
  });
}

export {
  convertSql,
  isReadOnlyQuery,
  extractTableName,
  POSTGRES_SCHEMA,
  getSchemaStatements,
  getSchema,
  SupabaseAdapter,
  createSupabaseAdapter
};
//# sourceMappingURL=chunk-5MDAIEL4.js.map