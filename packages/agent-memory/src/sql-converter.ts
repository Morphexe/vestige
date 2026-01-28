/**
 * SQL Converter
 *
 * Transforms SQLite SQL syntax to PostgreSQL syntax for Supabase compatibility.
 * This allows the same queries to work with both SQLite (local/Turso) and PostgreSQL (Supabase).
 */

export interface ConvertedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Table name mappings from SQLite schema to PostgreSQL schema
 */
const TABLE_MAPPINGS: Record<string, string> = {
  knowledge_nodes: 'vestige_knowledge',
  people: 'vestige_people',
  graph_edges: 'vestige_edges',
  intentions: 'vestige_intentions',
  vestige_metadata: 'vestige_metadata',
};

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
export function convertSql(sql: string, params?: unknown[]): ConvertedQuery {
  const safeParams = params ?? [];

  if (!sql || sql.trim() === '') {
    return { sql, params: safeParams };
  }

  let converted = sql;

  // ============================================================================
  // TABLE NAME CONVERSION
  // ============================================================================

  // Convert table names using word boundaries to avoid partial matches
  for (const [sqliteTable, postgresTable] of Object.entries(TABLE_MAPPINGS)) {
    // Match table name that's not part of a larger identifier
    // Uses negative lookbehind/lookahead for alphanumeric/underscore characters
    const tablePattern = new RegExp(
      `(?<![a-zA-Z0-9_])${sqliteTable}(?![a-zA-Z0-9_])`,
      'g'
    );
    converted = converted.replace(tablePattern, postgresTable);
  }

  // ============================================================================
  // TIMESTAMP FUNCTIONS
  // ============================================================================

  // datetime('now') → CURRENT_TIMESTAMP
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*\)/gi,
    'CURRENT_TIMESTAMP'
  );

  // datetime('now', '+N days') → CURRENT_TIMESTAMP + INTERVAL 'N days'
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*,\s*'\+(\d+)\s*(days?|hours?|minutes?)'\s*\)/gi,
    (_, num, unit) => `CURRENT_TIMESTAMP + INTERVAL '${num} ${unit}'`
  );

  // datetime('now', '-N days') → CURRENT_TIMESTAMP - INTERVAL 'N days'
  converted = converted.replace(
    /datetime\s*\(\s*'now'\s*,\s*'-(\d+)\s*(days?|hours?|minutes?)'\s*\)/gi,
    (_, num, unit) => `CURRENT_TIMESTAMP - INTERVAL '${num} ${unit}'`
  );

  // ============================================================================
  // JSON FUNCTIONS
  // ============================================================================

  // json_extract(column, '$.path.to.field') → column->'path'->'to'->>'field'
  converted = converted.replace(
    /json_extract\s*\(\s*(\w+)\s*,\s*'\$\.([^']+)'\s*\)/gi,
    (_, column, path) => {
      const parts = path.split('.');
      if (parts.length === 1) {
        return `${column}->>'${parts[0]}'`;
      }

      // For nested paths: column->'a'->'b'->>'c'
      const intermediate = parts.slice(0, -1).map((p: string) => `'${p}'`).join('->');
      const final = parts[parts.length - 1];
      return `${column}->${intermediate}->>'${final}'`;
    }
  );

  // ============================================================================
  // FULL-TEXT SEARCH
  // ============================================================================

  // Remove FTS table JOIN (knowledge_fts is a virtual table in SQLite, but a column in PostgreSQL)
  converted = converted.replace(
    /\bJOIN\s+knowledge_fts\s+\w+\s+ON\s+[^W]+/gi,
    ' '
  );

  // knowledge_fts MATCH ? → search_vector @@ plainto_tsquery($N)
  converted = converted.replace(
    /knowledge_fts\s+MATCH\s+\?/gi,
    'search_vector @@ plainto_tsquery(?)'
  );

  // WHERE knowledge_fts MATCH → WHERE search_vector @@
  converted = converted.replace(
    /WHERE\s+knowledge_fts\s+MATCH/gi,
    'WHERE search_vector @@'
  );

  // ============================================================================
  // PARAMETER PLACEHOLDERS
  // ============================================================================

  // Convert ? to $1, $2, $3, etc.
  // This must be done last to ensure proper numbering
  let paramIndex = 0;
  converted = converted.replace(/\?/g, () => `$${++paramIndex}`);

  // ============================================================================
  // CLEANUP
  // ============================================================================

  // Clean up any double spaces created by transformations
  converted = converted.replace(/\s{2,}/g, ' ');

  return { sql: converted, params: safeParams };
}

/**
 * Check if a SQL statement is a read-only query
 */
export function isReadOnlyQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return (
    trimmed.startsWith('SELECT') ||
    trimmed.startsWith('WITH') ||
    trimmed.startsWith('EXPLAIN')
  );
}

/**
 * Extract table name from SQL statement
 */
export function extractTableName(sql: string): string | null {
  // Match FROM or INTO or UPDATE table names
  const match = sql.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/i);
  return match ? match[1] : null;
}
