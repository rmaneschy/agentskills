import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  Registry,
  Session,
  SkillNotFoundError,
  activationToolSchema,
  buildDisclosure,
  discover,
  listResources,
  renderCatalog,
  skillBaseDir,
} from '../src/index.js';
import { makeSkill, tempDir } from './helpers.js';

function sampleRegistry(): Registry {
  const root = path.join(tempDir(), 'skills');
  makeSkill('alpha', {
    root,
    frontmatter: 'name: alpha\ndescription: "Handles <tags> & things. Use when asked."',
  });
  makeSkill('beta', {
    root,
    files: {
      'scripts/run.mjs': 'x',
      'references/guide.md': 'g',
      '.hidden/x': 'h',
      'node_modules/pkg/i.js': 'c',
    },
  });
  makeSkill('manual-only', {
    root,
    frontmatter:
      'name: manual-only\ndescription: Only runs when the user asks. Use when invoked by name.\ndisable-model-invocation: true',
  });
  return discover([{ name: 'path', root }]);
}

describe('catalog', () => {
  it('produces nothing when there are no skills', () => {
    const empty = new Registry();
    expect(buildDisclosure(empty)).toBe('');
    expect(renderCatalog([])).toBe('');
    expect(activationToolSchema(empty)).toBeUndefined();
  });

  it('escapes XML and hides opted-out skills', () => {
    const text = buildDisclosure(sampleRegistry(), { format: 'xml' });
    expect(text.startsWith('The following skills provide specialized instructions')).toBe(true);
    expect(text).toContain('Handles &lt;tags&gt; &amp; things');
    expect(text).toContain('<name>beta</name>');
    expect(text).toContain('<location>');
    expect(text).not.toContain('manual-only');
  });

  it('renders JSON and Markdown and rejects unknown formats', () => {
    const skills = sampleRegistry().list();
    const data = JSON.parse(renderCatalog(skills, 'json')) as { available_skills: { name: string }[] };
    expect(data.available_skills.map((entry) => entry.name)).toEqual(['alpha', 'beta', 'manual-only']);
    expect(renderCatalog(skills, 'markdown', false)).toContain('- **alpha**:');
    expect(() => renderCatalog(skills, 'yaml' as never)).toThrow(RangeError);
  });

  it('omits locations in tool mode and constrains the tool to visible names', () => {
    const registry = sampleRegistry();
    const text = buildDisclosure(registry, { activation: 'tool', exclude: ['alpha'] });
    expect(text).toContain('activate_skill');
    expect(text).not.toContain('<location>');
    expect(text).not.toContain('alpha');
    expect(activationToolSchema(registry)?.parameters.properties.name.enum).toEqual(['alpha', 'beta']);
  });
});

describe('activation', () => {
  it('wraps the body, lists resources and deduplicates', () => {
    const registry = sampleRegistry();
    const session = new Session(registry);
    const first = session.activate('beta');
    expect(first.content.startsWith('<skill_content name="beta">')).toBe(true);
    expect(first.content.endsWith('</skill_content>')).toBe(true);
    expect(first.content).not.toContain('name: beta');
    expect(first.content).toContain('<file>references/guide.md</file>');
    expect(first.content).toContain('<file>scripts/run.mjs</file>');
    expect(first.content).not.toMatch(/\.hidden|node_modules|SKILL\.md<\/file>/);
    expect(first.content).toContain('Skill directory:');
    const second = session.activate('beta');
    expect(second.alreadyActive).toBe(true);
    expect(second.content).toContain('already loaded');
    expect(session.allowlistedDirs()).toEqual([skillBaseDir(registry.get('beta')!)]);
  });

  it('can keep the frontmatter and names the available skills on a miss', () => {
    const registry = sampleRegistry();
    expect(new Session(registry).activate('alpha', { includeFrontmatter: true }).content).toContain(
      'name: alpha',
    );
    expect(() => new Session(registry).activate('nope')).toThrow(SkillNotFoundError);
    expect(() => new Session(registry).activate('nope')).toThrow(
      /Available skills: alpha, beta, manual-only/,
    );
  });

  it('caps the resource listing', () => {
    const registry = sampleRegistry();
    const skill = registry.get('beta')!;
    const assets = path.join(skillBaseDir(skill), 'assets');
    fs.mkdirSync(assets);
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(assets, `f${i}.txt`), 'x');
    const { paths, truncated } = listResources(skill, 3);
    expect(paths).toHaveLength(3);
    expect(truncated).toBe(true);
    expect(new Session(registry).activate('beta', { maxResources: 3 }).content).toContain(
      'listing truncated',
    );
  });
});
