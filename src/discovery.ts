/**
 * Layer 2: find skills on disk and build a registry.
 *
 * Scopes are scanned in precedence order: project, then user, then the skills
 * bundled with this package. The first skill found for a name wins and shadowed
 * duplicates are reported. Loading is lenient: cosmetic problems produce warnings,
 * and only a missing description or unparseable YAML skips a skill.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { bundledSkillsDir } from './installer.js';
import { type Diagnostic, MAX_NAME_LENGTH, ParseError, SKILL_FILE, type Skill } from './models.js';
import { parseSkillFile, toProperties } from './parser.js';

export const SKIP_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  'venv',
  'dist',
  'build',
  'target',
]);
export const DEFAULT_MAX_DEPTH = 4;
export const DEFAULT_MAX_DIRS = 2000;
/** Cross-client convention. Add client folders such as ".claude" through `clientDirs`. */
export const DEFAULT_CLIENT_DIRS: readonly string[] = ['.agents'];

/** A directory that holds skill directories, with a label used in diagnostics. */
export interface Scope {
  name: string;
  root: string;
}

/** Skills keyed by name, plus everything noticed while loading them. */
export class Registry {
  readonly skills = new Map<string, Skill>();
  readonly diagnostics: Diagnostic[] = [];

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }
  names(): string[] {
    return [...this.skills.keys()].sort();
  }
  list(): Skill[] {
    return this.names().map((name) => this.skills.get(name)!);
  }
  get size(): number {
    return this.skills.size;
  }
}

export interface ScopeOptions {
  projectDir?: string;
  home?: string;
  clientDirs?: readonly string[];
  /** Untrusted projects contribute no skills. Default true. */
  projectTrusted?: boolean;
  includeUser?: boolean;
  includeBundled?: boolean;
}

/** Scopes in precedence order. */
export function defaultScopes(options: ScopeOptions = {}): Scope[] {
  const clientDirs = options.clientDirs ?? DEFAULT_CLIENT_DIRS;
  const scopes: Scope[] = [];
  if (options.projectTrusted ?? true) {
    const project = options.projectDir ?? process.cwd();
    for (const client of clientDirs)
      scopes.push({ name: 'project', root: path.join(project, client, 'skills') });
  }
  if (options.includeUser ?? true) {
    const home = options.home ?? os.homedir();
    for (const client of clientDirs) scopes.push({ name: 'user', root: path.join(home, client, 'skills') });
  }
  if (options.includeBundled ?? true) {
    const bundled = bundledSkillsDir();
    if (bundled) scopes.push({ name: 'bundled', root: bundled });
  }
  return scopes;
}

export interface ScanLimits {
  maxDepth?: number;
  maxDirs?: number;
}

/** Directories under `root` that contain a file named exactly SKILL.md, in sorted order. */
export function findSkillDirs(root: string, limits: ScanLimits = {}): string[] {
  const maxDepth = limits.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxDirs = limits.maxDirs ?? DEFAULT_MAX_DIRS;
  const found: string[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number): void => {
    if (++visited > maxDirs) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === SKILL_FILE)) {
      found.push(dir); // a skill's own subfolders are resources, not nested skills
      return;
    }
    if (depth >= maxDepth) return;
    const children = entries
      .filter((entry) => entry.isDirectory() && !SKIP_DIRS.has(entry.name))
      .map((entry) => entry.name)
      .sort();
    for (const child of children) walk(path.join(dir, child), depth + 1);
  };
  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) walk(root, 0);
  return found.sort();
}

/** Lenient load of one skill directory. */
export function loadSkill(skillDir: string, scope = 'path'): { skill?: Skill; diagnostics: Diagnostic[] } {
  const location = path.resolve(skillDir, SKILL_FILE);
  const dirName = path.basename(path.resolve(skillDir));
  const diagnostics: Diagnostic[] = [];
  try {
    const { frontmatter, repaired } = parseSkillFile(location);
    const properties = toProperties(frontmatter);
    if (repaired) {
      diagnostics.push({
        level: 'warning',
        code: 'yaml-repaired',
        message: 'frontmatter had an unquoted colon and was repaired while loading',
        path: location,
      });
    }
    if (properties.name !== dirName) {
      diagnostics.push({
        level: 'warning',
        code: 'name-directory',
        message: `name ${JSON.stringify(properties.name)} does not match directory ${JSON.stringify(dirName)}`,
        path: location,
      });
    }
    if (properties.name.length > MAX_NAME_LENGTH) {
      diagnostics.push({
        level: 'warning',
        code: 'name-length',
        message: `name is longer than ${MAX_NAME_LENGTH} characters`,
        path: location,
      });
    }
    return { skill: { properties, location, scope }, diagnostics };
  } catch (cause) {
    if (!(cause instanceof ParseError)) throw cause;
    return {
      diagnostics: [
        {
          level: 'error',
          code: 'skill-skipped',
          message: `skill not loaded: ${cause.message}`,
          path: location,
        },
      ],
    };
  }
}

/** Scan scopes in order and return the registry. Earlier scopes take precedence. */
export function discover(scopes: Scope[] = defaultScopes(), limits: ScanLimits = {}): Registry {
  const registry = new Registry();
  for (const scope of scopes) {
    for (const skillDir of findSkillDirs(scope.root, limits)) {
      const { skill, diagnostics } = loadSkill(skillDir, scope.name);
      registry.diagnostics.push(...diagnostics);
      if (!skill) continue;
      const existing = registry.skills.get(skill.properties.name);
      if (existing) {
        // A bundled skill replaced by an installed copy is the normal case, not a problem.
        if (skill.scope !== 'bundled') {
          registry.diagnostics.push({
            level: 'warning',
            code: 'name-collision',
            message: `skill ${JSON.stringify(skill.properties.name)} from scope '${skill.scope}' is shadowed by ${existing.location} (scope '${existing.scope}')`,
            path: skill.location,
          });
        }
        continue;
      }
      registry.skills.set(skill.properties.name, skill);
    }
  }
  return registry;
}
