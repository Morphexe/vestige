/**
 * File Relationship Tracking Module
 *
 * This module tracks relationships between files:
 * - Co-edit patterns (files edited together)
 * - Import/dependency relationships
 * - Test-implementation relationships
 * - Domain groupings
 *
 * Understanding file relationships helps:
 * - Suggest related files when editing
 * - Provide better context for code generation
 * - Identify architectural boundaries
 */

import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import {
  type FileRelationship,
  RelationType,
  RelationshipSource,
  createFileRelationship,
} from './types.js';

// ============================================================================
// RELATED FILE
// ============================================================================

/** A file that is related to another file */
export interface RelatedFile {
  /** Path to the related file */
  path: string;
  /** Type of relationship */
  relationshipType: RelationType;
  /** Strength of the relationship (0.0 - 1.0) */
  strength: number;
  /** Human-readable description */
  description: string;
}

// ============================================================================
// RELATIONSHIP GRAPH
// ============================================================================

/** A node in the relationship graph */
export interface GraphNode {
  /** Unique ID for this node */
  id: string;
  /** File path */
  path: string;
  /** Display label */
  label: string;
  /** Node type (for styling) */
  nodeType: string;
  /** Number of connections */
  degree: number;
}

/** An edge in the relationship graph */
export interface GraphEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Relationship type */
  relationshipType: RelationType;
  /** Edge weight (strength) */
  weight: number;
  /** Edge label */
  label: string;
}

/** Metadata about the graph */
export interface GraphMetadata {
  /** Total number of nodes */
  nodeCount: number;
  /** Total number of edges */
  edgeCount: number;
  /** When the graph was built */
  builtAt: Date;
  /** Average relationship strength */
  averageStrength: number;
}

/** Graph structure for visualizing file relationships */
export interface RelationshipGraph {
  /** Nodes (files) in the graph */
  nodes: GraphNode[];
  /** Edges (relationships) in the graph */
  edges: GraphEdge[];
  /** Graph metadata */
  metadata: GraphMetadata;
}

// ============================================================================
// CO-EDIT SESSION
// ============================================================================

/** Tracks files edited together in a session */
interface CoEditSession {
  /** Files in this session */
  files: Set<string>;
  /** When the session started */
  startedAt: Date;
  /** When the session was last updated */
  lastUpdated: Date;
}

// ============================================================================
// RELATIONSHIP TRACKER
// ============================================================================

/** Session timeout in minutes */
const SESSION_TIMEOUT_MINUTES = 30;

/** Minimum co-edits to create a relationship */
const MIN_COEDITS_FOR_RELATIONSHIP = 3;

/**
 * Relationship Tracker
 *
 * Tracks relationships between files in a codebase.
 */
export class RelationshipTracker {
  /** All relationships indexed by ID */
  private relationships = new Map<string, FileRelationship>();
  /** Relationships indexed by file for fast lookup */
  private fileRelationships = new Map<string, string[]>();
  /** Current co-edit session */
  private currentSession: CoEditSession | null = null;
  /** Co-edit counts between file pairs */
  private coeditCounts = new Map<string, number>();
  /** ID counter for new relationships */
  private nextId = 1;

  /** Generate a new relationship ID */
  private newId(): string {
    return `rel-${this.nextId++}`;
  }

  /** Generate a pair key for two files (sorted for consistency) */
  private pairKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  /** Add a relationship */
  addRelationship(relationship: FileRelationship): string {
    if (relationship.files.length < 2) {
      throw new Error('Relationship must have at least 2 files');
    }

    const id = relationship.id;

    // Index by each file
    for (const file of relationship.files) {
      const ids = this.fileRelationships.get(file) ?? [];
      ids.push(id);
      this.fileRelationships.set(file, ids);
    }

    this.relationships.set(id, relationship);

    return id;
  }

