import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EXIT, main } from '../src/cli.js';
import {
  LOCK_FILE,
  SkillError,
  bundledSkillNames,
  bundledSkillsDir,
  hashSkillDir,
  installSkills,
  readLock,
  scaffoldSkill,
  validate,
} from '../src/index.js';
import { makeSkill, tempDir } from './helpers.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-agent.mjs');
const ISOLATED = ['--no-user', '--no-bundled'];

async function run(args: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(args, { out: (text) => out.push(text), err: (text) => err.push(text) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('bundled pack', () => {
  it('contains only skills that validate without warnings', () => {
    const names = bundledSkillNames();
    expect(names).toEqual(
      expect.arrayContaining(['skill-authoring', 'context-isolation', 'repo-exploration']),
    );
    for (const name of names) expect(validate(path.join(bundledSkillsDir()!, name)), name).toEqual([]);
  });

  it('ships no scripts tied to one operating system', () => {
    const offenders = fs
      .readdirSync(bundledSkillsDir()!, { recursive: true })
      .map(String)
      .filter((file) => /\.(sh|bash|ps1|bat|cmd)$/i.test(file));
    expect(offenders).toEqual([]);
  });
});

describe('install', () => {
  const skillFile = (project: string) =>
    path.join(project, '.agents', 'skills', 'repo-exploration', 'SKILL.md');
  const statuses = (project: string, options = {}) =>
    installSkills(project, { names: ['repo-exploration'], ...options }).map((a) => a.status);

  it('installs, records a lock and reports an unchanged copy as up to date', () => {
    const project = tempDir();
    expect(statuses(project)).toEqual(['installed']);
    expect(fs.existsSync(skillFile(project))).toBe(true);
    const lock = readLock(path.join(project, '.agents', 'skills'));
    expect(lock.skills['repo-exploration']?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(statuses(project)).toEqual(['up-to-date']);
  });

  it('keeps local edits unless forced', () => {
    const project = tempDir();
    statuses(project);
    fs.writeFileSync(skillFile(project), 'local edit');
    expect(statuses(project)).toEqual(['skipped-modified']);
    expect(statuses(project, { force: true, dryRun: true })).toEqual(['would-update']);
    expect(fs.readFileSync(skillFile(project), 'utf8')).toBe('local edit');
    expect(statuses(project, { force: true })).toEqual(['updated']);
    expect(fs.readFileSync(skillFile(project), 'utf8').startsWith('---')).toBe(true);
  });

  it('updates an untouched older install without asking', () => {
    const project = tempDir();
    statuses(project);
    // Simulate an older release: the installed copy differs from the bundled one,
    // and the lock records exactly that older content as what was installed.
    fs.appendFileSync(skillFile(project), '\nline from an older release\n');
    const root = path.join(project, '.agents', 'skills');
    const lock = readLock(root);
    lock.skills['repo-exploration']!.hash = hashSkillDir(path.join(root, 'repo-exploration'));
    fs.writeFileSync(path.join(root, LOCK_FILE), JSON.stringify(lock));
    expect(statuses(project, { dryRun: true })).toEqual(['would-update']);
    expect(statuses(project)).toEqual(['updated']);
    expect(fs.readFileSync(skillFile(project), 'utf8')).not.toContain('older release');
    expect(statuses(project)).toEqual(['up-to-date']);
  });

  it('does not touch a skill it did not install, and rejects unknown or unsafe names', () => {
    const project = tempDir();
    makeSkill('repo-exploration', { root: path.join(project, '.agents', 'skills') });
    expect(statuses(project)).toEqual(['skipped-unmanaged']);
    expect(() => installSkills(project, { names: ['nope'] })).toThrow(/unknown bundled skill/);
    expect(() => installSkills(project, { names: ['../../etc'] })).toThrow(SkillError);
  });

  it('scaffolds a valid skill', () => {
    const root = tempDir();
    const created = scaffoldSkill(root, 'my-skill', 'Does "X": end to end. Use when asked for X.', true);
    expect(validate(created)).toEqual([]);
    expect(() => scaffoldSkill(root, 'my-skill', 'again')).toThrow(SkillError);
    expect(() => scaffoldSkill(root, 'Bad_Name', 'desc')).toThrow(SkillError);
  });
});

describe('cli', () => {
  it('validates with distinct exit codes and JSON output', async () => {
    const root = path.join(tempDir(), 'skills');
    const good = makeSkill('good', { root });
    makeSkill('bad', { root, frontmatter: 'name: Bad\ndescription: x' });
    expect((await run(['validate', good])).code).toBe(EXIT.ok);
    const report = await run(['validate', root, '--json']);
    expect(report.code).toBe(EXIT.invalid);
    const parsed = JSON.parse(report.out) as { skill: string; valid: boolean }[];
    expect(Object.fromEntries(parsed.map((r) => [path.basename(r.skill), r.valid]))).toEqual({
      good: true,
      bad: false,
    });
    expect((await run(['validate', path.join(root, 'missing')])).code).toBe(EXIT.notFound);
    const vague = makeSkill('vague', { root: tempDir(), frontmatter: 'name: vague\ndescription: Helps.' });
    expect((await run(['validate', vague])).code).toBe(EXIT.ok);
    expect((await run(['validate', vague, '--strict'])).code).toBe(EXIT.invalid);
  });

  it('lists, discloses and activates', async () => {
    const project = tempDir();
    const skillDir = makeSkill('demo-skill', {
      root: path.join(project, '.agents', 'skills'),
      files: { 'scripts/a.mjs': 'x' },
    });
    const base = ['--project', project, ...ISOLATED];
    expect((JSON.parse((await run(['list', '--json', ...base])).out) as { name: string }[])[0]?.name).toBe(
      'demo-skill',
    );
    expect((await run(['catalog', '--format', 'json', ...base])).out).toContain('"available_skills"');
    expect((await run(['catalog', '--untrusted', ...base])).out).toBe('');
    expect((await run(['activate', 'demo-skill', ...base])).out).toContain('<file>scripts/a.mjs</file>');
    expect((await run(['activate', 'nope', ...base])).code).toBe(EXIT.notFound);
    expect((JSON.parse((await run(['read-properties', skillDir])).out) as { name: string }).name).toBe(
      'demo-skill',
    );
  });

  it('delegates through a configured runner', async () => {
    const project = tempDir();
    makeSkill('demo-skill', { root: path.join(project, '.agents', 'skills') });
    const base = ['--project', project, ...ISOLATED];
    const saved = process.env.AGENTSKILLS_SUBAGENT_CMD;
    delete process.env.AGENTSKILLS_SUBAGENT_CMD;
    try {
      expect((await run(['delegate', 'demo-skill', '--task', 'T', '--print-brief', ...base])).out).toContain(
        '## Task\nT',
      );
      const missing = await run(['delegate', 'demo-skill', '--task', 'T', ...base]);
      expect(missing.code).toBe(EXIT.usage);
      expect(missing.err).toContain('no subagent runner configured');
      const runner = JSON.stringify([process.execPath, FAKE]);
      const ok = await run([
        'delegate',
        'demo-skill',
        '--task',
        'T',
        '--runner',
        runner,
        '--transcript-dir',
        project,
        '--json',
        ...base,
      ]);
      expect(ok.code).toBe(EXIT.ok);
      const result = JSON.parse(ok.out) as { summary: string; transcript: string };
      expect(result.summary).toContain('task seen: true');
      expect(fs.existsSync(result.transcript)).toBe(true);
      process.env.AGENTSKILLS_SUBAGENT_CMD = JSON.stringify([process.execPath, FAKE, '--fail']);
      expect(
        (await run(['delegate', 'demo-skill', '--task', 'T', '--transcript-dir', project, ...base])).code,
      ).toBe(EXIT.runner);
      expect(
        (await run(['delegate', 'demo-skill', '--task', 'T', '--runner', 'not json', ...base])).code,
      ).toBe(EXIT.runner);
      expect((await run(['delegate', 'demo-skill', ...base])).code).toBe(EXIT.usage);
    } finally {
      if (saved === undefined) delete process.env.AGENTSKILLS_SUBAGENT_CMD;
      else process.env.AGENTSKILLS_SUBAGENT_CMD = saved;
    }
  });

  it('installs for a chosen agent and creates new skills', async () => {
    const project = tempDir();
    expect((await run(['install', '--list'])).out).toContain('skill-authoring');
    const installed = await run(['install', '--target', project, '--agent', 'claude-code', '--json']);
    expect((JSON.parse(installed.out) as { status: string }[]).every((a) => a.status === 'installed')).toBe(
      true,
    );
    expect(fs.existsSync(path.join(project, '.claude', 'skills', 'skill-authoring', 'SKILL.md'))).toBe(true);
    expect((await run(['install', '--target', project, '--agent', 'emacs'])).code).toBe(EXIT.usage);
    expect(
      (await run(['new', 'fresh-skill', '--description', 'Does a thing. Use when asked.', '--path', project]))
        .code,
    ).toBe(EXIT.ok);
    expect((await run(['validate', path.join(project, 'fresh-skill')])).code).toBe(EXIT.ok);
    expect((await run(['new', 'Bad Name', '--description', 'd', '--path', project])).code).toBe(EXIT.usage);
  });

  it('rejects unknown commands and flags, and prints help', async () => {
    expect((await run(['frobnicate'])).code).toBe(EXIT.usage);
    expect((await run(['list', '--nope'])).code).toBe(EXIT.usage);
    expect((await run(['catalog', '--format', 'yaml', ...ISOLATED])).code).toBe(EXIT.usage);
    const help = await run(['--help']);
    expect(help.code).toBe(EXIT.ok);
    expect(help.out).toContain('exit codes:');
  });
});
