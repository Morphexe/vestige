/**
 * Pattern Detection Module
 *
 * This module handles:
 * - Learning new patterns from user teaching
 * - Detecting known patterns in code
 * - Suggesting relevant patterns based on context
 *
 * Patterns are the reusable pieces of knowledge that make Vestige smarter
 * over time. As the user teaches patterns, Vestige becomes more helpful
 * for that specific codebase.
 */

import { nanoid } from 'nanoid';
import { type CodePattern, createCodePattern } from './types.js';
import { type WorkingContext, ProjectType, getFrameworkName } from './context.js';

// ============================================================================
// PATTERN MATCH
// ============================================================================

/** Location where a pattern was detected */
export interface PatternLocation {
  /** File where pattern was found */
  file: string;
  /** Starting line (1-indexed) */
  startLine: number;
  /** Ending line (1-indexed) */
  endLine: number;
  /** Code snippet that matched */
  snippet: string;
}

/** A detected pattern match in code */
export interface PatternMatch {
  /** The pattern that was matched */
  pattern: CodePattern;
  /** Confidence of the match (0.0 - 1.0) */
  confidence: number;
  /** Location in the code where pattern was detected */
  location: PatternLocation | null;
  /** Suggestions based on this pattern match */
  suggestions: string[];
}

// ============================================================================
// PATTERN SUGGESTION
// ============================================================================

/** A suggested pattern based on context */
export interface PatternSuggestion {
  /** The suggested pattern */
  pattern: CodePattern;
  /** Why this pattern is being suggested */
  reason: string;
  /** Relevance score (0.0 - 1.0) */
  relevance: number;
  /** Example of how to apply this pattern */
  example: string | null;
}

// ============================================================================
// PATTERN DETECTOR
// ============================================================================

/**
 * Pattern Detector
 *
 * Detects and manages code patterns.
 */
export class PatternDetector {
  /** Stored patterns indexed by ID */
  private patterns = new Map<string, CodePattern>();
  /** Patterns indexed by language for faster lookup */
  private patternsByLanguage = new Map<string, string[]>();
  /** Pattern keywords for text matching */
  private patternKeywords = new Map<string, string[]>();

  /**
   * Learn a new pattern from user teaching
   */
  learnPattern(pattern: CodePattern): string {
    if (!pattern.name) {
      throw new Error('Pattern name cannot be empty');
    }
    if (!pattern.description) {
      throw new Error('Pattern description cannot be empty');
    }

    const id = pattern.id;

    // Index by language
    if (pattern.language) {
      const langLower = pattern.language.toLowerCase();
      const ids = this.patternsByLanguage.get(langLower) ?? [];
      ids.push(id);
      this.patternsByLanguage.set(langLower, ids);
    }

    // Extract keywords for matching
    const keywords = this.extractKeywords(pattern);
    this.patternKeywords.set(id, keywords);

    // Store the pattern
    this.patterns.set(id, pattern);

    return id;
  }

  /** Extract keywords from a pattern for matching */
  private extractKeywords(pattern: CodePattern): string[] {
    const keywords: string[] = [];

    // Words from name
    keywords.push(
      ...pattern.name
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
    );

    // Words from description
    keywords.push(
      ...pattern.description
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
    );

    // Tags
    keywords.push(...pattern.tags.map(t => t.toLowerCase()));

    // Deduplicate
    return [...new Set(keywords)].sort();
  }

  /** Get a pattern by ID */
  getPattern(id: string): CodePattern | undefined {
    return this.patterns.get(id);
  }

  /** Get all patterns */
  getAllPatterns(): CodePattern[] {
    return Array.from(this.patterns.values());
  }

  /** Get patterns for a specific language */
  getPatternsForLanguage(language: string): CodePattern[] {
    const languageLower = language.toLowerCase();
    const ids = this.patternsByLanguage.get(languageLower) ?? [];
    return ids.map(id => this.patterns.get(id)).filter((p): p is CodePattern => p !== undefined);
  }

