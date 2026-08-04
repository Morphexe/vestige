/**
 * Detection Strategy Types
 *
 * Defines the interface for project/framework detection strategies.
 * By using a strategy pattern, we allow detection to be opt-in,
 * reducing bundle size when detection is not needed.
 */

import type { ProjectType, Framework } from '../context.js';

/**
 * Result of project/framework detection
 */
export interface DetectionResult {
  /** Detected project types (e.g., TypeScript, Rust, Python) */
  projectTypes: ProjectType[];
  /** Detected frameworks (e.g., React, Next.js, Axum) */
  frameworks: Framework[];
  /** Detected project name from config files */
  projectName: string | null;
  /** Configuration files found in the project */
  configFiles: string[];
}

/**
 * Strategy interface for project/framework detection
 *
 * Implementations perform the actual detection logic.
 * The null implementation returns empty results for when
 * detection is not needed.
 */
export interface DetectionStrategy {
  /**
   * Detect project types, frameworks, and configuration
   * @param projectRoot - Root directory of the project
   * @returns Detection results
   */
  detect(projectRoot: string): DetectionResult;
}

/**
 * Null detection strategy that returns empty/unknown results
 *
 * Used as the default when no detector is provided, ensuring
 * detection code is not bundled or executed unless explicitly imported.
 */
export const nullDetectionStrategy: DetectionStrategy = {
  detect(_projectRoot: string): DetectionResult {
    // Import ProjectType dynamically would defeat the purpose,
    // so we return the string value directly
    return {
      projectTypes: ['unknown' as ProjectType],
      frameworks: [],
      projectName: null,
      configFiles: [],
    };
  },
};
