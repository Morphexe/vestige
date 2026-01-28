/**
 * Tests for Codebase Memory Module
 */

import { describe, test, expect } from 'bun:test';
import {
  // Types
  DecisionStatus,
  BugSeverity,
  RelationType,
  RelationshipSource,
  PreferenceSource,
  EntityType,
  WorkStatus,
  // Factories
  createArchitecturalDecision,
  createBugFix,
  createCodePattern,
  createFileRelationship,
  createGitCochangeRelationship,
  createCodingPreference,
  createCodeEntity,
  createWorkContext,
  // Utilities
  getNodeId,
  getNodeCreatedAt,
  getNodeFiles,
  nodeToSearchableText,
  type CodebaseNode,
} from './types.js';

import { ContextCapture, ProjectType, Framework, getFrameworkName } from './context.js';

import { PatternDetector, createBuiltinPatterns, type PatternMatch } from './patterns.js';

import { RelationshipTracker, type RelatedFile, type RelationshipGraph } from './relationships.js';

// ============================================================================
// TYPE TESTS
// ============================================================================

describe('Codebase Types', () => {
  describe('ArchitecturalDecision', () => {
    test('creates decision with required fields', () => {
      const decision = createArchitecturalDecision(
        'Use Event Sourcing',
        'Need complete audit trail'
      );

      expect(decision.id).toBeDefined();
      expect(decision.decision).toBe('Use Event Sourcing');
      expect(decision.rationale).toBe('Need complete audit trail');
      expect(decision.status).toBe(DecisionStatus.Accepted);
      expect(decision.createdAt).toBeInstanceOf(Date);
    });

    test('creates decision with all options', () => {
      const decision = createArchitecturalDecision('Use CQRS', 'Separate read/write models', {
        filesAffected: ['src/commands.ts', 'src/queries.ts'],
        commitSha: 'abc123',
        context: 'High-traffic read operations',
        tags: ['architecture', 'performance'],
        status: DecisionStatus.Proposed,
        alternativesConsidered: ['Single model', 'GraphQL'],
      });

      expect(decision.filesAffected).toHaveLength(2);
      expect(decision.commitSha).toBe('abc123');
      expect(decision.context).toBe('High-traffic read operations');
      expect(decision.tags).toContain('architecture');
      expect(decision.status).toBe(DecisionStatus.Proposed);
      expect(decision.alternativesConsidered).toHaveLength(2);
    });
  });

  describe('BugFix', () => {
    test('creates bug fix with required fields', () => {
      const bugFix = createBugFix(
        'Users cannot login',
        'Session token expired check was inverted',
        'Fixed the boolean comparison',
        'def456'
      );

      expect(bugFix.id).toBeDefined();
      expect(bugFix.symptom).toBe('Users cannot login');
      expect(bugFix.rootCause).toBe('Session token expired check was inverted');
      expect(bugFix.solution).toBe('Fixed the boolean comparison');
      expect(bugFix.commitSha).toBe('def456');
      expect(bugFix.severity).toBe(BugSeverity.Medium);
    });

    test('creates bug fix with severity', () => {
      const bugFix = createBugFix('Data loss', 'Race condition', 'Added mutex', 'ghi789', {
        severity: BugSeverity.Critical,
        issueLink: 'https://github.com/org/repo/issues/123',
        filesChanged: ['src/storage.ts'],
        tags: ['critical', 'data'],
      });

      expect(bugFix.severity).toBe(BugSeverity.Critical);
      expect(bugFix.issueLink).toBe('https://github.com/org/repo/issues/123');
      expect(bugFix.filesChanged).toContain('src/storage.ts');
    });
  });

  describe('CodePattern', () => {
    test('creates pattern with required fields', () => {
      const pattern = createCodePattern(
        'Repository Pattern',
        'Abstract data access behind interface',
        'When you need to decouple domain from data'
      );

      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBe('Repository Pattern');
      expect(pattern.whenToUse).toContain('decouple');
      expect(pattern.usageCount).toBe(0);
    });

    test('creates pattern with example', () => {
      const pattern = createCodePattern('Error Handling', 'Use Result type', 'For all fallible ops', {
        exampleCode: 'fn foo() -> Result<T, E>',
        language: 'rust',
        tags: ['error-handling'],
      });

      expect(pattern.exampleCode).toContain('Result');
      expect(pattern.language).toBe('rust');
    });
  });

  describe('FileRelationship', () => {
    test('creates relationship between files', () => {
      const rel = createFileRelationship(
        ['src/main.ts', 'src/utils.ts'],
        RelationType.ImportsDependency,
        'main imports utils'
      );

      expect(rel.id).toBeDefined();
      expect(rel.files).toHaveLength(2);
      expect(rel.relationshipType).toBe(RelationType.ImportsDependency);
      expect(rel.strength).toBe(0.5);
      expect(rel.source).toBe(RelationshipSource.UserDefined);
    });

    test('creates git cochange relationship', () => {
      const rel = createGitCochangeRelationship(['src/a.ts', 'src/b.ts'], 0.8, 15);

      expect(rel.relationshipType).toBe(RelationType.FrequentCochange);
      expect(rel.source).toBe(RelationshipSource.GitCochange);
      expect(rel.strength).toBe(0.8);
      expect(rel.observationCount).toBe(15);
      expect(rel.description).toContain('15');
    });
  });

  describe('CodingPreference', () => {
    test('creates preference', () => {
      const pref = createCodingPreference('error handling', 'Use Result over panic');

      expect(pref.id).toBeDefined();
      expect(pref.context).toBe('error handling');
      expect(pref.preference).toBe('Use Result over panic');
      expect(pref.confidence).toBe(0.5);
    });

    test('creates preference with counter', () => {
      const pref = createCodingPreference('async runtime', 'Use tokio', {
        counterPreference: 'async-std',
        confidence: 0.9,
        language: 'rust',
      });

      expect(pref.counterPreference).toBe('async-std');
      expect(pref.confidence).toBe(0.9);
      expect(pref.language).toBe('rust');
    });

    test('clamps confidence to [0, 1]', () => {
      const high = createCodingPreference('test', 'pref', { confidence: 1.5 });
      const low = createCodingPreference('test', 'pref', { confidence: -0.5 });

      expect(high.confidence).toBe(1);
      expect(low.confidence).toBe(0);
    });
  });

  describe('CodeEntity', () => {
    test('creates entity', () => {
      const entity = createCodeEntity(
        'processOrder',
        EntityType.Function,
        'Processes an order and updates inventory'
      );

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('processOrder');
      expect(entity.entityType).toBe(EntityType.Function);
    });

    test('creates entity with location', () => {
      const entity = createCodeEntity('Order', EntityType.Class, 'Order aggregate', {
        filePath: 'src/orders/order.ts',
        lineNumber: 42,
        dependencies: ['Customer', 'Product'],
        tags: ['domain', 'aggregate'],
      });

      expect(entity.filePath).toBe('src/orders/order.ts');
      expect(entity.lineNumber).toBe(42);
      expect(entity.dependencies).toContain('Customer');
    });
  });

  describe('WorkContext', () => {
    test('creates work context', () => {
      const ctx = createWorkContext('Implementing user authentication');

      expect(ctx.id).toBeDefined();
      expect(ctx.taskDescription).toBe('Implementing user authentication');
      expect(ctx.status).toBe(WorkStatus.InProgress);
      expect(ctx.createdAt).toBeInstanceOf(Date);
      expect(ctx.updatedAt).toBeInstanceOf(Date);
    });

    test('creates work context with files and steps', () => {
      const ctx = createWorkContext('Building REST API', {
        activeFiles: ['src/routes.ts', 'src/handlers.ts'],
        branch: 'feature/api',
        nextSteps: ['Add validation', 'Write tests'],
        blockers: ['Need API spec'],
        status: WorkStatus.Blocked,
      });

      expect(ctx.activeFiles).toHaveLength(2);
      expect(ctx.branch).toBe('feature/api');
      expect(ctx.nextSteps).toContain('Add validation');
      expect(ctx.blockers).toContain('Need API spec');
      expect(ctx.status).toBe(WorkStatus.Blocked);
    });
  });

  describe('CodebaseNode utilities', () => {
    test('getNodeId returns correct id', () => {
      const decision = createArchitecturalDecision('Test', 'Rationale');
      const node: CodebaseNode = { type: 'architectural_decision', data: decision };

      expect(getNodeId(node)).toBe(decision.id);
    });

    test('getNodeCreatedAt returns date', () => {
      const pattern = createCodePattern('Test', 'Desc', 'When');
      const node: CodebaseNode = { type: 'code_pattern', data: pattern };

      expect(getNodeCreatedAt(node)).toBeInstanceOf(Date);
    });

    test('getNodeFiles returns associated files', () => {
      const decision = createArchitecturalDecision('Test', 'Rationale', {
        filesAffected: ['a.ts', 'b.ts'],
      });
      const node: CodebaseNode = { type: 'architectural_decision', data: decision };

      expect(getNodeFiles(node)).toEqual(['a.ts', 'b.ts']);
    });

    test('nodeToSearchableText generates text', () => {
      const bugFix = createBugFix('Symptom', 'Root cause', 'Solution', 'sha');
      const node: CodebaseNode = { type: 'bug_fix', data: bugFix };
      const text = nodeToSearchableText(node);

      expect(text).toContain('Bug Fix');
      expect(text).toContain('Symptom');
      expect(text).toContain('Root cause');
      expect(text).toContain('Solution');
    });
  });
});

