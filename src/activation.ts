/**
 * Layer 4: deliver a skill's instructions into the conversation (tier 2).
 *
 * The content is wrapped in identifying tags so a harness can find it again,
 * protect it from context compaction and avoid injecting it twice. Bundled
 * resources are listed, never read: the model loads them on demand (tier 3).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Registry } from './discovery.js';
import {
  EXECUTION_SUBAGENT,
  SKILL_FILE,
  type Skill,
  SkillNotFoundError,
  skillBaseDir,
  skillExecution,
} from './models.js';
import { readBody } from './parser.js';

export const DEFAULT_MAX_RESOURCES = 50;
const IGNORED_PARTS = new Set(['__pycache__', 'node_modules']);

export interface ActivationResult {
  name: string;
  content: string;
  alreadyActive: boolean;
}

export interface WrapOptions {
  includeFrontmatter?: boolean;
  maxResources?: number;
  /**
   * Adds a note to subagent-mode skills telling the main agent to delegate.
   * Turned off when the text is built for the subagent itself. Default true.
   */
  delegationHint?: boolean;
}

/** Relative POSIX paths of the files a skill bundles. Symlinks and hidden entries are left out. */
export function listResources(
  skill: Skill,
  limit = DEFAULT_MAX_RESOURCES,
): { paths: string[]; truncated: boolean } {
  const base = skillBaseDir(skill);
  const paths: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || IGNORED_PARTS.has(entry.name) || entry.isSymbolicLink()) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), relative);
      else if (entry.isFile() && relative !== SKILL_FILE) paths.push(relative);
    }
  };
  walk(base, '');
  paths.sort();
  return { paths: paths.slice(0, limit), truncated: paths.length > limit };
}

/** The text handed to the model when a skill is activated. */
export function wrapSkillContent(skill: Skill, options: WrapOptions = {}): string {
  const body = options.includeFrontmatter
    ? fs.readFileSync(skill.location, 'utf8').trim()
    : readBody(skill.location);
  const { paths, truncated } = listResources(skill, options.maxResources ?? DEFAULT_MAX_RESOURCES);
  const lines = [
    `<skill_content name="${skill.properties.name.replace(/"/g, '&quot;')}">`,
    body,
    '',
    `Skill directory: ${skillBaseDir(skill)}`,
    'Relative paths in this skill are relative to the skill directory.',
  ];
  if ((options.delegationHint ?? true) && skillExecution(skill) === EXECUTION_SUBAGENT) {
    lines.push(
      'This skill is meant to run in a separate subagent session. If you can start one, delegate the task and bring back only the summary.',
    );
  }
  if (paths.length > 0) {
    lines.push('', '<skill_resources>', ...paths.map((file) => `  <file>${file}</file>`));
    if (truncated) lines.push('  <!-- listing truncated; more files exist in the skill directory -->');
    lines.push('</skill_resources>');
  }
  lines.push('</skill_content>');
  return lines.join('\n');
}

/** Tracks which skills are already in context for one conversation. */
export class Session {
  readonly activated = new Set<string>();

  constructor(readonly registry: Registry) {}

  activate(name: string, options: WrapOptions = {}): ActivationResult {
    const skill = this.registry.get(name);
    if (!skill) {
      const available = this.registry.names().join(', ') || 'none';
      throw new SkillNotFoundError(
        `skill ${JSON.stringify(name)} is not available. Available skills: ${available}`,
      );
    }
    if (this.activated.has(name)) {
      return {
        name,
        content: `Skill ${JSON.stringify(name)} is already loaded in this session; follow the instructions given earlier.`,
        alreadyActive: true,
      };
    }
    const content = wrapSkillContent(skill, options);
    this.activated.add(name);
    return { name, content, alreadyActive: false };
  }

  /** Directories a permission system should allow reading without prompting. */
  allowlistedDirs(): string[] {
    return [...this.activated].map((name) => skillBaseDir(this.registry.get(name)!)).sort();
  }
}
