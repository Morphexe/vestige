/**
 * Context Capture Module
 *
 * This module captures the current working context - what branch you're on,
 * what files you're editing, what the project structure looks like. This
 * context is critical for:
 *
 * - Storing memories with full context for later retrieval
 * - Providing relevant suggestions based on current work
 * - Maintaining continuity across sessions
 *
 * Detection is now optional - import the detection module to enable it:
 * ```typescript
 * import { ContextCapture } from '@vestige/core';
 * import { createDetector } from '@vestige/core/codebase/detection';
 *
 * const capture = new ContextCapture('/path/to/project', {
 *   detector: createDetector()
 * });
 * ```
 */

import * as fs from 'fs';
import * as path from 'path';

import { nullDetectionStrategy, type DetectionStrategy } from './detection/types.js';

// ============================================================================
// PROJECT TYPE DETECTION
// ============================================================================

/** Detected project type based on files present */
export enum ProjectType {
  Rust = 'rust',
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
  Go = 'go',
  Java = 'java',
  Kotlin = 'kotlin',
  Swift = 'swift',
  CSharp = 'csharp',
  Cpp = 'cpp',
  Ruby = 'ruby',
  Php = 'php',
  Unknown = 'unknown',
}

/** Get file extensions for a project type */
export function getProjectExtensions(type: ProjectType): string[] {
  switch (type) {
    case ProjectType.Rust:
      return ['rs'];
    case ProjectType.TypeScript:
      return ['ts', 'tsx'];
    case ProjectType.JavaScript:
      return ['js', 'jsx'];
    case ProjectType.Python:
      return ['py'];
    case ProjectType.Go:
      return ['go'];
    case ProjectType.Java:
      return ['java'];
    case ProjectType.Kotlin:
      return ['kt', 'kts'];
    case ProjectType.Swift:
      return ['swift'];
    case ProjectType.CSharp:
      return ['cs'];
    case ProjectType.Cpp:
      return ['cpp', 'cc', 'cxx', 'c', 'h', 'hpp'];
    case ProjectType.Ruby:
      return ['rb'];
    case ProjectType.Php:
      return ['php'];
    default:
      return [];
  }
}

/** Get the language name for a project type */
export function getLanguageName(type: ProjectType): string {
  switch (type) {
    case ProjectType.Rust:
      return 'Rust';
    case ProjectType.TypeScript:
      return 'TypeScript';
    case ProjectType.JavaScript:
      return 'JavaScript';
    case ProjectType.Python:
      return 'Python';
    case ProjectType.Go:
      return 'Go';
    case ProjectType.Java:
      return 'Java';
    case ProjectType.Kotlin:
      return 'Kotlin';
    case ProjectType.Swift:
      return 'Swift';
    case ProjectType.CSharp:
      return 'C#';
    case ProjectType.Cpp:
      return 'C++';
    case ProjectType.Ruby:
      return 'Ruby';
    case ProjectType.Php:
      return 'PHP';
    default:
      return 'Unknown';
  }
}

// ============================================================================
// FRAMEWORK DETECTION
// ============================================================================

/** Known frameworks that can be detected */
export enum Framework {
  // Rust
  Tauri = 'tauri',
  Actix = 'actix',
  Axum = 'axum',
  Rocket = 'rocket',
  Tokio = 'tokio',
  Diesel = 'diesel',
  SeaOrm = 'sea_orm',

  // JavaScript/TypeScript
  React = 'react',
  Vue = 'vue',
  Angular = 'angular',
  Svelte = 'svelte',
  NextJs = 'nextjs',
  NuxtJs = 'nuxtjs',
  Express = 'express',
  NestJs = 'nestjs',
  Deno = 'deno',
  Bun = 'bun',

  // Python
  Django = 'django',
  Flask = 'flask',
  FastApi = 'fastapi',
  Pytest = 'pytest',
  Poetry = 'poetry',

  // Other
  Spring = 'spring',
  Rails = 'rails',
  Laravel = 'laravel',
  DotNet = 'dotnet',
}

/** Get the display name for a framework */
export function getFrameworkName(framework: Framework): string {
  switch (framework) {
    case Framework.Tauri:
      return 'Tauri';
    case Framework.Actix:
      return 'Actix';
    case Framework.Axum:
      return 'Axum';
    case Framework.Rocket:
      return 'Rocket';
    case Framework.Tokio:
      return 'Tokio';
    case Framework.Diesel:
      return 'Diesel';
    case Framework.SeaOrm:
      return 'SeaORM';
    case Framework.React:
      return 'React';
    case Framework.Vue:
      return 'Vue';
    case Framework.Angular:
      return 'Angular';
    case Framework.Svelte:
      return 'Svelte';
    case Framework.NextJs:
      return 'Next.js';
    case Framework.NuxtJs:
      return 'Nuxt.js';
    case Framework.Express:
      return 'Express';
    case Framework.NestJs:
      return 'NestJS';
    case Framework.Deno:
      return 'Deno';
    case Framework.Bun:
      return 'Bun';
    case Framework.Django:
      return 'Django';
    case Framework.Flask:
      return 'Flask';
    case Framework.FastApi:
      return 'FastAPI';
    case Framework.Pytest:
      return 'Pytest';
    case Framework.Poetry:
      return 'Poetry';
    case Framework.Spring:
      return 'Spring';
    case Framework.Rails:
      return 'Rails';
    case Framework.Laravel:
      return 'Laravel';
    case Framework.DotNet:
      return '.NET';
  }
}