// ============================================================================
// CONTEXT TESTS
// ============================================================================

describe('Context Capture', () => {
  test('captures basic context', () => {
    const capture = new ContextCapture('/tmp/test-project');
    const context = capture.capture();

    expect(context.projectRoot).toBe('/tmp/test-project');
    expect(context.capturedAt).toBeInstanceOf(Date);
  });

  test('getFrameworkName returns correct names', () => {
    expect(getFrameworkName(Framework.React)).toBe('React');
    expect(getFrameworkName(Framework.NextJs)).toBe('Next.js');
    expect(getFrameworkName(Framework.Axum)).toBe('Axum');
    expect(getFrameworkName(Framework.FastApi)).toBe('FastAPI');
  });

  test('tracks active files', () => {
    const capture = new ContextCapture('/tmp/test-project');

    capture.addActiveFile('src/main.ts');
    capture.addActiveFile('src/utils.ts');

    const context = capture.capture();
    expect(context.recentFiles).toContain('src/main.ts');
    expect(context.recentFiles).toContain('src/utils.ts');
  });

  test('removes active files', () => {
    const capture = new ContextCapture('/tmp/test-project');

    capture.addActiveFile('src/main.ts');
    capture.addActiveFile('src/utils.ts');
    capture.removeActiveFile('src/main.ts');

    const context = capture.capture();
    expect(context.recentFiles).not.toContain('src/main.ts');
    expect(context.recentFiles).toContain('src/utils.ts');
  });
});

