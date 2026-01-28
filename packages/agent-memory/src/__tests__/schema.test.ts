/**
 * Tests for PostgreSQL Schema
 *
 * Tests the PostgreSQL schema definition with RLS policies.
 */

import { describe, it, expect } from 'bun:test';
import { POSTGRES_SCHEMA, getSchemaStatements } from '../schema.js';

describe('PostgreSQL Schema', () => {
  // ==========================================================================
  // BASIC SCHEMA VALIDATION
  // ==========================================================================

  describe('Basic Schema Validation', () => {
    it('should have non-empty schema', () => {
      expect(POSTGRES_SCHEMA.length).toBeGreaterThan(100);
    });

    it('should generate individual statements', () => {
      const statements = getSchemaStatements();
      expect(statements.length).toBeGreaterThan(5);
    });

    it('should have CREATE TABLE statements', () => {
      const statements = getSchemaStatements();
      const createTables = statements.filter(s =>
        s.toUpperCase().includes('CREATE TABLE')
      );
      expect(createTables.length).toBeGreaterThan(3);
    });

    it('should have CREATE INDEX statements', () => {
      const statements = getSchemaStatements();
      const createIndexes = statements.filter(s =>
        s.toUpperCase().includes('CREATE INDEX')
      );
      expect(createIndexes.length).toBeGreaterThan(5);
    });
  });

  // ==========================================================================
  // TABLE DEFINITIONS
  // ==========================================================================

  describe('Table Definitions', () => {
    it('should include vestige_knowledge table', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_knowledge');
    });

    it('should include vestige_people table', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_people');
    });

    it('should include vestige_edges table', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_edges');
    });

    it('should include vestige_intentions table', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_intentions');
    });

    it('should include vestige_metadata table', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_metadata');
    });
  });

  // ==========================================================================
  // POSTGRESQL-SPECIFIC TYPES
  // ==========================================================================

  describe('PostgreSQL-Specific Types', () => {
    it('should use TIMESTAMPTZ for dates', () => {
      expect(POSTGRES_SCHEMA).toContain('TIMESTAMPTZ');
    });

    it('should not use SQLite datetime function', () => {
      expect(POSTGRES_SCHEMA).not.toContain("datetime('now')");
    });

    it('should use JSONB for arrays', () => {
      expect(POSTGRES_SCHEMA).toContain('JSONB');
    });

    it('should use UUID type for agent_id', () => {
      expect(POSTGRES_SCHEMA).toContain('UUID');
    });

    it('should use REAL for floating point', () => {
      expect(POSTGRES_SCHEMA).toContain('REAL');
    });

    it('should use INTEGER for counts', () => {
      expect(POSTGRES_SCHEMA).toContain('INTEGER');
    });
  });

  // ==========================================================================
  // FULL-TEXT SEARCH
  // ==========================================================================

  describe('Full-Text Search', () => {
    it('should include tsvector for FTS', () => {
      expect(POSTGRES_SCHEMA).toContain('TSVECTOR');
    });

    it('should include search_vector column', () => {
      expect(POSTGRES_SCHEMA).toContain('search_vector');
    });

    it('should use generated column for search_vector', () => {
      expect(POSTGRES_SCHEMA).toContain('GENERATED ALWAYS AS');
    });

    it('should use to_tsvector function', () => {
      expect(POSTGRES_SCHEMA).toContain('to_tsvector');
    });

    it('should use setweight for ranking', () => {
      expect(POSTGRES_SCHEMA).toContain('setweight');
    });

    it('should include GIN index for FTS', () => {
      expect(POSTGRES_SCHEMA).toContain('USING GIN');
    });
  });

  // ==========================================================================
  // ROW LEVEL SECURITY
  // ==========================================================================

  describe('Row Level Security', () => {
    it('should enable RLS on tables', () => {
      expect(POSTGRES_SCHEMA).toContain('ROW LEVEL SECURITY');
    });

    it('should include agent_id column for RLS', () => {
      const agentIdMatches = POSTGRES_SCHEMA.match(/agent_id/g);
      expect(agentIdMatches).not.toBeNull();
      expect(agentIdMatches!.length).toBeGreaterThan(3); // At least one per table
    });

    it('should reference auth.uid() for RLS policies', () => {
      expect(POSTGRES_SCHEMA).toContain('auth.uid()');
    });

    it('should have USING clause for SELECT policies', () => {
      expect(POSTGRES_SCHEMA).toContain('USING (');
    });

    it('should have WITH CHECK clause for INSERT/UPDATE policies', () => {
      expect(POSTGRES_SCHEMA).toContain('WITH CHECK (');
    });

    it('should have policies for each table', () => {
      expect(POSTGRES_SCHEMA).toContain('ON vestige_knowledge');
      expect(POSTGRES_SCHEMA).toContain('ON vestige_people');
      expect(POSTGRES_SCHEMA).toContain('ON vestige_edges');
      expect(POSTGRES_SCHEMA).toContain('ON vestige_intentions');
    });
  });

  // ==========================================================================
  // FSRS FIELDS
  // ==========================================================================

  describe('FSRS Fields', () => {
    it('should include stability field', () => {
      expect(POSTGRES_SCHEMA).toContain('stability');
    });

    it('should include difficulty field', () => {
      expect(POSTGRES_SCHEMA).toContain('difficulty');
    });

    it('should include reps field', () => {
      expect(POSTGRES_SCHEMA).toContain('reps');
    });

    it('should include lapses field', () => {
      expect(POSTGRES_SCHEMA).toContain('lapses');
    });

    it('should include state field', () => {
      expect(POSTGRES_SCHEMA).toContain('state');
    });

    it('should include last_review field', () => {
      expect(POSTGRES_SCHEMA).toContain('last_review');
    });

    it('should include next_review field', () => {
      expect(POSTGRES_SCHEMA).toContain('next_review');
    });
  });

  // ==========================================================================
  // DUAL-STRENGTH MEMORY MODEL
  // ==========================================================================

  describe('Dual-Strength Memory Model', () => {
    it('should include storage_strength field', () => {
      expect(POSTGRES_SCHEMA).toContain('storage_strength');
    });

    it('should include retrieval_strength field', () => {
      expect(POSTGRES_SCHEMA).toContain('retrieval_strength');
    });

    it('should include retention_strength field', () => {
      expect(POSTGRES_SCHEMA).toContain('retention_strength');
    });

    it('should include stability_factor field', () => {
      expect(POSTGRES_SCHEMA).toContain('stability_factor');
    });
  });

  // ==========================================================================
  // PROVENANCE FIELDS
  // ==========================================================================

  describe('Provenance Fields', () => {
    it('should include source_type field', () => {
      expect(POSTGRES_SCHEMA).toContain('source_type');
    });

    it('should include source_platform field', () => {
      expect(POSTGRES_SCHEMA).toContain('source_platform');
    });

    it('should include source_chain field', () => {
      expect(POSTGRES_SCHEMA).toContain('source_chain');
    });

    it('should include git_context field', () => {
      expect(POSTGRES_SCHEMA).toContain('git_context');
    });
  });

  // ==========================================================================
  // ENTITY FIELDS
  // ==========================================================================

  describe('Entity Fields', () => {
    it('should include people field as JSONB', () => {
      expect(POSTGRES_SCHEMA).toMatch(/people\s+JSONB/);
    });

    it('should include concepts field as JSONB', () => {
      expect(POSTGRES_SCHEMA).toMatch(/concepts\s+JSONB/);
    });

    it('should include events field as JSONB', () => {
      expect(POSTGRES_SCHEMA).toMatch(/events\s+JSONB/);
    });

    it('should include tags field as JSONB', () => {
      expect(POSTGRES_SCHEMA).toMatch(/tags\s+JSONB/);
    });
  });

  // ==========================================================================
  // INDEXES
  // ==========================================================================

  describe('Indexes', () => {
    it('should have index on agent_id', () => {
      expect(POSTGRES_SCHEMA).toContain('idx_knowledge_agent');
    });

    it('should have index on search_vector', () => {
      expect(POSTGRES_SCHEMA).toContain('idx_knowledge_search');
    });

    it('should have index on next_review', () => {
      expect(POSTGRES_SCHEMA).toContain('idx_knowledge_next_review');
    });

    it('should have GIN index on tags', () => {
      expect(POSTGRES_SCHEMA).toContain('idx_knowledge_tags');
      expect(POSTGRES_SCHEMA).toContain('USING GIN(tags)');
    });
  });

  // ==========================================================================
  // RPC FUNCTION
  // ==========================================================================

  describe('RPC Function', () => {
    it('should include vestige_execute function', () => {
      expect(POSTGRES_SCHEMA).toContain('vestige_execute');
    });

    it('should use SECURITY DEFINER for RPC', () => {
      expect(POSTGRES_SCHEMA).toContain('SECURITY DEFINER');
    });

    it('should return JSONB', () => {
      expect(POSTGRES_SCHEMA).toContain('RETURNS JSONB');
    });
  });

  // ==========================================================================
  // STATEMENT SPLITTING
  // ==========================================================================

  describe('Statement Splitting', () => {
    it('should split statements correctly', () => {
      const statements = getSchemaStatements();

      for (const stmt of statements) {
        // Each statement should end with semicolon
        expect(stmt.trim().endsWith(';')).toBe(true);

        // Should not be empty
        expect(stmt.trim().length).toBeGreaterThan(1);
      }
    });

    it('should preserve function body with internal semicolons', () => {
      const statements = getSchemaStatements();
      const functionStmts = statements.filter(s =>
        s.includes('CREATE OR REPLACE FUNCTION')
      );

      // Function should be captured as single statement
      expect(functionStmts.length).toBeGreaterThan(0);
    });
  });
});
