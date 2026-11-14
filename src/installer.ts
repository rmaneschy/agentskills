/**
 * Layer 6: the bundled skill pack, how it is installed into a project and how a new skill starts.
 *
 * Installs are tracked in a lockfile with a content hash per skill. That is what
 * lets a later install tell an untouched copy (safe to update) from one the user
 * edited (left alone unless forced).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXECUTION_KEY, EXECUTION_SUBAGENT, SKILL_FILE, SkillError } from './models.js';
import { NAME_PATTERN, validateName } from './validator.js';

export const LOCK_FILE = '.agentskills-lock.json';
/** Where each agent reads project skills. `universal` is the cross-client convention. */
export const AGENT_DESTINATIONS: Readonly<Record<string, string>> = {
  universal: '.agents/skills',
  'claude-code': '.claude/skills',
  cursor: '.cursor/skills',
  copilot: '.github/skills',
};
export const DEFAULT_DESTINATION = AGENT_DESTINATIONS.universal!;
const IGNORED = new Set(['__pycache__', 'node_modules', '.DS_Store']);

export type InstallStatus =
  | 'installed'
  | 'updated'
  | 'up-to-date'
  | 'skipped-modified'
  | 'skipped-unmanaged'
  | 'would-install'
  | 'would-update';

export interface InstallAction {
  name: string;
  target: string;
  status: InstallStatus;
}

export interface LockFile {
  version: 1;
  source: string;
  skills: Record<string, { hash: string; packageVersion: string }>;
}

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function packageVersion(): string {
  try {
    return (
      JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as { version: string }
    ).version;
  } catch {
    return '0.0.0';
  }
}

/** Skills shipped with this package, or undefined when the directory is absent. */
export function bundledSkillsDir(): string | undefined {
  const dir = path.join(packageRoot, 'skills');
  return fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? dir : undefined;
}

export function bundledSkillNames(): string[] {
  const root = bundledSkillsDir();
  if (!root) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, SKILL_FILE)))
    .map((entry) => entry.name)
    .sort();
}

/** Regular files of a skill as relative POSIX paths. Symlinks are never followed or copied. */
function skillFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...skillFiles(path.join(dir, entry.name), relative));
    else if (entry.isFile()) out.push(relative);
  }
  return out.sort();
}

/** Content hash of a skill directory: file paths and bytes, independent of the operating system. */
export function hashSkillDir(dir: string): string {
  const hash = createHash('sha256');
  for (const relative of skillFiles(dir)) {
    hash.update(relative).update('\0');
    hash.update(fs.readFileSync(path.join(dir, relative))).update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function copySkill(source: string, target: string): void {
  for (const relative of skillFiles(source)) {
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(source, relative), destination);
  }
}

export function readLock(destinationRoot: string): LockFile {
  const empty: LockFile = { version: 1, source: '@rmaneschy/agentskills', skills: {} };
  try {
    const data = JSON.parse(fs.readFileSync(path.join(destinationRoot, LOCK_FILE), 'utf8')) as LockFile;
    return data && data.version === 1 && typeof data.skills === 'object' ? data : empty;
  } catch {
    return empty;
  }
}

function writeLock(destinationRoot: string, lock: LockFile): void {
  const sorted = Object.fromEntries(Object.entries(lock.skills).sort(([a], [b]) => (a < b ? -1 : 1)));
  const temporary = path.join(destinationRoot, `${LOCK_FILE}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify({ ...lock, skills: sorted }, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, path.join(destinationRoot, LOCK_FILE)); // atomic replace
}

export interface InstallOptions {
  /** Skills to install. Default: all bundled skills. */
  names?: string[];
  /** Destination inside the project. Default `.agents/skills`. */
  destination?: string;
  /** Replace skills that were edited locally or were not installed by this tool. */
  force?: boolean;
  dryRun?: boolean;
}

/**
 * Copy bundled skills into `<targetDir>/<destination>`.
 * An untouched earlier install is updated; a locally edited or unmanaged skill is kept unless `force`.
 */
export function installSkills(targetDir: string, options: InstallOptions = {}): InstallAction[] {
  const sourceRoot = bundledSkillsDir();
  if (!sourceRoot) throw new SkillError('this installation has no bundled skills');
  const available = bundledSkillNames();
  const selected = options.names && options.names.length > 0 ? options.names : available;
  const unknown = selected.filter((name) => !NAME_PATTERN.test(name) || !available.includes(name)).sort();
  if (unknown.length > 0) {
    throw new SkillError(
      `unknown bundled skill(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`,
    );
  }
  const destinationRoot = path.resolve(targetDir, options.destination ?? DEFAULT_DESTINATION);
  const lock = readLock(destinationRoot);
  const actions: InstallAction[] = [];
  let changed = false;
  for (const name of selected) {
    const source = path.join(sourceRoot, name);
    const target = path.join(destinationRoot, name);
    const bundledHash = hashSkillDir(source);
    const exists = fs.existsSync(target);
    const locked = lock.skills[name];
    let status: InstallStatus;
    if (!exists) status = options.dryRun ? 'would-install' : 'installed';
    else {
      const currentHash = hashSkillDir(target);
      if (currentHash === bundledHash) status = 'up-to-date';
      else if (options.force || (locked && locked.hash === currentHash))
        status = options.dryRun ? 'would-update' : 'updated';
      else status = locked ? 'skipped-modified' : 'skipped-unmanaged';
    }
    if (status === 'installed' || status === 'updated') {
      fs.rmSync(target, { recursive: true, force: true });
      copySkill(source, target);
    }
    if (
      status === 'installed' ||
      status === 'updated' ||
      (status === 'up-to-date' && locked?.hash !== bundledHash)
    ) {
      fs.mkdirSync(destinationRoot, { recursive: true });
      lock.skills[name] = { hash: bundledHash, packageVersion: packageVersion() };
      changed = true;
    }
    actions.push({ name, target, status });
  }
  if (changed && !options.dryRun) writeLock(destinationRoot, lock);
  return actions;
}

const TEMPLATE = `---
name: {name}
description: {description}
{metadata}---

# {title}

## When to use
State the situations that should trigger this skill and the ones that should not.

## Steps
1. First step.
2. Second step.

## Gotchas
- Facts about this environment that an agent would get wrong without being told.

## Verification
How to check the result before reporting it.
`;

/** Create `<parentDir>/<name>/SKILL.md` from the template. Refuses to overwrite. */
export function scaffoldSkill(
  parentDir: string,
  name: string,
  description: string,
  subagent = false,
): string {
  const skillDir = path.join(parentDir, name);
  const problems = validateName(name, undefined, skillDir);
  if (problems.length > 0) throw new SkillError(problems[0]!.message);
  if (description.trim().length === 0) throw new SkillError('description must not be empty');
  if (fs.existsSync(skillDir)) throw new SkillError(`${skillDir} already exists`);
  fs.mkdirSync(skillDir, { recursive: true });
  const text = TEMPLATE.replace('{name}', name)
    .replace('{description}', JSON.stringify(description.trim()))
    .replace('{metadata}', subagent ? `metadata:\n  ${EXECUTION_KEY}: "${EXECUTION_SUBAGENT}"\n` : '')
    .replace('{title}', (name.charAt(0).toUpperCase() + name.slice(1)).replaceAll('-', ' '));
  fs.writeFileSync(path.join(skillDir, SKILL_FILE), text, 'utf8');
  return skillDir;
}