// ============================================================================
// PATTERN TESTS
// ============================================================================

describe('Pattern Detector', () => {
  test('learns and retrieves pattern', () => {
    const detector = new PatternDetector();
    const pattern = createCodePattern('Test Pattern', 'A test pattern', 'When testing');

    detector.learnPattern(pattern);

    const retrieved = detector.getPattern(pattern.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.name).toBe('Test Pattern');
  });

  test('gets patterns by language', () => {
    const detector = new PatternDetector();

    const rustPattern = createCodePattern('Rust Pattern', 'Rust specific', 'In Rust', {
      language: 'rust',
    });
    const tsPattern = createCodePattern('TS Pattern', 'TypeScript specific', 'In TS', {
      language: 'typescript',
    });

    detector.learnPattern(rustPattern);
    detector.learnPattern(tsPattern);

    const rustPatterns = detector.getPatternsForLanguage('rust');
    expect(rustPatterns).toHaveLength(1);
    expect(rustPatterns[0]?.name).toBe('Rust Pattern');

    const tsPatterns = detector.getPatternsForLanguage('typescript');
    expect(tsPatterns).toHaveLength(1);
    expect(tsPatterns[0]?.name).toBe('TS Pattern');
  });

  test('detects patterns in code', () => {
    const detector = new PatternDetector();

    const pattern = createCodePattern(
      'Error Handling Pattern',
      'Use Result type for error handling',
      'When functions can fail',
      {
        language: 'rust',
        exampleCode: 'Result<T, Error>',
        tags: ['error', 'handling'],
      }
    );
    detector.learnPattern(pattern);

    const code = 'fn process() -> Result<String, Error> { Ok("done".to_string()) }';
    const matches = detector.detectPatterns(code, 'rust');

    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.pattern.name).toBe('Error Handling Pattern');
  });

  test('searches patterns by query', () => {
    const detector = new PatternDetector();

    const p1 = createCodePattern('Repository Pattern', 'Data access abstraction', 'When decoupling');
    const p2 = createCodePattern('Factory Pattern', 'Object creation', 'When creating objects');

    detector.learnPattern(p1);
    detector.learnPattern(p2);

    const results = detector.searchPatterns('repository');
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('Repository Pattern');
  });

  test('records pattern usage', () => {
    const detector = new PatternDetector();
    const pattern = createCodePattern('Test', 'Desc', 'When');
    detector.learnPattern(pattern);

    expect(detector.getPattern(pattern.id)?.usageCount).toBe(0);

    detector.recordPatternUsage(pattern.id);
    detector.recordPatternUsage(pattern.id);

    expect(detector.getPattern(pattern.id)?.usageCount).toBe(2);
  });

  test('deletes pattern', () => {
    const detector = new PatternDetector();
    const pattern = createCodePattern('Test', 'Desc', 'When');
    detector.learnPattern(pattern);

    expect(detector.getPattern(pattern.id)).toBeDefined();

    const deleted = detector.deletePattern(pattern.id);
    expect(deleted).toBe(true);
    expect(detector.getPattern(pattern.id)).toBeUndefined();
  });

  test('exports and loads patterns', () => {
    const detector1 = new PatternDetector();
    const pattern = createCodePattern('Test', 'Desc', 'When');
    detector1.learnPattern(pattern);

    const exported = detector1.exportPatterns();
    expect(exported).toHaveLength(1);

    const detector2 = new PatternDetector();
    detector2.loadPatterns(exported);

    expect(detector2.getPattern(pattern.id)).toBeDefined();
  });

  test('creates builtin patterns', () => {
    const builtins = createBuiltinPatterns();

    expect(builtins.length).toBeGreaterThan(0);
    for (const pattern of builtins) {
      expect(pattern.id).toBeDefined();
      expect(pattern.name).toBeDefined();
      expect(pattern.description).toBeDefined();
      expect(pattern.whenToUse).toBeDefined();
    }
  });
});