  /** Detect if current code matches known patterns */
  detectPatterns(code: string, language: string): PatternMatch[] {
    const matches: PatternMatch[] = [];
    const codeLower = code.toLowerCase();

    // Get relevant patterns for this language
    const relevantPatterns = [
      ...this.getPatternsForLanguage(language),
      ...this.getPatternsForLanguage('*'),
    ];

    for (const pattern of relevantPatterns) {
      const confidence = this.calculateMatchConfidence(code, codeLower, pattern);
      if (confidence !== null && confidence >= 0.3) {
        matches.push({
          pattern,
          confidence,
          location: null, // Would need line-level analysis
          suggestions: this.generateSuggestions(pattern),
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    return matches;
  }

  /** Calculate confidence that code matches a pattern */
  private calculateMatchConfidence(
    _code: string,
    codeLower: string,
    pattern: CodePattern
  ): number | null {
    const keywords = this.patternKeywords.get(pattern.id);

    if (!keywords || keywords.length === 0) {
      return null;
    }

    // Count keyword matches
    const matchCount = keywords.filter(kw => codeLower.includes(kw)).length;

    if (matchCount === 0) {
      return null;
    }

    // Calculate confidence based on keyword match ratio
    let confidence = matchCount / keywords.length;

    // Boost confidence if example code matches
    if (pattern.exampleCode && codeLower.includes(pattern.exampleCode.toLowerCase())) {
      confidence = Math.min(confidence + 0.3, 1.0);
    }

    return confidence;
  }

  /** Generate suggestions based on a matched pattern */
  private generateSuggestions(pattern: CodePattern): string[] {
    const suggestions: string[] = [];

    // Add the when_to_use guidance
    suggestions.push(`Consider: ${pattern.whenToUse}`);

    // Add when_not_to_use if present
    if (pattern.whenNotToUse) {
      suggestions.push(`Note: ${pattern.whenNotToUse}`);
    }

    return suggestions;
  }

  /** Suggest patterns based on current context */
  suggestPatterns(context: WorkingContext): PatternSuggestion[] {
    const suggestions: PatternSuggestion[] = [];

    // Get the language for the current context
    const language = this.projectTypeToLanguage(context.projectType);

    // Get patterns for this language
    const languagePatterns = this.getPatternsForLanguage(language);

    // Score patterns based on context relevance
    for (const pattern of languagePatterns) {
      const relevance = this.calculateContextRelevance(pattern, context);

      if (relevance >= 0.2) {
        const reason = this.generateSuggestionReason(pattern, context);

        suggestions.push({
          pattern,
          reason,
          relevance,
          example: pattern.exampleCode || null,
        });
      }
    }

    // Sort by relevance
    suggestions.sort((a, b) => b.relevance - a.relevance);

    return suggestions;
  }

  /** Convert project type to language string */
  private projectTypeToLanguage(type: ProjectType): string {
    switch (type) {
      case ProjectType.Rust:
        return 'rust';
      case ProjectType.TypeScript:
        return 'typescript';
      case ProjectType.JavaScript:
        return 'javascript';
      case ProjectType.Python:
        return 'python';
      case ProjectType.Go:
        return 'go';
      case ProjectType.Java:
        return 'java';
      case ProjectType.Kotlin:
        return 'kotlin';
      case ProjectType.Swift:
        return 'swift';
      case ProjectType.CSharp:
        return 'csharp';
      case ProjectType.Cpp:
        return 'cpp';
      case ProjectType.Ruby:
        return 'ruby';
      case ProjectType.Php:
        return 'php';
      default:
        return '*';
    }
  }

  /** Calculate how relevant a pattern is to the current context */
  private calculateContextRelevance(pattern: CodePattern, context: WorkingContext): number {
    let score = 0;

    // Check if pattern files overlap with active files
    if (context.activeFile) {
      for (const exampleFile of pattern.exampleFiles) {
        if (this.pathsRelated(context.activeFile, exampleFile)) {
          score += 0.3;
          break;
        }
      }
    }

    // Check framework relevance
    for (const framework of context.frameworks) {
      const frameworkName = getFrameworkName(framework).toLowerCase();
      if (
        pattern.tags.some(t => t.toLowerCase() === frameworkName) ||
        pattern.description.toLowerCase().includes(frameworkName)
      ) {
        score += 0.2;
      }
    }

    // Check recent usage
    if (pattern.usageCount > 0) {
      score += Math.min(pattern.usageCount / 100, 0.3);
    }

    return Math.min(score, 1.0);
  }

  /** Check if two paths are related (same directory, similar names, etc.) */
  private pathsRelated(a: string, b: string): boolean {
    const aParts = a.split('/');
    const bParts = b.split('/');

    // Same parent directory
    const aDir = aParts.slice(0, -1).join('/');
    const bDir = bParts.slice(0, -1).join('/');
    if (aDir === bDir) {
      return true;
    }

    // Similar file names
    const aStem = (aParts[aParts.length - 1] ?? '').replace(/\.[^.]+$/, '').toLowerCase();
    const bStem = (bParts[bParts.length - 1] ?? '').replace(/\.[^.]+$/, '').toLowerCase();

    if (aStem.includes(bStem) || bStem.includes(aStem)) {
      return true;
    }

    return false;
  }

  /** Generate a reason for suggesting a pattern */
  private generateSuggestionReason(pattern: CodePattern, context: WorkingContext): string {
    const reasons: string[] = [];

    // Language match
    if (pattern.language) {
      reasons.push(`Relevant for ${pattern.language} code`);
    }

    // Framework match
    for (const framework of context.frameworks) {
      const frameworkName = getFrameworkName(framework);
      if (
        pattern.tags.some(t => t.toLowerCase() === frameworkName.toLowerCase()) ||
        pattern.description.toLowerCase().includes(frameworkName.toLowerCase())
      ) {
        reasons.push(`Used with ${frameworkName}`);
      }
    }

    // Usage count
    if (pattern.usageCount > 5) {
      reasons.push(`Commonly used (${pattern.usageCount} times)`);
    }

    return reasons.length > 0 ? reasons.join('; ') : 'May be applicable in this context';
  }

  /** Update pattern usage count */
  recordPatternUsage(patternId: string): boolean {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.usageCount++;
      return true;
    }
    return false;
  }

  /** Delete a pattern */
  deletePattern(patternId: string): boolean {
    if (this.patterns.delete(patternId)) {
      // Clean up indexes
      for (const [, ids] of this.patternsByLanguage) {
        const idx = ids.indexOf(patternId);
        if (idx !== -1) {
          ids.splice(idx, 1);
        }
      }
      this.patternKeywords.delete(patternId);
      return true;
    }
    return false;
  }

  /** Search patterns by query */
  searchPatterns(query: string): CodePattern[] {
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);

    const scored: Array<{ pattern: CodePattern; score: number }> = [];

    for (const pattern of this.patterns.values()) {
      const nameMatch = pattern.name.toLowerCase().includes(queryLower);
      const descMatch = pattern.description.toLowerCase().includes(queryLower);
      const tagMatch = pattern.tags.some(t => t.toLowerCase().includes(queryLower));

      // Count word matches
      const keywords = this.patternKeywords.get(pattern.id) ?? [];
      const wordMatches = queryWords.filter(w => keywords.some(kw => kw.includes(w))).length;

      let score = 0;
      if (nameMatch) {
        score = 1.0;
      } else if (tagMatch) {
        score = 0.8;
      } else if (descMatch) {
        score = 0.6;
      } else if (wordMatches > 0) {
        score = 0.4 * (wordMatches / queryWords.length);
      }

      if (score > 0) {
        scored.push({ pattern, score });
      }
    }

    // Sort by score
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.pattern);
  }

  /** Load patterns from storage */
  loadPatterns(patterns: CodePattern[]): void {
    for (const pattern of patterns) {
      this.learnPattern(pattern);
    }
  }

  /** Export all patterns for storage */
  exportPatterns(): CodePattern[] {
    return Array.from(this.patterns.values());
  }

  /** Clear all patterns */
  clear(): void {
    this.patterns.clear();
    this.patternsByLanguage.clear();
    this.patternKeywords.clear();
  }
}

// ============================================================================
// BUILT-IN PATTERNS
// ============================================================================

/** Create built-in patterns for common coding patterns */
export function createBuiltinPatterns(): CodePattern[] {
  return [
    // Rust Error Handling Pattern
    createCodePattern(
      'Rust Error Handling with thiserror',
      'Use thiserror for defining custom error types with derive macros',
      'When defining domain-specific error types in Rust',
      {
        language: 'rust',
        exampleCode: `#[derive(Debug, thiserror::Error)]
pub enum MyError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Parse error: {0}")]
    Parse(String),
}

pub type Result<T> = std::result::Result<T, MyError>;`,
        whenNotToUse: 'For simple one-off errors, anyhow might be simpler',
        tags: ['error-handling', 'rust'],
        relatedPatterns: ['builtin-rust-result'],
      }
    ),

    // TypeScript React Component Pattern
    createCodePattern(
      'React Functional Component',
      'Modern React functional component with TypeScript',
      'For all new React components',
      {
        language: 'typescript',
        exampleCode: `interface Props {
    title: string;
    onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
    return (
        <div onClick={onClick}>
            <h1>{title}</h1>
        </div>
    );
}`,
        whenNotToUse: 'Class components are rarely needed in modern React',
        tags: ['react', 'typescript', 'component'],
      }
    ),

    // Repository Pattern
    createCodePattern(
      'Repository Pattern',
      'Abstract data access behind a repository interface',
      'When you need to decouple domain logic from data access',
      {
        language: 'rust',
        exampleCode: `pub trait UserRepository {
    fn find_by_id(&self, id: &str) -> Result<Option<User>>;
    fn save(&self, user: &User) -> Result<()>;
    fn delete(&self, id: &str) -> Result<()>;
}

pub struct SqliteUserRepository {
    conn: Connection,
}

impl UserRepository for SqliteUserRepository {
    // Implementation...
}`,
        whenNotToUse: 'For simple CRUD with no complex domain logic',
        tags: ['architecture', 'data-access'],
      }
    ),
  ];
}