// ============================================================================
// WORKING CONTEXT
// ============================================================================

/** Git context information */
export interface GitContextInfo {
  currentBranch: string;
  headCommit: string;
  uncommittedChanges: string[];
  stagedChanges: string[];
  hasUncommitted: boolean;
  isClean: boolean;
}

/** Complete working context for memory storage */
export interface WorkingContext {
  /** Git context (branch, commits, changes) */
  git: GitContextInfo | null;
  /** Currently active file (e.g., file being edited) */
  activeFile: string | null;
  /** Project type (Rust, TypeScript, etc.) */
  projectType: ProjectType;
  /** Multiple project types if mixed */
  projectTypes: ProjectType[];
  /** Detected frameworks */
  frameworks: Framework[];
  /** Project name (from cargo.toml, package.json, etc.) */
  projectName: string | null;
  /** Project root directory */
  projectRoot: string;
  /** When this context was captured */
  capturedAt: Date;
  /** Recent files (for context) */
  recentFiles: string[];
  /** Key configuration files found */
  configFiles: string[];
}

/** Context specific to a single file */
export interface FileContext {
  /** Path to the file */
  path: string;
  /** Detected language */
  language: string | null;
  /** File extension */
  extension: string | null;
  /** Parent directory */
  directory: string;
  /** Related files (imports, tests, etc.) */
  relatedFiles: string[];
  /** Whether the file has uncommitted changes */
  hasChanges: boolean;
  /** Last modified time */
  lastModified: Date | null;
  /** Whether it's a test file */
  isTestFile: boolean;
  /** Module/package this file belongs to */
  module: string | null;
}

// ============================================================================
// CONTEXT CAPTURE
// ============================================================================

/**
 * Options for ContextCapture
 */
export interface ContextCaptureOptions {
  /**
   * Detection strategy for project type and framework detection.
   * If not provided, detection returns Unknown/empty results.
   *
   * To enable detection, import and pass a detector:
   * ```typescript
   * import { createDetector } from '@vestige/core/codebase/detection';
   * const capture = new ContextCapture(root, { detector: createDetector() });
   * ```
   */
  detector?: DetectionStrategy;
}

/**
 * Context Capture
 *
 * Captures and manages working context for a project.
 *
 * By default, project type and framework detection is disabled.
 * To enable detection, provide a detector via options or setDetector():
 *
 * ```typescript
 * import { createDetector } from '@vestige/core/codebase/detection';
 *
 * // Via constructor
 * const capture = new ContextCapture(root, { detector: createDetector() });
 *
 * // Via late injection
 * const capture = new ContextCapture(root);
 * capture.setDetector(createDetector());
 * ```
 */
export class ContextCapture {
  private projectRoot: string;
  private activeFiles: string[] = [];
  private detector: DetectionStrategy;

  constructor(projectRoot: string, options?: ContextCaptureOptions) {
    this.projectRoot = projectRoot;
    this.detector = options?.detector ?? nullDetectionStrategy;
  }

  /**
   * Set or replace the detection strategy.
   * Useful for late injection when the detector is loaded asynchronously.
   */
  setDetector(detector: DetectionStrategy): void {
    this.detector = detector;
  }

  /** Set the currently active files */
  setActiveFiles(files: string[]): void {
    this.activeFiles = files;
  }

  /** Add an active file */
  addActiveFile(file: string): void {
    if (!this.activeFiles.includes(file)) {
      this.activeFiles.push(file);
    }
  }

  /** Remove an active file */
  removeActiveFile(file: string): void {
    this.activeFiles = this.activeFiles.filter(f => f !== file);
  }

  /** Capture the full working context */
  capture(): WorkingContext {
    const detection = this.detector.detect(this.projectRoot);
    const projectTypes = detection.projectTypes;
    const projectType = projectTypes.length === 1 ? projectTypes[0]! : ProjectType.Unknown;

    return {
      git: null, // Git context requires async operations or external library
      activeFile: this.activeFiles[0] ?? null,
      projectType,
      projectTypes,
      frameworks: detection.frameworks,
      projectName: detection.projectName,
      projectRoot: this.projectRoot,
      capturedAt: new Date(),
      recentFiles: [...this.activeFiles],
      configFiles: detection.configFiles,
    };
  }

