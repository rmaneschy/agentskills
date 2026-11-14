import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultScopes, discover, findSkillDirs, loadSkill } from '../src/index.js';
import { makeSkill, tempDir } from './helpers.js';

describe('discovery', () => {
  it('matches only SKILL.md and skips noise', () => {
    const root = path.join(tempDir(), 'skills');
    makeSkill('alpha', { root, files: { 'references/SKILL.md': 'not a skill' } });
    makeSkill('beta', { root: path.join(root, 'group') });
    makeSkill('hidden', { root: path.join(root, 'node_modules') });
    fs.writeFileSync(path.join(root, 'README.md'), 'x');
    expect(findSkillDirs(root).map((dir) => path.basename(dir))).toEqual(['alpha', 'beta']);
  });

  it('respects scan bounds', () => {
    const root = path.join(tempDir(), 'skills');
    makeSkill('deep', { root: path.join(root, 'a', 'b', 'c') });
    expect(findSkillDirs(root, { maxDepth: 2 })).toEqual([]);
    expect(findSkillDirs(root, { maxDepth: 4 })).toHaveLength(1);
    expect(findSkillDirs(root, { maxDirs: 2 })).toEqual([]);
    expect(findSkillDirs(path.join(root, 'nope'))).toEqual([]);
  });

  it('lets the project override the user scope and reports the collision', () => {
    const base = tempDir();
    const project = path.join(base, 'project');
    const home = path.join(base, 'home');
    makeSkill('shared', { root: path.join(project, '.agents', 'skills') });
    makeSkill('shared', { root: path.join(home, '.agents', 'skills') });
    makeSkill('only-user', { root: path.join(home, '.agents', 'skills') });
    const registry = discover(defaultScopes({ projectDir: project, home, includeBundled: false }));
    expect(registry.names()).toEqual(['only-user', 'shared']);
    expect(registry.get('shared')?.scope).toBe('project');
    expect(registry.diagnostics.map((d) => d.code)).toEqual(['name-collision']);
  });

  it('loads nothing from an untrusted project', () => {
    const base = tempDir();
    makeSkill('from-project', { root: path.join(base, 'project', '.agents', 'skills') });
    const scopes = defaultScopes({
      projectDir: path.join(base, 'project'),
      home: path.join(base, 'home'),
      projectTrusted: false,
      includeBundled: false,
    });
    expect(discover(scopes).size).toBe(0);
  });

  it('scans extra client directories', () => {
    const base = tempDir();
    const project = path.join(base, 'project');
    makeSkill('one', { root: path.join(project, '.claude', 'skills') });
    makeSkill('two', { root: path.join(project, '.agents', 'skills') });
    const scopes = defaultScopes({
      projectDir: project,
      home: path.join(base, 'home'),
      clientDirs: ['.agents', '.claude'],
      includeBundled: false,
    });
    expect(discover(scopes).names()).toEqual(['one', 'two']);
  });

  it('loads leniently and skips only unusable skills', () => {
    const root = path.join(tempDir(), 'skills');
    makeSkill('good', { root });
    makeSkill('mismatch', { root, dirName: 'other-dir' });
    makeSkill('colon', { root, frontmatter: 'name: colon\ndescription: Use this when: asked for a demo' });
    makeSkill('no-desc', { root, frontmatter: 'name: no-desc' });
    makeSkill('bad-yaml', { root, frontmatter: 'name: [unclosed' });
    const registry = discover([{ name: 'path', root }]);
    expect(registry.names()).toEqual(['colon', 'good', 'mismatch']);
    expect(new Set(registry.diagnostics.map((d) => d.code))).toEqual(
      new Set(['name-directory', 'yaml-repaired', 'skill-skipped']),
    );
    expect(registry.diagnostics.filter((d) => d.code === 'skill-skipped')).toHaveLength(2);
  });

  it('keeps quiet when an installed copy shadows a bundled skill', () => {
    const base = tempDir();
    makeSkill('shared', { root: path.join(base, 'project') });
    makeSkill('shared', { root: path.join(base, 'bundled') });
    const registry = discover([
      { name: 'project', root: path.join(base, 'project') },
      { name: 'bundled', root: path.join(base, 'bundled') },
    ]);
    expect(registry.get('shared')?.scope).toBe('project');
    expect(registry.diagnostics).toEqual([]);
  });

  it('stores an absolute location', () => {
    const { skill, diagnostics } = loadSkill(makeSkill('demo-skill', { root: tempDir() }));
    expect(diagnostics).toEqual([]);
    expect(path.isAbsolute(skill!.location)).toBe(true);
  });
});
