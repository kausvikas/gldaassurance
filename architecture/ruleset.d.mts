/** Type declarations for the zero-dependency architecture ruleset. */

export interface Violation {
  readonly file: string;
  readonly line?: number;
  readonly specifier?: string;
  readonly code: string;
  readonly gate?: string;
  readonly message: string;
  readonly authority: string;
}

export interface ContextDeclaration {
  readonly tier: number;
  readonly outputLayers: readonly string[];
  readonly mayDependOn: readonly string[];
  readonly forbidAllContexts?: boolean;
  readonly owns: string;
  readonly why: string;
}

export interface LayerDeclaration {
  readonly dir: string;
  readonly alias: string;
  readonly mayDependOn: readonly string[];
  readonly allowedExternal: readonly string[];
  readonly rationale: string;
}

export interface SourceGate {
  readonly id: string;
  readonly description: string;
  readonly authority: string;
  readonly appliesTo: readonly string[];
  readonly exempt: readonly string[];
  readonly pattern: string;
  readonly state?: string;
}

export interface Manifest {
  readonly version: string;
  readonly layers: Readonly<Record<string, LayerDeclaration>>;
  readonly layerOrder: readonly string[];
  readonly contexts: Readonly<Record<string, ContextDeclaration>>;
  readonly platformModules: Readonly<Record<string, { readonly mayDependOn: readonly string[]; readonly owns: string }>>;
  readonly sourceGates: readonly SourceGate[];
}

export declare const REPO_ROOT: string;
export declare const manifest: Manifest;
export declare const VIOLATION: Readonly<{
  LAYER_DIRECTION: string;
  PUBLIC_SURFACE: string;
  UNDECLARED_CONTEXT_DEP: string;
  AI_DOMAIN_IMPORT: string;
  RULES_DEPENDENCY: string;
  EXTERNAL_PACKAGE: string;
  CYCLE: string;
  SOURCE_GATE: string;
  TIER_INVERSION: string;
  MISSING_PUBLIC_SURFACE: string;
  PLATFORM_MODULE_DEP: string;
}>;

export declare function classifyFile(
  repoRelPath: string,
): { layer: string; unit: string | null; rest: string } | null;

export declare function resolveSpecifier(
  fromFile: string,
  spec: string,
): Record<string, unknown> & { kind: string };

export declare function evaluateImport(fromFile: string, spec: string): Violation[];
export declare function evaluateManifestConsistency(): Violation[];
