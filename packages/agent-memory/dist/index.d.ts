export { DatabaseAdapter, QueryResult, SupabaseAdapter, SupabaseConfig, TransactionScope, createSupabaseAdapter } from './supabase-adapter.js';
import '@supabase/supabase-js';

/**
 * SQL Converter
 *
 * Transforms SQLite SQL syntax to PostgreSQL syntax for Supabase compatibility.
 * This allows the same queries to work with both SQLite (local/Turso) and PostgreSQL (Supabase).
 */
interface ConvertedQuery {
    sql: string;
    params: unknown[];
}
/**
 * Convert SQLite SQL to PostgreSQL SQL
 *
 * Handles:
 * - Parameter placeholders (? → $1, $2, ...)
 * - Timestamp functions (datetime('now') → CURRENT_TIMESTAMP)
 * - JSON extraction (json_extract → ->> operator)
 * - Full-text search (FTS5 MATCH → tsvector @@)
 * - Table name conversion
 */
declare function convertSql(sql: string, params?: unknown[]): ConvertedQuery;
/**
 * Check if a SQL statement is a read-only query
 */
declare function isReadOnlyQuery(sql: string): boolean;
/**
 * Extract table name from SQL statement
 */
declare function extractTableName(sql: string): string | null;

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
declare const POSTGRES_SCHEMA = "\n-- =============================================================================\n-- VESTIGE KNOWLEDGE TABLE\n-- =============================================================================\n\nCREATE TABLE IF NOT EXISTS vestige_knowledge (\n  id TEXT PRIMARY KEY,\n  agent_id UUID NOT NULL DEFAULT auth.uid(),\n\n  content TEXT NOT NULL,\n  summary TEXT,\n\n  -- Temporal metadata (TIMESTAMPTZ for timezone support)\n  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  access_count INTEGER DEFAULT 0,\n\n  -- FSRS-6 fields\n  stability REAL DEFAULT 1.0,\n  difficulty REAL DEFAULT 0.3,\n  reps INTEGER DEFAULT 0,\n  lapses INTEGER DEFAULT 0,\n  state TEXT DEFAULT 'New',\n  last_review TIMESTAMPTZ,\n  next_review TIMESTAMPTZ,\n\n  -- Dual-Strength Memory Model (Bjork & Bjork, 1992)\n  retention_strength REAL DEFAULT 1.0,\n  storage_strength REAL DEFAULT 1.0,\n  retrieval_strength REAL DEFAULT 1.0,\n  stability_factor REAL DEFAULT 1.0,\n  sentiment_intensity REAL DEFAULT 0,\n\n  -- Legacy/backward compatibility\n  review_count INTEGER DEFAULT 0,\n\n  -- Provenance\n  source_type TEXT NOT NULL DEFAULT 'note',\n  source_platform TEXT NOT NULL DEFAULT 'api',\n  source_id TEXT,\n  source_url TEXT,\n  source_chain JSONB DEFAULT '[]',\n  git_context JSONB,\n\n  -- Confidence\n  confidence REAL DEFAULT 0.8,\n  is_contradicted BOOLEAN DEFAULT FALSE,\n  contradiction_ids JSONB DEFAULT '[]',\n\n  -- Extracted entities (JSONB for efficient querying)\n  people JSONB DEFAULT '[]',\n  concepts JSONB DEFAULT '[]',\n  events JSONB DEFAULT '[]',\n  tags JSONB DEFAULT '[]',\n\n  -- Full-text search (generated column)\n  search_vector TSVECTOR GENERATED ALWAYS AS (\n    setweight(to_tsvector('english', coalesce(content, '')), 'A') ||\n    setweight(to_tsvector('english', coalesce(summary, '')), 'B')\n  ) STORED\n);\n\n-- Indexes for vestige_knowledge\nCREATE INDEX IF NOT EXISTS idx_knowledge_agent ON vestige_knowledge(agent_id);\nCREATE INDEX IF NOT EXISTS idx_knowledge_created_at ON vestige_knowledge(created_at);\nCREATE INDEX IF NOT EXISTS idx_knowledge_last_accessed ON vestige_knowledge(last_accessed_at);\nCREATE INDEX IF NOT EXISTS idx_knowledge_retention ON vestige_knowledge(retention_strength);\nCREATE INDEX IF NOT EXISTS idx_knowledge_next_review ON vestige_knowledge(next_review);\nCREATE INDEX IF NOT EXISTS idx_knowledge_state ON vestige_knowledge(state);\nCREATE INDEX IF NOT EXISTS idx_knowledge_search ON vestige_knowledge USING GIN(search_vector);\nCREATE INDEX IF NOT EXISTS idx_knowledge_tags ON vestige_knowledge USING GIN(tags);\nCREATE INDEX IF NOT EXISTS idx_knowledge_concepts ON vestige_knowledge USING GIN(concepts);\n\n-- RLS Policy for vestige_knowledge\nALTER TABLE vestige_knowledge ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"agent_isolation_knowledge\" ON vestige_knowledge\n  USING (agent_id = auth.uid())\n  WITH CHECK (agent_id = auth.uid());\n\n-- =============================================================================\n-- VESTIGE PEOPLE TABLE\n-- =============================================================================\n\nCREATE TABLE IF NOT EXISTS vestige_people (\n  id TEXT PRIMARY KEY,\n  agent_id UUID NOT NULL DEFAULT auth.uid(),\n\n  name TEXT NOT NULL,\n  aliases JSONB DEFAULT '[]',\n  how_we_met TEXT,\n  relationship_type TEXT,\n  organization TEXT,\n  role TEXT,\n  location TEXT,\n\n  -- Contact information\n  email TEXT,\n  phone TEXT,\n  social_links JSONB DEFAULT '{}',\n\n  -- Relationship tracking\n  last_contact_at TIMESTAMPTZ,\n  contact_frequency REAL DEFAULT 0,\n  preferred_channel TEXT,\n  shared_topics JSONB DEFAULT '[]',\n  shared_projects JSONB DEFAULT '[]',\n  notes TEXT,\n  relationship_health REAL DEFAULT 0.5,\n\n  -- Temporal metadata\n  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\n-- Indexes for vestige_people\nCREATE INDEX IF NOT EXISTS idx_people_agent ON vestige_people(agent_id);\nCREATE INDEX IF NOT EXISTS idx_people_name ON vestige_people(name);\nCREATE INDEX IF NOT EXISTS idx_people_last_contact ON vestige_people(last_contact_at);\n\n-- RLS Policy for vestige_people\nALTER TABLE vestige_people ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"agent_isolation_people\" ON vestige_people\n  USING (agent_id = auth.uid())\n  WITH CHECK (agent_id = auth.uid());\n\n-- =============================================================================\n-- VESTIGE EDGES TABLE (Knowledge Graph)\n-- =============================================================================\n\nCREATE TABLE IF NOT EXISTS vestige_edges (\n  id TEXT PRIMARY KEY,\n  agent_id UUID NOT NULL DEFAULT auth.uid(),\n\n  from_id TEXT NOT NULL,\n  to_id TEXT NOT NULL,\n  edge_type TEXT NOT NULL,\n  weight REAL DEFAULT 0.5,\n  metadata JSONB DEFAULT '{}',\n\n  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n  UNIQUE(agent_id, from_id, to_id, edge_type)\n);\n\n-- Indexes for vestige_edges\nCREATE INDEX IF NOT EXISTS idx_edges_agent ON vestige_edges(agent_id);\nCREATE INDEX IF NOT EXISTS idx_edges_from ON vestige_edges(from_id);\nCREATE INDEX IF NOT EXISTS idx_edges_to ON vestige_edges(to_id);\nCREATE INDEX IF NOT EXISTS idx_edges_type ON vestige_edges(edge_type);\n\n-- RLS Policy for vestige_edges\nALTER TABLE vestige_edges ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"agent_isolation_edges\" ON vestige_edges\n  USING (agent_id = auth.uid())\n  WITH CHECK (agent_id = auth.uid());\n\n-- =============================================================================\n-- VESTIGE INTENTIONS TABLE (Prospective Memory)\n-- =============================================================================\n\nCREATE TABLE IF NOT EXISTS vestige_intentions (\n  id TEXT PRIMARY KEY,\n  agent_id UUID NOT NULL DEFAULT auth.uid(),\n\n  content TEXT NOT NULL,\n  trigger_type TEXT NOT NULL,\n  trigger_data TEXT NOT NULL,\n  priority TEXT DEFAULT 'normal',\n  status TEXT DEFAULT 'active',\n  deadline TIMESTAMPTZ,\n  fulfilled_at TIMESTAMPTZ,\n  reminder_count INTEGER DEFAULT 0,\n  tags JSONB DEFAULT '[]',\n  related_memories JSONB DEFAULT '[]',\n  source TEXT DEFAULT 'api',\n  snoozed_until TIMESTAMPTZ,\n\n  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\n\n-- Indexes for vestige_intentions\nCREATE INDEX IF NOT EXISTS idx_intentions_agent ON vestige_intentions(agent_id);\nCREATE INDEX IF NOT EXISTS idx_intentions_status ON vestige_intentions(status);\nCREATE INDEX IF NOT EXISTS idx_intentions_priority ON vestige_intentions(priority);\nCREATE INDEX IF NOT EXISTS idx_intentions_deadline ON vestige_intentions(deadline);\n\n-- RLS Policy for vestige_intentions\nALTER TABLE vestige_intentions ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"agent_isolation_intentions\" ON vestige_intentions\n  USING (agent_id = auth.uid())\n  WITH CHECK (agent_id = auth.uid());\n\n-- =============================================================================\n-- VESTIGE METADATA TABLE\n-- =============================================================================\n\nCREATE TABLE IF NOT EXISTS vestige_metadata (\n  key TEXT PRIMARY KEY,\n  agent_id UUID NOT NULL DEFAULT auth.uid(),\n  value TEXT NOT NULL,\n  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,\n\n  UNIQUE(agent_id, key)\n);\n\n-- RLS Policy for vestige_metadata\nALTER TABLE vestige_metadata ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"agent_isolation_metadata\" ON vestige_metadata\n  USING (agent_id = auth.uid())\n  WITH CHECK (agent_id = auth.uid());\n\n-- =============================================================================\n-- RPC FUNCTION FOR RAW SQL EXECUTION\n-- =============================================================================\n\nCREATE OR REPLACE FUNCTION vestige_execute(query TEXT, params JSONB DEFAULT '[]')\nRETURNS JSONB\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  result JSONB;\n  param_array TEXT[];\nBEGIN\n  -- Convert JSONB array to TEXT array for EXECUTE\n  SELECT array_agg(value::TEXT)\n  INTO param_array\n  FROM jsonb_array_elements_text(params);\n\n  -- Execute the query with parameters\n  IF param_array IS NULL OR array_length(param_array, 1) IS NULL THEN\n    EXECUTE query INTO result;\n  ELSE\n    EXECUTE query INTO result USING VARIADIC param_array;\n  END IF;\n\n  RETURN COALESCE(result, '[]'::JSONB);\nEND;\n$$;\n\n-- Grant execute permission to authenticated users\nGRANT EXECUTE ON FUNCTION vestige_execute TO authenticated;\n";
/**
 * Split schema into individual statements for batch execution.
 *
 * Note: This handles PostgreSQL-specific syntax like $$ function bodies
 * by tracking delimiter state.
 */
declare function getSchemaStatements(): string[];
/**
 * Get the schema as a single string for direct execution
 */
declare function getSchema(): string;

export { type ConvertedQuery, POSTGRES_SCHEMA, convertSql, extractTableName, getSchema, getSchemaStatements, isReadOnlyQuery };
