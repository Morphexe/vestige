/**
 * File System Detector
 *
 * Implements project/framework detection by inspecting files in the project root.
 * This module contains all the detection logic that was previously in context.ts.
 *
 * Import this module only when detection is needed - it will not be bundled
 * if the import is not present.
 */

import * as fs from 'fs';
import * as path from 'path';

import { ProjectType, Framework } from '../context.js';
import type { DetectionStrategy, DetectionResult } from './types.js';

/**
 * File system-based project and framework detector
 *
 * Detects project types and frameworks by examining:
 * - Configuration files (Cargo.toml, package.json, etc.)
 * - Directory structure (src/main/kotlin, etc.)
 * - Framework-specific markers (dependencies, config files)
 */
export class FileSystemDetector implements DetectionStrategy {
  /**
   * Detect project types, frameworks, and configuration
   * @param projectRoot - Root directory of the project
   * @returns Detection results
   */
  detect(projectRoot: string): DetectionResult {
    return {
      projectTypes: this.detectProjectTypes(projectRoot),
      frameworks: this.detectFrameworks(projectRoot),
      projectName: this.detectProjectName(projectRoot),
      configFiles: this.findConfigFiles(projectRoot),
    };
  }

  /** Detect project types based on files present */
  private detectProjectTypes(projectRoot: string): ProjectType[] {
    const detected: ProjectType[] = [];

    // Check for Rust
    if (this.fileExists(projectRoot, 'Cargo.toml')) {
      detected.push(ProjectType.Rust);
    }

    // Check for JavaScript/TypeScript
    if (this.fileExists(projectRoot, 'package.json')) {
      if (
        this.fileExists(projectRoot, 'tsconfig.json') ||
        this.fileExists(projectRoot, 'tsconfig.base.json')
      ) {
        detected.push(ProjectType.TypeScript);
      } else {
        detected.push(ProjectType.JavaScript);
      }
    }

    // Check for Python
    if (
      this.fileExists(projectRoot, 'pyproject.toml') ||
      this.fileExists(projectRoot, 'setup.py') ||
      this.fileExists(projectRoot, 'requirements.txt')
    ) {
      detected.push(ProjectType.Python);
    }

    // Check for Go
    if (this.fileExists(projectRoot, 'go.mod')) {
      detected.push(ProjectType.Go);
    }

    // Check for Java/Kotlin
    if (this.fileExists(projectRoot, 'pom.xml') || this.fileExists(projectRoot, 'build.gradle')) {
      if (
        this.dirExists(projectRoot, 'src/main/kotlin') ||
        this.fileExists(projectRoot, 'build.gradle.kts')
      ) {
        detected.push(ProjectType.Kotlin);
      } else {
        detected.push(ProjectType.Java);
      }
    }

    // Check for Swift
    if (this.fileExists(projectRoot, 'Package.swift')) {
      detected.push(ProjectType.Swift);
    }

    // Check for C#
    if (this.globExists(projectRoot, '*.csproj') || this.globExists(projectRoot, '*.sln')) {
      detected.push(ProjectType.CSharp);
    }

    // Check for Ruby
    if (this.fileExists(projectRoot, 'Gemfile')) {
      detected.push(ProjectType.Ruby);
    }

    // Check for PHP
    if (this.fileExists(projectRoot, 'composer.json')) {
      detected.push(ProjectType.Php);
    }

    return detected.length > 0 ? detected : [ProjectType.Unknown];
  }

