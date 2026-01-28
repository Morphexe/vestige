/**
 * Adaptive Embedding Strategy Module
 *
 * Use DIFFERENT embedding strategies for different content types.
 * Natural language, code, technical documentation, and mixed content
 * all have different optimal embedding approaches.
 *
 * Why Adaptive?
 * - Natural Language: General-purpose models like nomic-embed-text
 * - Code: Code-specific preprocessing and embedding
 * - Technical: Domain-specific vocabulary handling
 * - Mixed: Multi-modal approaches for content with code and text
 */

import { nanoid } from 'nanoid';

/** Default embedding dimensions (nomic-embed-text: 768d) */
export const DEFAULT_DIMENSIONS = 768;

/** Code embedding dimensions */
export const CODE_DIMENSIONS = 768;

/** Supported programming languages for code embeddings */
export enum Language {
  Rust = 'rust',
  Python = 'python',
  JavaScript = 'javascript',
  TypeScript = 'typescript',
  Go = 'go',
  Java = 'java',
  Cpp = 'cpp',
  CSharp = 'csharp',
  Ruby = 'ruby',
  Swift = 'swift',
  Kotlin = 'kotlin',
  Sql = 'sql',
  Shell = 'shell',
  Web = 'web',
  Unknown = 'unknown',
}

/** Detect language from file extension */
export function languageFromExtension(ext: string): Language {
  const lower = ext.toLowerCase().replace('.', '');
  const mapping: Record<string, Language> = {
    rs: Language.Rust,
    py: Language.Python,
    js: Language.JavaScript,
    mjs: Language.JavaScript,
    cjs: Language.JavaScript,
    ts: Language.TypeScript,
    tsx: Language.TypeScript,
    go: Language.Go,
    java: Language.Java,
    c: Language.Cpp,
    cpp: Language.Cpp,
    cc: Language.Cpp,
    cxx: Language.Cpp,
    h: Language.Cpp,
    hpp: Language.Cpp,
    cs: Language.CSharp,
    rb: Language.Ruby,
    swift: Language.Swift,
    kt: Language.Kotlin,
    kts: Language.Kotlin,
    sql: Language.Sql,
    sh: Language.Shell,
    bash: Language.Shell,
    zsh: Language.Shell,
    html: Language.Web,
    css: Language.Web,
    scss: Language.Web,
    less: Language.Web,
  };
  return mapping[lower] ?? Language.Unknown;
}

/** Get keywords for a language */
export function getLanguageKeywords(language: Language): string[] {
  switch (language) {
    case Language.Rust:
      return ['fn', 'let', 'mut', 'impl', 'struct', 'enum', 'trait', 'pub', 'mod', 'use', 'async', 'await'];
    case Language.Python:
      return ['def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while', 'return', 'async', 'await'];
    case Language.JavaScript:
    case Language.TypeScript:
      return ['function', 'const', 'let', 'var', 'class', 'import', 'export', 'async', 'await', 'return'];
    case Language.Go:
      return ['func', 'package', 'import', 'type', 'struct', 'interface', 'go', 'chan', 'defer', 'return'];
    case Language.Java:
      return ['public', 'private', 'class', 'interface', 'extends', 'implements', 'static', 'void', 'return'];
    case Language.Cpp:
      return ['class', 'struct', 'namespace', 'template', 'virtual', 'public', 'private', 'protected', 'return'];
    case Language.CSharp:
      return ['class', 'interface', 'namespace', 'public', 'private', 'async', 'await', 'return', 'void'];
    case Language.Ruby:
      return ['def', 'class', 'module', 'end', 'if', 'elsif', 'else', 'do', 'return'];
    case Language.Swift:
      return ['func', 'class', 'struct', 'enum', 'protocol', 'var', 'let', 'guard', 'return'];
    case Language.Kotlin:
      return ['fun', 'class', 'object', 'interface', 'val', 'var', 'suspend', 'return'];
    case Language.Sql:
      return ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER'];
    case Language.Shell:
      return ['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac'];
    case Language.Web:
      return ['div', 'span', 'class', 'id', 'style', 'script', 'link'];
    default:
      return [];
  }
}

/** Types of content for embedding */
export enum ContentType {
  NaturalLanguage = 'natural_language',
  Code = 'code',
  Technical = 'technical',
  Mixed = 'mixed',
  Structured = 'structured',
  ErrorLog = 'error_log',
  Configuration = 'configuration',
}

/** Embedding strategy to use */
export enum EmbeddingStrategy {
  SentenceTransformer = 'sentence_transformer',
  CodeEmbedding = 'code_embedding',
  TechnicalEmbedding = 'technical_embedding',
  HybridEmbedding = 'hybrid_embedding',
  StructuredEmbedding = 'structured_embedding',
}

