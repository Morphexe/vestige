/**
 * PostgreSQL Schema for Vestige
 *
 * This schema is designed for Supabase with Row Level Security (RLS)
 * for multi-tenant agent isolation.
 *
 * Key differences from SQLite schema:
 * - Uses TIMESTAMPTZ instead of TEXT for dates
 * - Uses JSONB instead of TEXT for JSON arrays
 * - Uses tsvector for full-text search instead of FTS5
 * - Includes agent_id column and RLS policies for tenant isolation
 * - Table names prefixed with vestige_ to avoid conflicts
 */

export const POSTGRES_SCHEMA = `
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

/**
 * Split schema into individual statements for batch execution.
 *
 * Note: This handles PostgreSQL-specific syntax like $$ function bodies
 * by tracking delimiter state.
 */
export function getSchemaStatements(): string[] {
  const statements: string[] = [];
  let current = '';
  let inFunctionBody = false;

  const lines = POSTGRES_SCHEMA.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments when not in a statement
    if (current === '' && (trimmed === '' || trimmed.startsWith('--'))) {
      continue;
    }

    current += line + '\n';

    // Track function body delimiters
    if (trimmed.includes('$$')) {
      const dollarCount = (trimmed.match(/\$\$/g) || []).length;
      if (dollarCount === 1) {
        inFunctionBody = !inFunctionBody;
      }
      // If dollarCount === 2, we opened and closed in same line
    }

    // Check for statement end (semicolon at end of line, not in function body)
    if (!inFunctionBody && trimmed.endsWith(';')) {
      const statement = current.trim();
      if (statement.length > 1) {
        statements.push(statement);
      }
      current = '';
    }
  }

  // Add any remaining content
  if (current.trim().length > 1) {
    statements.push(current.trim());
  }

  return statements;
}

/**
 * Get the schema as a single string for direct execution
 */
export function getSchema(): string {
  return POSTGRES_SCHEMA;
}