  /** Detect frameworks used in the project */
  private detectFrameworks(projectRoot: string): Framework[] {
    const frameworks: Framework[] = [];

    // Rust frameworks
    const cargoContent = this.readFile(projectRoot, 'Cargo.toml');
    if (cargoContent) {
      if (cargoContent.includes('tauri')) frameworks.push(Framework.Tauri);
      if (cargoContent.includes('actix-web')) frameworks.push(Framework.Actix);
      if (cargoContent.includes('axum')) frameworks.push(Framework.Axum);
      if (cargoContent.includes('rocket')) frameworks.push(Framework.Rocket);
      if (cargoContent.includes('tokio')) frameworks.push(Framework.Tokio);
      if (cargoContent.includes('diesel')) frameworks.push(Framework.Diesel);
      if (cargoContent.includes('sea-orm')) frameworks.push(Framework.SeaOrm);
    }

    // JavaScript/TypeScript frameworks
    const packageContent = this.readFile(projectRoot, 'package.json');
    if (packageContent) {
      if (packageContent.includes('"react"') || packageContent.includes('"react":'))
        frameworks.push(Framework.React);
      if (packageContent.includes('"vue"') || packageContent.includes('"vue":'))
        frameworks.push(Framework.Vue);
      if (packageContent.includes('"@angular/')) frameworks.push(Framework.Angular);
      if (packageContent.includes('"svelte"')) frameworks.push(Framework.Svelte);
      if (packageContent.includes('"next"') || packageContent.includes('"next":'))
        frameworks.push(Framework.NextJs);
      if (packageContent.includes('"nuxt"') || packageContent.includes('"nuxt":'))
        frameworks.push(Framework.NuxtJs);
      if (packageContent.includes('"express"')) frameworks.push(Framework.Express);
      if (packageContent.includes('"@nestjs/')) frameworks.push(Framework.NestJs);
    }

    // Deno
    if (this.fileExists(projectRoot, 'deno.json') || this.fileExists(projectRoot, 'deno.jsonc')) {
      frameworks.push(Framework.Deno);
    }

    // Bun
    if (this.fileExists(projectRoot, 'bun.lockb') || this.fileExists(projectRoot, 'bunfig.toml')) {
      frameworks.push(Framework.Bun);
    }

    // Python frameworks
    const pyprojectContent = this.readFile(projectRoot, 'pyproject.toml');
    if (pyprojectContent) {
      if (pyprojectContent.includes('django')) frameworks.push(Framework.Django);
      if (pyprojectContent.includes('flask')) frameworks.push(Framework.Flask);
      if (pyprojectContent.includes('fastapi')) frameworks.push(Framework.FastApi);
      if (pyprojectContent.includes('pytest')) frameworks.push(Framework.Pytest);
      if (pyprojectContent.includes('[tool.poetry]')) frameworks.push(Framework.Poetry);
    }

    // Check requirements.txt too
    const requirementsContent = this.readFile(projectRoot, 'requirements.txt');
    if (requirementsContent) {
      if (requirementsContent.includes('django') && !frameworks.includes(Framework.Django))
        frameworks.push(Framework.Django);
      if (requirementsContent.includes('flask') && !frameworks.includes(Framework.Flask))
        frameworks.push(Framework.Flask);
      if (requirementsContent.includes('fastapi') && !frameworks.includes(Framework.FastApi))
        frameworks.push(Framework.FastApi);
    }

    // Java Spring
    const pomContent = this.readFile(projectRoot, 'pom.xml');
    if (pomContent && pomContent.includes('spring')) {
      frameworks.push(Framework.Spring);
    }

    // Ruby Rails
    if (this.fileExists(projectRoot, 'config/routes.rb')) {
      frameworks.push(Framework.Rails);
    }

    // PHP Laravel
    if (this.fileExists(projectRoot, 'artisan') && this.dirExists(projectRoot, 'app/Http')) {
      frameworks.push(Framework.Laravel);
    }

    // .NET
    if (this.globExists(projectRoot, '*.csproj')) {
      frameworks.push(Framework.DotNet);
    }

    return frameworks;
  }

