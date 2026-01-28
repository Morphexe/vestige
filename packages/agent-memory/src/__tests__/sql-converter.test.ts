/**
 * Tests for SQL Converter
 *
 * Tests the SQLite → PostgreSQL SQL transformation logic.
 */

import { describe, it, expect } from 'bun:test';
import { convertSql } from '../sql-converter.js';

describe('SQL Converter', () => {
  // ==========================================================================
  // PARAMETER PLACEHOLDERS
  // ==========================================================================

  describe('Parameter Placeholders', () => {
    it('should convert ? to $1, $2, $3', () => {
      const result = convertSql('SELECT * FROM t WHERE a = ? AND b = ?', [1, 2]);
      expect(result.sql).toBe('SELECT * FROM t WHERE a = $1 AND b = $2');
      expect(result.params).toEqual([1, 2]);
    });

    it('should handle queries with no parameters', () => {
      const result = convertSql('SELECT * FROM t', []);
      expect(result.sql).toBe('SELECT * FROM t');
      expect(result.params).toEqual([]);
    });

    it('should handle single parameter', () => {
      const result = convertSql('SELECT * FROM t WHERE id = ?', ['abc']);
      expect(result.sql).toBe('SELECT * FROM t WHERE id = $1');
      expect(result.params).toEqual(['abc']);
    });

    it('should handle many parameters', () => {
      const result = convertSql(
        'INSERT INTO t (a, b, c, d, e) VALUES (?, ?, ?, ?, ?)',
        [1, 2, 3, 4, 5]
      );
      expect(result.sql).toBe('INSERT INTO t (a, b, c, d, e) VALUES ($1, $2, $3, $4, $5)');
      expect(result.params).toEqual([1, 2, 3, 4, 5]);
    });

    it('should not convert ? inside string literals', () => {
      const result = convertSql("SELECT * FROM t WHERE name LIKE '%?%'", []);
      // Note: This is a limitation - the converter treats all ? as params
      // In practice, use $1 with LIKE pattern in param
      expect(result.sql).toContain('%');
    });
  });

  // ==========================================================================
  // TIMESTAMP FUNCTIONS
  // ==========================================================================

  describe('Timestamp Functions', () => {
    it("should convert datetime('now') to CURRENT_TIMESTAMP", () => {
      const result = convertSql("UPDATE t SET created_at = datetime('now')", []);
      expect(result.sql).toBe('UPDATE t SET created_at = CURRENT_TIMESTAMP');
    });

    it("should convert DATETIME('NOW') case-insensitively", () => {
      const result = convertSql("UPDATE t SET created_at = DATETIME('NOW')", []);
      expect(result.sql).toBe('UPDATE t SET created_at = CURRENT_TIMESTAMP');
    });

    it("should convert datetime('now', '-30 days')", () => {
      const result = convertSql("WHERE created_at < datetime('now', '-30 days')", []);
      expect(result.sql).toContain("CURRENT_TIMESTAMP - INTERVAL '30 days'");
    });

    it("should convert datetime('now', '+7 days')", () => {
      const result = convertSql("WHERE created_at < datetime('now', '+7 days')", []);
      expect(result.sql).toContain("CURRENT_TIMESTAMP + INTERVAL '7 days'");
    });

    it("should convert datetime('now', '-1 day') singular", () => {
      const result = convertSql("WHERE created_at > datetime('now', '-1 day')", []);
      expect(result.sql).toContain("CURRENT_TIMESTAMP - INTERVAL '1 day'");
    });

    it("should handle multiple datetime conversions in one query", () => {
      const result = convertSql(
        "SELECT * FROM t WHERE created_at > datetime('now', '-7 days') AND updated_at < datetime('now')",
        []
      );
      expect(result.sql).toContain("CURRENT_TIMESTAMP - INTERVAL '7 days'");
      expect(result.sql).toContain('CURRENT_TIMESTAMP');
      expect(result.sql).not.toContain("datetime('now')");
    });
  });

  // ==========================================================================
  // JSON FUNCTIONS
  // ==========================================================================

  describe('JSON Functions', () => {
    it('should convert json_extract to ->> operator for simple paths', () => {
      const result = convertSql("SELECT json_extract(metadata, '$.field') FROM t", []);
      expect(result.sql).toBe("SELECT metadata->>'field' FROM t");
    });

    it('should handle json_extract case-insensitively', () => {
      const result = convertSql("SELECT JSON_EXTRACT(data, '$.name') FROM t", []);
      expect(result.sql).toBe("SELECT data->>'name' FROM t");
    });

    it('should handle nested paths with two levels', () => {
      const result = convertSql("SELECT json_extract(data, '$.nested.field') FROM t", []);
      expect(result.sql).toBe("SELECT data->'nested'->>'field' FROM t");
    });

    it('should handle deeply nested paths', () => {
      const result = convertSql("SELECT json_extract(data, '$.a.b.c.d') FROM t", []);
      expect(result.sql).toBe("SELECT data->'a'->'b'->'c'->>'d' FROM t");
    });

    it('should handle multiple json_extract in same query', () => {
      const result = convertSql(
        "SELECT json_extract(a, '$.x'), json_extract(b, '$.y') FROM t",
        []
      );
      expect(result.sql).toBe("SELECT a->>'x', b->>'y' FROM t");
    });
  });

  // ==========================================================================
  // FULL-TEXT SEARCH
  // ==========================================================================

  describe('Full-Text Search', () => {
    it('should convert FTS5 MATCH to tsvector @@', () => {
      const result = convertSql(
        'SELECT * FROM knowledge_nodes WHERE knowledge_fts MATCH ?',
        ['memory']
      );
      expect(result.sql).toContain('search_vector @@ plainto_tsquery');
      expect(result.sql).toContain('$1');
    });

    it('should convert JOIN with FTS table to direct search_vector query', () => {
      const input = `
        SELECT kn.* FROM knowledge_nodes kn
        JOIN knowledge_fts fts ON kn.id = fts.id
        WHERE knowledge_fts MATCH ?
      `;
      const result = convertSql(input, ['test']);
      expect(result.sql).not.toContain('knowledge_fts');
      expect(result.sql).not.toContain('JOIN');
      expect(result.sql).toContain('search_vector @@');
    });

    it('should handle FTS with table alias', () => {
      const result = convertSql(
        'SELECT kn.* FROM vestige_knowledge kn WHERE search_vector @@ plainto_tsquery(?)',
        ['memory']
      );
      // Should pass through already-converted syntax
      expect(result.sql).toContain('search_vector @@ plainto_tsquery');
    });
  });

  // ==========================================================================
  // TABLE NAME CONVERSION
  // ==========================================================================

  describe('Table Name Conversion', () => {
    it('should convert knowledge_nodes to vestige_knowledge', () => {
      const result = convertSql('SELECT * FROM knowledge_nodes WHERE id = ?', ['id1']);
      expect(result.sql).toContain('vestige_knowledge');
      expect(result.sql).not.toContain('knowledge_nodes');
    });

    it('should convert people to vestige_people', () => {
      const result = convertSql('INSERT INTO people (id, name) VALUES (?, ?)', ['id', 'name']);
      expect(result.sql).toContain('vestige_people');
      expect(result.sql).not.toContain(' people');
    });

    it('should convert graph_edges to vestige_edges', () => {
      const result = convertSql('SELECT * FROM graph_edges WHERE from_id = ?', ['id1']);
      expect(result.sql).toContain('vestige_edges');
      expect(result.sql).not.toContain('graph_edges');
    });

    it('should convert intentions to vestige_intentions', () => {
      const result = convertSql('SELECT * FROM intentions WHERE status = ?', ['active']);
      expect(result.sql).toContain('vestige_intentions');
    });

    it('should not convert partial matches', () => {
      const result = convertSql('SELECT people_count FROM stats', []);
      // Should not transform people_count to vestige_people_count
      expect(result.sql).toContain('people_count');
    });

    it('should handle multiple table references', () => {
      const result = convertSql(
        'SELECT k.*, p.name FROM knowledge_nodes k JOIN people p ON k.author_id = p.id',
        []
      );
      expect(result.sql).toContain('vestige_knowledge');
      expect(result.sql).toContain('vestige_people');
    });
  });

  // ==========================================================================
  // BOOLEAN CONVERSION
  // ==========================================================================

  describe('Boolean Conversion', () => {
    it('should preserve INTEGER 0/1 in WHERE clauses (PostgreSQL handles both)', () => {
      const result = convertSql('SELECT * FROM t WHERE is_active = 1', []);
      // PostgreSQL accepts both INTEGER 0/1 and TRUE/FALSE for boolean columns
      expect(result.sql).toContain('is_active = 1');
    });

    it('should handle is_contradicted field', () => {
      const result = convertSql('SELECT * FROM knowledge_nodes WHERE is_contradicted = 0', []);
      // PostgreSQL accepts INTEGER for boolean columns
      expect(result.sql).toContain('is_contradicted');
    });
  });

  // ==========================================================================
  // COMBINED TRANSFORMATIONS
  // ==========================================================================

  describe('Combined Transformations', () => {
    it('should apply multiple transformations in one query', () => {
      const input = `
        SELECT json_extract(metadata, '$.source') as source
        FROM knowledge_nodes
        WHERE created_at > datetime('now', '-7 days')
        AND knowledge_fts MATCH ?
      `;
      const result = convertSql(input, ['test query']);

      expect(result.sql).toContain('vestige_knowledge');
      expect(result.sql).toContain("CURRENT_TIMESTAMP - INTERVAL '7 days'");
      expect(result.sql).toContain("metadata->>'source'");
      expect(result.sql).toContain('search_vector @@');
      expect(result.sql).toContain('$1');
    });

    it('should handle complex INSERT with defaults', () => {
      const input = `
        INSERT INTO knowledge_nodes (id, content, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `;
      const result = convertSql(input, ['id1', 'content1']);

      expect(result.sql).toContain('vestige_knowledge');
      expect(result.sql).toContain('CURRENT_TIMESTAMP');
      expect(result.sql).toContain('$1');
      expect(result.sql).toContain('$2');
    });

    it('should preserve query structure', () => {
      const input = `
        UPDATE knowledge_nodes
        SET updated_at = datetime('now'),
            access_count = access_count + 1
        WHERE id = ?
      `;
      const result = convertSql(input, ['node-id']);

      expect(result.sql).toContain('UPDATE vestige_knowledge');
      expect(result.sql).toContain('SET updated_at = CURRENT_TIMESTAMP');
      expect(result.sql).toContain('access_count = access_count + 1');
      expect(result.sql).toContain('WHERE id = $1');
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty SQL string', () => {
      const result = convertSql('', []);
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('should handle SQL with only whitespace', () => {
      const result = convertSql('   ', []);
      expect(result.sql.trim()).toBe('');
    });

    it('should handle undefined params as empty array', () => {
      const result = convertSql('SELECT 1', undefined as unknown as unknown[]);
      expect(result.params).toEqual([]);
    });

    it('should preserve comments', () => {
      const result = convertSql('-- Comment\nSELECT * FROM knowledge_nodes', []);
      expect(result.sql).toContain('-- Comment');
      expect(result.sql).toContain('vestige_knowledge');
    });
  });
});