  /** Record that files were edited together */
  recordCoedit(files: string[]): void {
    if (files.length < 2) {
      return; // Need at least 2 files for a relationship
    }

    const now = new Date();

    // Update or create session
    if (this.currentSession) {
      // Check if session is still active (within timeout)
      const elapsed = now.getTime() - this.currentSession.lastUpdated.getTime();
      if (elapsed > SESSION_TIMEOUT_MINUTES * 60 * 1000) {
        // Session expired, finalize it and start new
        this.finalizeSession();
        this.currentSession = {
          files: new Set(files),
          startedAt: now,
          lastUpdated: now,
        };
      } else {
        // Add files to current session
        for (const file of files) {
          this.currentSession.files.add(file);
        }
        this.currentSession.lastUpdated = now;
      }
    } else {
      // Start new session
      this.currentSession = {
        files: new Set(files),
        startedAt: now,
        lastUpdated: now,
      };
    }

    // Update co-edit counts for each pair
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = this.pairKey(files[i]!, files[j]!);
        this.coeditCounts.set(key, (this.coeditCounts.get(key) ?? 0) + 1);
      }
    }
  }

  /** Finalize the current session and create relationships */
  finalizeSession(): void {
    if (!this.currentSession) {
      return;
    }

    const files = Array.from(this.currentSession.files);
    this.currentSession = null;

    if (files.length < 2) {
      return;
    }

    // Create relationships for frequent co-edits
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = this.pairKey(files[i]!, files[j]!);
        const count = this.coeditCounts.get(key) ?? 0;

        // Only create relationship if edited together multiple times
        if (count >= MIN_COEDITS_FOR_RELATIONSHIP) {
          const strength = Math.min(count / 10, 1.0);

          // Check if relationship already exists
          const exists = Array.from(this.relationships.values()).some(
            r => r.files.includes(files[i]!) && r.files.includes(files[j]!)
          );

          if (!exists) {
            const relationship = createFileRelationship(
              [files[i]!, files[j]!],
              RelationType.FrequentCochange,
              `Edited together ${count} times in recent sessions`,
              {
                strength,
                source: RelationshipSource.UserDefined,
                observationCount: count,
              }
            );
            this.addRelationship(relationship);
          }
        }
      }
    }
  }

  /** Get files related to a given file */
  getRelatedFiles(filePath: string): RelatedFile[] {
    const relationshipIds = this.fileRelationships.get(filePath) ?? [];

    const related: RelatedFile[] = [];

    for (const id of relationshipIds) {
      const rel = this.relationships.get(id);
      if (rel) {
        for (const file of rel.files) {
          if (file !== filePath) {
            related.push({
              path: file,
              relationshipType: rel.relationshipType,
              strength: rel.strength,
              description: rel.description,
            });
          }
        }
      }
    }

    // Also check for test file relationships
    const inferred = this.inferTestRelationships(filePath);
    related.push(...inferred);

    // Deduplicate by path
    const seen = new Set<string>();
    return related.filter(r => {
      if (seen.has(r.path)) {
        return false;
      }
      seen.add(r.path);
      return true;
    });
  }

  /** Infer test file relationships based on naming conventions */
  private inferTestRelationships(filePath: string): RelatedFile[] {
    const related: RelatedFile[] = [];

    const ext = path.extname(filePath).slice(1);
    const baseName = path.basename(filePath, path.extname(filePath));
    const directory = path.dirname(filePath);

    // Check for test file naming patterns
    const isTest =
      baseName.includes('test') ||
      baseName.includes('spec') ||
      baseName.endsWith('_test') ||
      baseName.startsWith('test_');

    if (isTest) {
      // This is a test file - find the implementation
      const implStem = baseName
        .replace(/_test$/, '')
        .replace(/\.test$/, '')
        .replace(/_spec$/, '')
        .replace(/\.spec$/, '')
        .replace(/^test_/, '');

      const implPath = path.join(directory, `${implStem}.${ext}`);

      if (fs.existsSync(implPath)) {
        related.push({
          path: implPath,
          relationshipType: RelationType.TestsImplementation,
          strength: 0.9,
          description: 'Implementation file for this test',
        });
      }
    } else {
      // This is an implementation - find the test file
      const testPatterns = [
        `${baseName}_test.${ext}`,
        `${baseName}.test.${ext}`,
        `test_${baseName}.${ext}`,
        `${baseName}_spec.${ext}`,
        `${baseName}.spec.${ext}`,
      ];

      for (const pattern of testPatterns) {
        const testPath = path.join(directory, pattern);
        if (fs.existsSync(testPath)) {
          related.push({
            path: testPath,
            relationshipType: RelationType.TestsImplementation,
            strength: 0.9,
            description: 'Test file for this implementation',
          });
          break;
        }
      }

      // Check tests/ directory
      const grandparent = path.dirname(directory);
      const testsDir = path.join(grandparent, 'tests');
      if (fs.existsSync(testsDir)) {
        for (const pattern of testPatterns) {
          const testPath = path.join(testsDir, pattern);
          if (fs.existsSync(testPath)) {
            related.push({
              path: testPath,
              relationshipType: RelationType.TestsImplementation,
              strength: 0.8,
              description: 'Test file in tests/ directory',
            });
          }
        }
      }
    }

    return related;
  }

  /** Build a relationship graph for visualization */
  buildGraph(): RelationshipGraph {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Map<string, string>();
    const nodeDegrees = new Map<string, number>();

    // Build nodes from all files in relationships
    for (const relationship of this.relationships.values()) {
      for (const file of relationship.files) {
        if (!nodeIds.has(file)) {
          const id = `node-${nodeIds.size}`;
          nodeIds.set(file, id);

          const label = path.basename(file);
          const ext = path.extname(file).slice(1);

          nodes.push({
            id,
            path: file,
            label,
            nodeType: ext || 'unknown',
            degree: 0, // Will update later
          });
        }
      }
    }

    // Build edges from relationships
    for (const relationship of this.relationships.values()) {
      if (relationship.files.length >= 2) {
        const sourceId = nodeIds.get(relationship.files[0]!);
        const targetId = nodeIds.get(relationship.files[1]!);

        if (!sourceId || !targetId) {
          continue;
        }

        // Update degrees
        nodeDegrees.set(sourceId, (nodeDegrees.get(sourceId) ?? 0) + 1);
        nodeDegrees.set(targetId, (nodeDegrees.get(targetId) ?? 0) + 1);

        edges.push({
          source: sourceId,
          target: targetId,
          relationshipType: relationship.relationshipType,
          weight: relationship.strength,
          label: relationship.relationshipType,
        });
      }
    }

    // Update node degrees
    for (const node of nodes) {
      node.degree = nodeDegrees.get(node.id) ?? 0;
    }

    // Calculate metadata
    const averageStrength =
      edges.length > 0 ? edges.reduce((sum, e) => sum + e.weight, 0) / edges.length : 0;

    const metadata: GraphMetadata = {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      builtAt: new Date(),
      averageStrength,
    };

    return { nodes, edges, metadata };
  }

  /** Get a specific relationship by ID */
  getRelationship(id: string): FileRelationship | undefined {
    return this.relationships.get(id);
  }

  /** Get all relationships */
  getAllRelationships(): FileRelationship[] {
    return Array.from(this.relationships.values());
  }

  /** Delete a relationship */
  deleteRelationship(id: string): boolean {
    const relationship = this.relationships.get(id);
    if (!relationship) {
      return false;
    }

    // Remove from file index
    for (const file of relationship.files) {
      const ids = this.fileRelationships.get(file);
      if (ids) {
        const idx = ids.indexOf(id);
        if (idx !== -1) {
          ids.splice(idx, 1);
        }
      }
    }

    this.relationships.delete(id);
    return true;
  }

  /** Get relationships by type */
  getRelationshipsByType(relType: RelationType): FileRelationship[] {
    return Array.from(this.relationships.values()).filter(r => r.relationshipType === relType);
  }

  /** Update relationship strength */
  updateStrength(id: string, delta: number): boolean {
    const relationship = this.relationships.get(id);
    if (!relationship) {
      return false;
    }

    relationship.strength = Math.max(0, Math.min(1, relationship.strength + delta));
    relationship.lastConfirmed = new Date();
    relationship.observationCount++;
    return true;
  }

  /** Load relationships from storage */
  loadRelationships(relationships: FileRelationship[]): void {
    for (const relationship of relationships) {
      this.addRelationship(relationship);
    }
  }

  /** Export all relationships for storage */
  exportRelationships(): FileRelationship[] {
    return Array.from(this.relationships.values());
  }

  /** Get the most connected files (highest degree in graph) */
  getHubFiles(limit: number): Array<{ path: string; degree: number }> {
    const fileDegrees = new Map<string, number>();

    for (const relationship of this.relationships.values()) {
      for (const file of relationship.files) {
        fileDegrees.set(file, (fileDegrees.get(file) ?? 0) + 1);
      }
    }

    const sorted = Array.from(fileDegrees.entries())
      .map(([path, degree]) => ({ path, degree }))
      .sort((a, b) => b.degree - a.degree);

    return sorted.slice(0, limit);
  }

  /** Clear all data */
  clear(): void {
    this.relationships.clear();
    this.fileRelationships.clear();
    this.currentSession = null;
    this.coeditCounts.clear();
    this.nextId = 1;
  }
}