/** Get dimensions for strategy */
export function getStrategyDimensions(strategy: EmbeddingStrategy): number {
  switch (strategy) {
    case EmbeddingStrategy.SentenceTransformer:
      return DEFAULT_DIMENSIONS;
    case EmbeddingStrategy.CodeEmbedding:
      return CODE_DIMENSIONS;
    case EmbeddingStrategy.TechnicalEmbedding:
      return DEFAULT_DIMENSIONS;
    case EmbeddingStrategy.HybridEmbedding:
      return DEFAULT_DIMENSIONS;
    case EmbeddingStrategy.StructuredEmbedding:
      return DEFAULT_DIMENSIONS;
  }
}

/** Analysis results for content */
export interface ContentAnalysis {
  codeRatio: number;
  detectedLanguage: Language | null;
  isErrorLog: boolean;
  isStructured: boolean;
  isTechnical: boolean;
  wordCount: number;
  lineCount: number;
}

/** Check if a line looks like code */
function isCodeLine(line: string): boolean {
  const trimmed = line.trim();
  const patterns = [
    trimmed.includes('{') || trimmed.includes('}'),
    trimmed.includes('[') || trimmed.includes(']'),
    trimmed.endsWith(';'),
    trimmed.includes('()') || trimmed.includes('('),
    trimmed.includes('=>') || trimmed.includes('->') || trimmed.includes('::'),
    trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*'),
    trimmed.startsWith('    ') && (trimmed.includes('=') || trimmed.includes('.')),
    trimmed.startsWith('import ') || trimmed.startsWith('use ') || trimmed.startsWith('from '),
  ];
  return patterns.filter(p => p).length >= 2;
}

/** Detect code in content */
function detectCode(content: string, lines: string[]): { codeRatio: number; detectedLanguage: Language | null } {
  let codeIndicators = 0;
  let totalLines = 0;
  const languageScores = new Map<Language, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    totalLines++;

    if (isCodeLine(trimmed)) {
      codeIndicators++;
    }

    // Check for language keywords
    for (const lang of [Language.Rust, Language.Python, Language.JavaScript, Language.TypeScript, Language.Go, Language.Java]) {
      for (const keyword of getLanguageKeywords(lang)) {
        if (trimmed.includes(keyword)) {
          languageScores.set(lang, (languageScores.get(lang) ?? 0) + 1);
        }
      }
    }
  }

  const codeRatio = totalLines > 0 ? codeIndicators / totalLines : 0;

  let detectedLanguage: Language | null = null;
  let maxScore = 0;
  for (const [lang, score] of languageScores) {
    if (score >= 2 && score > maxScore) {
      maxScore = score;
      detectedLanguage = lang;
    }
  }

  return { codeRatio, detectedLanguage };
}

/** Check if content is an error log */
function isErrorLog(content: string): boolean {
  const patterns = [
    'error:', 'Error:', 'ERROR:',
    'exception', 'Exception', 'EXCEPTION',
    'stack trace', 'Traceback',
    'at line', 'line:', 'Line:',
    'panic', 'PANIC',
    'failed', 'Failed', 'FAILED',
  ];
  return patterns.filter(p => content.includes(p)).length >= 2;
}

/** Check if content is structured data */
function isStructured(content: string): boolean {
  const trimmed = content.trim();

  // JSON
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    return true;
  }

  // YAML-like
  const yamlCount = content.split('\n')
    .filter(l => l.trim().includes(': ') && !l.trim().startsWith('#'))
    .length;

  return yamlCount >= 3;
}

/** Check if content is technical */
function isTechnical(content: string): boolean {
  const indicators = [
    'API', 'endpoint', 'request', 'response', 'parameter',
    'argument', 'return', 'method', 'function', 'class',
    'configuration', 'setting', 'documentation', 'reference',
  ];
  const lower = content.toLowerCase();
  return indicators.filter(i => lower.includes(i.toLowerCase())).length >= 3;
}

/** Analyze content to determine its type */
export function analyzeContent(content: string): ContentAnalysis {
  const lines = content.split('\n');
  const lineCount = lines.length;
  const wordCount = content.split(/\s+/).length;

  const { codeRatio, detectedLanguage } = detectCode(content, lines);

  return {
    codeRatio,
    detectedLanguage,
    isErrorLog: isErrorLog(content),
    isStructured: isStructured(content),
    isTechnical: isTechnical(content),
    wordCount,
    lineCount,
  };
}

/** Detect content type from text */
export function detectContentType(content: string): { type: ContentType; language?: Language } {
  const analysis = analyzeContent(content);

  if (analysis.codeRatio > 0.7) {
    return {
      type: ContentType.Code,
      language: analysis.detectedLanguage ?? Language.Unknown,
    };
  } else if (analysis.codeRatio > 0.3) {
    return { type: ContentType.Mixed };
  } else if (analysis.isErrorLog) {
    return { type: ContentType.ErrorLog };
  } else if (analysis.isStructured) {
    return { type: ContentType.Structured };
  } else if (analysis.isTechnical) {
    return { type: ContentType.Technical };
  } else {
    return { type: ContentType.NaturalLanguage };
  }
}