  /** Detect the project name from config files */
  private detectProjectName(projectRoot: string): string | null {
    // Try Cargo.toml
    const cargoContent = this.readFile(projectRoot, 'Cargo.toml');
    if (cargoContent) {
      const name = this.extractTomlValue(cargoContent, 'name');
      if (name) return name;
    }

    // Try package.json
    const packageContent = this.readFile(projectRoot, 'package.json');
    if (packageContent) {
      const name = this.extractJsonValue(packageContent, 'name');
      if (name) return name;
    }

    // Try pyproject.toml
    const pyprojectContent = this.readFile(projectRoot, 'pyproject.toml');
    if (pyprojectContent) {
      const name = this.extractTomlValue(pyprojectContent, 'name');
      if (name) return name;
    }

    // Try go.mod
    const goModContent = this.readFile(projectRoot, 'go.mod');
    if (goModContent) {
      const firstLine = goModContent.split('\n')[0];
      if (firstLine?.startsWith('module ')) {
        const modulePath = firstLine.slice(7).trim();
        const parts = modulePath.split('/');
        return parts[parts.length - 1] ?? null;
      }
    }

    // Fall back to directory name
    return path.basename(projectRoot);
  }

  /** Find configuration files in the project */
  private findConfigFiles(projectRoot: string): string[] {
    const configNames = [
      'Cargo.toml',
      'package.json',
      'tsconfig.json',
      'pyproject.toml',
      'go.mod',
      '.gitignore',
      '.env',
      '.env.local',
      'docker-compose.yml',
      'docker-compose.yaml',
      'Dockerfile',
      'Makefile',
      'justfile',
      '.editorconfig',
      '.prettierrc',
      '.eslintrc.json',
      'rustfmt.toml',
      '.rustfmt.toml',
      'clippy.toml',
      '.clippy.toml',
      'tauri.conf.json',
    ];

    const found: string[] = [];

    for (const name of configNames) {
      const fullPath = path.join(projectRoot, name);
      if (fs.existsSync(fullPath)) {
        found.push(fullPath);
      }
    }

    return found;
  }

  // Helper methods

  private fileExists(projectRoot: string, name: string): boolean {
    return fs.existsSync(path.join(projectRoot, name));
  }

  private dirExists(projectRoot: string, name: string): boolean {
    const fullPath = path.join(projectRoot, name);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
  }

  private globExists(projectRoot: string, pattern: string): boolean {
    try {
      const entries = fs.readdirSync(projectRoot);
      for (const entry of entries) {
        // Simple glob matching for patterns like "*.ext"
        if (pattern.startsWith('*.')) {
          const ext = pattern.slice(1);
          if (entry.endsWith(ext)) {
            return true;
          }
        }
      }
    } catch {
      // Directory might not be readable
    }
    return false;
  }

  private readFile(projectRoot: string, name: string): string | null {
    try {
      return fs.readFileSync(path.join(projectRoot, name), 'utf8');
    } catch {
      return null;
    }
  }

  private extractTomlValue(content: string, key: string): string | null {
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith(`${key} `) || trimmed.startsWith(`${key}=`)) {
        const value = trimmed.split('=')[1];
        if (value) {
          return value.trim().replace(/^["']|["']$/g, '');
        }
      }
    }
    return null;
  }

  private extractJsonValue(content: string, key: string): string | null {
    const pattern = `"${key}"`;
    for (const line of content.split('\n')) {
      if (line.includes(pattern)) {
        const colonPos = line.indexOf(':');
        if (colonPos !== -1) {
          const value = line.slice(colonPos + 1).trim();
          const match = value.match(/^"([^"]+)"/);
          if (match) {
            return match[1] ?? null;
          }
        }
      }
    }
    return null;
  }
}

/**
 * Factory function to create a file system detector
 *
 * Use this when you need project/framework detection:
 * ```typescript
 * import { ContextCapture } from '@vestige/core';
 * import { createDetector } from '@vestige/core/codebase/detection';
 *
 * const capture = new ContextCapture('/path/to/project', {
 *   detector: createDetector()
 * });
 * ```
 */
export function createDetector(): DetectionStrategy {
  return new FileSystemDetector();
}