  /** Get context specific to a file */
  contextForFile(filePath: string): FileContext {
    const ext = path.extname(filePath).slice(1);
    const language = this.extensionToLanguage(ext);
    const directory = path.dirname(filePath);
    const relatedFiles = this.findRelatedFiles(filePath);
    const isTestFile = this.isTestFile(filePath);
    const module = this.detectModule(filePath);

    let lastModified: Date | null = null;
    try {
      const stats = fs.statSync(filePath);
      lastModified = stats.mtime;
    } catch {
      // File might not exist
    }

    return {
      path: filePath,
      language,
      extension: ext || null,
      directory,
      relatedFiles,
      hasChanges: false, // Would need git integration
      lastModified,
      isTestFile,
      module,
    };
  }

  /** Find files related to a given file */
  private findRelatedFiles(filePath: string): string[] {
    const related: string[] = [];
    const fileStem = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath).slice(1);
    const directory = path.dirname(filePath);

    // Test file patterns
    const testPatterns = [
      `${fileStem}.test`,
      `${fileStem}_test`,
      `${fileStem}.spec`,
      `test_${fileStem}`,
    ];

    // Check same directory for test files
    try {
      const entries = fs.readdirSync(directory);
      for (const entry of entries) {
        const entryStem = path.basename(entry, path.extname(entry));
        for (const pattern of testPatterns) {
          if (entryStem.toLowerCase() === pattern.toLowerCase()) {
            related.push(path.join(directory, entry));
            break;
          }
        }
      }
    } catch {
      // Directory might not be readable
    }

    // Check tests/ directory
    const testDirs = ['tests', 'test', '__tests__', 'spec'];
    for (const testDir of testDirs) {
      const testPath = path.join(this.projectRoot, testDir);
      if (fs.existsSync(testPath)) {
        try {
          const entries = fs.readdirSync(testPath);
          for (const entry of entries) {
            const entryStem = path.basename(entry, path.extname(entry));
            if (entryStem.includes(fileStem)) {
              related.push(path.join(testPath, entry));
            }
          }
        } catch {
          // Directory might not be readable
        }
      }
    }

    // For Rust, look for mod.rs in same directory
    if (ext === 'rs') {
      const modPath = path.join(directory, 'mod.rs');
      if (fs.existsSync(modPath) && modPath !== filePath) {
        related.push(modPath);
      }

      // Look for lib.rs or main.rs at project root
      const libPath = path.join(this.projectRoot, 'src/lib.rs');
      const mainPath = path.join(this.projectRoot, 'src/main.rs');

      if (fs.existsSync(libPath) && libPath !== filePath) {
        related.push(libPath);
      }
      if (fs.existsSync(mainPath) && mainPath !== filePath) {
        related.push(mainPath);
      }
    }

    // Deduplicate
    return [...new Set(related)];
  }

  /** Check if a file is a test file */
  private isTestFile(filePath: string): boolean {
    const pathStr = filePath.toLowerCase();
    const fileName = path.basename(filePath).toLowerCase();

    return (
      pathStr.includes('test') ||
      pathStr.includes('spec') ||
      pathStr.includes('__tests__') ||
      fileName.startsWith('test_') ||
      fileName.endsWith('_test.rs') ||
      fileName.endsWith('.test.ts') ||
      fileName.endsWith('.test.tsx') ||
      fileName.endsWith('.test.js') ||
      fileName.endsWith('.spec.ts') ||
      fileName.endsWith('.spec.js')
    );
  }

  /** Detect the module a file belongs to */
  private detectModule(filePath: string): string | null {
    const ext = path.extname(filePath).slice(1);

    // For Rust, use the parent directory name relative to src/
    if (ext === 'rs') {
      const relative = path.relative(this.projectRoot, filePath);
      if (relative.startsWith('src/')) {
        const srcRelative = relative.slice(4);
        const components = path.dirname(srcRelative).split(path.sep).filter(c => c && c !== '.');
        if (components.length > 0) {
          return components.join('::');
        }
      }
    }

    // For TypeScript/JavaScript, use the parent directory
    if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
      let relative = path.relative(this.projectRoot, filePath);

      // Skip src/ or lib/ prefix
      if (relative.startsWith('src/')) {
        relative = relative.slice(4);
      } else if (relative.startsWith('lib/')) {
        relative = relative.slice(4);
      }

      const parentDir = path.dirname(relative);
      if (parentDir && parentDir !== '.') {
        return parentDir.replace(/\//g, '.');
      }
    }

    return null;
  }

  /** Convert file extension to language name */
  private extensionToLanguage(ext: string): string | null {
    const mapping: Record<string, string> = {
      rs: 'rust',
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      go: 'go',
      java: 'java',
      kt: 'kotlin',
      kts: 'kotlin',
      swift: 'swift',
      cs: 'csharp',
      cpp: 'cpp',
      cc: 'cpp',
      cxx: 'cpp',
      c: 'cpp',
      h: 'cpp',
      hpp: 'cpp',
      rb: 'ruby',
      php: 'php',
      sql: 'sql',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      md: 'markdown',
    };

    return mapping[ext.toLowerCase()] ?? null;
  }
}
