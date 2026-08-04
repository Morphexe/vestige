/**
 * Detection Module
 *
 * Provides optional project/framework detection capabilities.
 * Import this module only when detection is needed.
 */

// Types
export type { DetectionStrategy, DetectionResult } from './types.js';
export { nullDetectionStrategy } from './types.js';

// Detector implementation
export { FileSystemDetector, createDetector } from './detector.js';
