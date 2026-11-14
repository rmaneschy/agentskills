/** Layer 0: data types, limits and errors shared by every layer. No I/O happens here. */
import path from 'node:path';

export const SKILL_FILE = 'SKILL.md';
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;
export const MAX_COMPATIBILITY_LENGTH = 500;
export const MAX_BODY_LINES = 500;
export const MAX_BODY_TOKENS = 5000;

/** Frontmatter fields defined by the specification. */
export const SPEC_FIELDS: ReadonlySet<string> = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);

/** Metadata key (namespaced, as the spec recommends) that selects how a skill runs. */
export const EXECUTION_KEY = 'agentskills.execution';
export const EXECUTION_INLINE = 'inline';
export const EXECUTION_SUBAGENT = 'subagent';
export const EXECUTION_MODES: ReadonlySet<string> = new Set([EXECUTION_INLINE, EXECUTION_SUBAGENT]);

export type Level = 'error' | 'warning';

/** One finding about a skill. `code` is stable and safe to match on. */
export interface Diagnostic {
  level: Level;
  code: string;
  message: string;
  path?: string;
}

/** Frontmatter of a SKILL.md, normalised to the types the spec defines. */
export interface SkillProperties {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
  allowedTools?: string;
  /** Fields outside the specification, kept as parsed. */
  extra: Record<string, unknown>;
}

/**
 * A discovered skill: its properties plus where it lives. The body is not stored;
 * it is read from `location` at activation time, so discovery stays cheap and
 * edits made between activations are picked up.
 */
export interface Skill {
  properties: SkillProperties;
  /** Absolute path of the SKILL.md file. */
  location: string;
  scope: string;
}

export class SkillError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
/** SKILL.md is missing, unreadable or has no usable frontmatter. */
export class ParseError extends SkillError {}
/** A skill name was requested that is not in the registry. */
export class SkillNotFoundError extends SkillError {}
/** The subagent could not be started or did not finish. */
export class RunnerError extends SkillError {}

export function skillBaseDir(skill: Skill): string {
  return path.dirname(skill.location);
}

export function skillExecution(skill: Skill | SkillProperties): string {
  const properties = 'properties' in skill ? skill.properties : skill;
  return properties.metadata[EXECUTION_KEY] ?? EXECUTION_INLINE;
}

/** Properties as a plain object with the spec's field names. */
export function propertiesToObject(properties: SkillProperties): Record<string, unknown> {
  const out: Record<string, unknown> = { name: properties.name, description: properties.description };
  if (properties.license !== undefined) out.license = properties.license;
  if (properties.compatibility !== undefined) out.compatibility = properties.compatibility;
  if (Object.keys(properties.metadata).length > 0) out.metadata = { ...properties.metadata };
  if (properties.allowedTools !== undefined) out['allowed-tools'] = properties.allowedTools;
  return out;
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const where = diagnostic.path ? `${diagnostic.path}: ` : '';
  return `${diagnostic.level.toUpperCase()} [${diagnostic.code}] ${where}${diagnostic.message}`;
}

/** Rough, model-independent token estimate (about four characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
