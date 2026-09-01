/** Type declarations for the architecture analyzer. */
import type { Violation } from './ruleset.d.mts';

export interface AnalysisResult {
  readonly filesScanned: number;
  readonly contextsDeclared: number;
  readonly platformModulesDeclared: number;
  readonly violations: Violation[];
}

export declare function listSourceFiles(root?: string): string[];
export declare function stripNonCode(src: string): string;
export declare function extractImports(source: string): string[];
export declare function analyze(): AnalysisResult;