/** Result of adaptive embedding */
export interface EmbeddingResult {
  embedding: number[];
  strategy: EmbeddingStrategy;
  contentType: ContentType;
  preprocessingApplied: string[];
}

/**
 * Adaptive Embedder
 *
 * Selects optimal embedding strategy based on content type.
 */
export class AdaptiveEmbedder {
  private strategyStats = new Map<string, number>();

  /**
   * Select the best embedding strategy for content type
   */
  selectStrategy(contentType: ContentType): EmbeddingStrategy {
    switch (contentType) {
      case ContentType.NaturalLanguage:
        return EmbeddingStrategy.SentenceTransformer;
      case ContentType.Code:
        return EmbeddingStrategy.CodeEmbedding;
      case ContentType.Technical:
        return EmbeddingStrategy.TechnicalEmbedding;
      case ContentType.Mixed:
        return EmbeddingStrategy.HybridEmbedding;
      case ContentType.Structured:
        return EmbeddingStrategy.StructuredEmbedding;
      case ContentType.ErrorLog:
        return EmbeddingStrategy.TechnicalEmbedding;
      case ContentType.Configuration:
        return EmbeddingStrategy.StructuredEmbedding;
    }
  }

  /**
   * Embed content using optimal strategy
   */
  embed(content: string, contentType: ContentType, language?: Language): EmbeddingResult {
    const strategy = this.selectStrategy(contentType);

    // Track usage
    const key = `${strategy}`;
    this.strategyStats.set(key, (this.strategyStats.get(key) ?? 0) + 1);

    // Preprocess
    const { processed, preprocessing } = this.preprocess(content, contentType, language);

    // Generate embedding
    const embedding = this.generateEmbedding(processed, strategy);

    return {
      embedding,
      strategy,
      contentType,
      preprocessingApplied: preprocessing,
    };
  }

  /**
   * Embed with automatic content type detection
   */
  embedAuto(content: string): EmbeddingResult {
    const detected = detectContentType(content);
    return this.embed(content, detected.type, detected.language);
  }

  /**
   * Preprocess content based on type
   */
  private preprocess(
    content: string,
    contentType: ContentType,
    language?: Language
  ): { processed: string; preprocessing: string[] } {
    const preprocessing: string[] = [];

    switch (contentType) {
      case ContentType.Code:
        const normalized = content.split('\n').map(l => l.trim()).join('\n');
        const withContext = `[${(language ?? Language.Unknown).toUpperCase()}] ${normalized}`;
        preprocessing.push('Whitespace normalization');
        preprocessing.push(`Language context added: ${language}`);
        return { processed: withContext, preprocessing };

      case ContentType.ErrorLog:
        const errorLines = content.split('\n')
          .filter(l => {
            const lower = l.toLowerCase();
            return lower.includes('error') || lower.includes('exception') ||
                   lower.includes('failed') || lower.includes('panic');
          })
          .map(l => l.trim())
          .join(' | ');
        preprocessing.push('Error line extraction');
        preprocessing.push('Key message isolation');
        return {
          processed: errorLines || content,
          preprocessing,
        };

      case ContentType.Structured:
        const flattened = content.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
          .join(' ');
        preprocessing.push('Structure flattening');
        preprocessing.push('Comment removal');
        return { processed: flattened, preprocessing };

      case ContentType.Mixed:
        const textParts: string[] = [];
        const codeParts: string[] = [];
        let inCodeBlock = false;

        for (const line of content.split('\n')) {
          if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
          }
          if (inCodeBlock || isCodeLine(line.trim())) {
            codeParts.push(line.trim());
          } else {
            textParts.push(line.trim());
          }
        }

        preprocessing.push('Code/text separation');
        preprocessing.push('Dual embedding');
        return {
          processed: `TEXT: ${textParts.join(' ')} CODE: ${codeParts.join(' ')}`,
          preprocessing,
        };

      default:
        preprocessing.push('Standard preprocessing');
        return { processed: content, preprocessing };
    }
  }

  /**
   * Generate a pseudo-embedding for testing
   * In production, this calls the actual embedding model
   */
  private generateEmbedding(content: string, strategy: EmbeddingStrategy): number[] {
    const dimensions = getStrategyDimensions(strategy);
    const embedding = new Array(dimensions).fill(0);
    const bytes = new TextEncoder().encode(content);

    // Simple hash-based pseudo-embedding
    for (let i = 0; i < bytes.length; i++) {
      const idx = i % dimensions;
      embedding[idx] += (bytes[i]! - 128) / 128;
    }

    // Normalize
    let magnitude = 0;
    for (const val of embedding) {
      magnitude += val * val;
    }
    magnitude = Math.sqrt(magnitude);

    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  /**
   * Get strategy usage statistics
   */
  getStats(): Map<string, number> {
    return new Map(this.strategyStats);
  }

  /**
   * Clear statistics
   */
  clearStats(): void {
    this.strategyStats.clear();
  }
}