// ============================================================================
// RELATIONSHIP TESTS
// ============================================================================

describe('Relationship Tracker', () => {
  test('adds relationship', () => {
    const tracker = new RelationshipTracker();
    const rel = createFileRelationship(
      ['src/a.ts', 'src/b.ts'],
      RelationType.ImportsDependency,
      'a imports b'
    );

    tracker.addRelationship(rel);

    const stored = tracker.getRelationship(rel.id);
    expect(stored).toBeDefined();
    expect(stored?.files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  test('gets related files', () => {
    const tracker = new RelationshipTracker();
    const rel = createFileRelationship(
      ['src/main.ts', 'src/utils.ts'],
      RelationType.ImportsDependency,
      'main imports utils'
    );
    tracker.addRelationship(rel);

    const related = tracker.getRelatedFiles('src/main.ts');
    expect(related.some(r => r.path === 'src/utils.ts')).toBe(true);
  });

  test('builds relationship graph', () => {
    const tracker = new RelationshipTracker();

    tracker.addRelationship(
      createFileRelationship(
        ['src/a.ts', 'src/b.ts'],
        RelationType.ImportsDependency,
        'a imports b'
      )
    );
    tracker.addRelationship(
      createFileRelationship(
        ['src/b.ts', 'src/c.ts'],
        RelationType.ImportsDependency,
        'b imports c'
      )
    );

    const graph = tracker.buildGraph();

    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.metadata.nodeCount).toBe(3);
    expect(graph.metadata.edgeCount).toBe(2);
  });

  test('deletes relationship', () => {
    const tracker = new RelationshipTracker();
    const rel = createFileRelationship(
      ['src/a.ts', 'src/b.ts'],
      RelationType.ImportsDependency,
      'test'
    );
    tracker.addRelationship(rel);

    expect(tracker.getRelationship(rel.id)).toBeDefined();

    const deleted = tracker.deleteRelationship(rel.id);
    expect(deleted).toBe(true);
    expect(tracker.getRelationship(rel.id)).toBeUndefined();
  });

  test('gets relationships by type', () => {
    const tracker = new RelationshipTracker();

    tracker.addRelationship(
      createFileRelationship(['a.ts', 'b.ts'], RelationType.ImportsDependency, 'import')
    );
    tracker.addRelationship(
      createFileRelationship(['c.ts', 'd.ts'], RelationType.TestsImplementation, 'tests')
    );
    tracker.addRelationship(
      createFileRelationship(['e.ts', 'f.ts'], RelationType.ImportsDependency, 'import')
    );

    const imports = tracker.getRelationshipsByType(RelationType.ImportsDependency);
    expect(imports).toHaveLength(2);

    const tests = tracker.getRelationshipsByType(RelationType.TestsImplementation);
    expect(tests).toHaveLength(1);
  });

  test('updates relationship strength', () => {
    const tracker = new RelationshipTracker();
    const rel = createFileRelationship(['a.ts', 'b.ts'], RelationType.FrequentCochange, 'cochange', {
      strength: 0.5,
    });
    tracker.addRelationship(rel);

    tracker.updateStrength(rel.id, 0.2);
    expect(tracker.getRelationship(rel.id)?.strength).toBe(0.7);

    tracker.updateStrength(rel.id, 0.5);
    expect(tracker.getRelationship(rel.id)?.strength).toBe(1.0); // Clamped to 1

    tracker.updateStrength(rel.id, -1.5);
    expect(tracker.getRelationship(rel.id)?.strength).toBe(0); // Clamped to 0
  });

  test('exports and loads relationships', () => {
    const tracker1 = new RelationshipTracker();
    const rel = createFileRelationship(['a.ts', 'b.ts'], RelationType.SharedDomain, 'same domain');
    tracker1.addRelationship(rel);

    const exported = tracker1.exportRelationships();
    expect(exported).toHaveLength(1);

    const tracker2 = new RelationshipTracker();
    tracker2.loadRelationships(exported);

    expect(tracker2.getRelationship(rel.id)).toBeDefined();
  });

  test('gets hub files', () => {
    const tracker = new RelationshipTracker();

    // Create a hub file connected to many others
    for (let i = 0; i < 5; i++) {
      tracker.addRelationship(
        createFileRelationship(
          ['src/hub.ts', `src/module${i}.ts`],
          RelationType.ImportsDependency,
          'import'
        )
      );
    }

    const hubs = tracker.getHubFiles(3);

    expect(hubs.length).toBeGreaterThan(0);
    expect(hubs[0]?.path).toBe('src/hub.ts');
    expect(hubs[0]?.degree).toBe(5);
  });

  test('records coedits', () => {
    const tracker = new RelationshipTracker();

    // Record multiple coedits
    for (let i = 0; i < 5; i++) {
      tracker.recordCoedit(['src/a.ts', 'src/b.ts']);
    }

    // Finalize should create relationship
    tracker.finalizeSession();

    const cochanges = tracker.getRelationshipsByType(RelationType.FrequentCochange);
    expect(cochanges.length).toBeGreaterThan(0);
  });
});
