import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasErrors, validate } from '../src/index.js';
import { codes, makeSkill, tempDir } from './helpers.js';

const BASE = (name: string) => `name: ${name}\ndescription: Does a demo task. Use when asked for a demo.\n`;

describe('validator', () => {
  it('accepts a valid skill without diagnostics', () => {
    expect(validate(makeSkill('demo-skill', { root: tempDir() }))).toEqual([]);
  });

  it.each([
    'PDF-Processing',
    '-pdf',
    'pdf-',
    'pdf--processing',
    'pdf_processing',
    'pdf processing',
    'a'.repeat(65),
  ])('rejects the name %j', (name) => {
    const dir = makeSkill(name, {
      root: tempDir(),
      frontmatter: `name: "${name}"\ndescription: Does a demo. Use when asked.`,
    });
    const found = codes(validate(dir), 'error');
    expect(found.has('name-format') || found.has('name-length')).toBe(true);
  });

  it.each(['pdf-processing', 'a', 'x1-2y', 'a'.repeat(64)])('accepts the name %j', (name) => {
    expect(hasErrors(validate(makeSkill(name, { root: tempDir() })))).toBe(false);
  });

  it('requires the name to match the directory', () => {
    expect(
      codes(validate(makeSkill('demo-skill', { root: tempDir(), dirName: 'other-name' })), 'error'),
    ).toContain('name-directory');
  });

  it('checks the description', () => {
    const root = tempDir();
    expect(codes(validate(makeSkill('no-desc', { root, frontmatter: 'name: no-desc' })), 'error')).toContain(
      'description-required',
    );
    const long = makeSkill('long-desc', {
      root,
      frontmatter: `name: long-desc\ndescription: Use when ${'x'.repeat(1024)}`,
    });
    expect(codes(validate(long), 'error')).toContain('description-length');
    const vague = validate(
      makeSkill('vague', { root, frontmatter: 'name: vague\ndescription: Helps with PDFs.' }),
    );
    expect(codes(vague, 'warning')).toContain('description-trigger');
    expect(hasErrors(vague)).toBe(false);
  });

  it('checks optional fields', () => {
    const root = tempDir();
    const check = (name: string, extra: string) =>
      codes(validate(makeSkill(name, { root, frontmatter: BASE(name) + extra })));
    expect(check('c1', `compatibility: ${'x'.repeat(501)}`)).toContain('compatibility-length');
    expect(check('c2', 'compatibility: ""')).toContain('compatibility-type');
    expect(check('m1', 'metadata: text')).toContain('metadata-type');
    expect(check('m2', 'metadata:\n  version: 1.0')).toContain('metadata-value');
    expect(check('t1', 'allowed-tools: [Read]')).toContain('allowed-tools-type');
    expect(check('u1', 'color: blue')).toContain('unknown-field');
    expect(check('k1', 'disable-model-invocation: true')).not.toContain('unknown-field');
  });

  it('checks the execution mode', () => {
    const root = tempDir();
    const fm = (name: string, mode: string) => `${BASE(name)}metadata:\n  agentskills.execution: "${mode}"`;
    expect(
      codes(validate(makeSkill('e1', { root, frontmatter: fm('e1', 'background') })), 'error'),
    ).toContain('execution-mode');
    expect(validate(makeSkill('e2', { root, frontmatter: fm('e2', 'subagent') }))).toEqual([]);
  });

  it('treats an unquoted colon as an error', () => {
    const dir = makeSkill('colon', {
      root: tempDir(),
      frontmatter: 'name: colon\ndescription: Use this skill when: asked for a demo',
    });
    expect(codes(validate(dir), 'error')).toContain('yaml-invalid');
  });

  it('reports structural problems', () => {
    const root = tempDir();
    expect(codes(validate(path.join(root, 'missing')))).toEqual(new Set(['not-a-directory']));
    const empty = path.join(root, 'empty');
    fs.mkdirSync(empty);
    expect(codes(validate(empty))).toEqual(new Set(['skill-md-missing']));
    const broken = makeSkill('broken', { root });
    fs.writeFileSync(path.join(broken, 'SKILL.md'), 'no frontmatter here');
    expect(codes(validate(broken))).toEqual(new Set(['frontmatter-invalid']));
  });

  it('warns about body size', () => {
    const root = tempDir();
    const long = Array.from({ length: 600 }, (_, i) => `line ${i}`).join('\n');
    expect(codes(validate(makeSkill('long', { root, body: long })), 'warning')).toContain('body-lines');
    expect(codes(validate(makeSkill('heavy', { root, body: 'word '.repeat(6000) })), 'warning')).toContain(
      'body-tokens',
    );
    expect(codes(validate(makeSkill('empty-body', { root, body: '' })), 'warning')).toContain('body-empty');
  });

  it('checks file references', () => {
    const root = tempDir();
    const ok = makeSkill('refs-ok', {
      root,
      body: 'See [guide](references/guide.md) and run scripts/run.mjs. Docs: [site](https://example.com).',
      files: { 'references/guide.md': 'Guide', 'scripts/run.mjs': 'console.log(1)' },
    });
    expect(validate(ok)).toEqual([]);
    const missing = validate(
      makeSkill('refs-missing', { root, body: 'See [guide](references/guide.md) and run scripts/run.mjs.' }),
    );
    expect(codes(missing, 'error')).toContain('reference-missing');
    expect(codes(missing, 'warning')).toContain('resource-missing');
    const nested = makeSkill('refs-nested', {
      root,
      body: 'See [guide](references/guide.md).',
      files: { 'references/guide.md': 'More in [deep](references/deep.md)', 'references/deep.md': 'x' },
    });
    expect(codes(validate(nested), 'warning')).toContain('reference-depth');
  });

  it('ignores sample links inside fenced code blocks of a reference file', () => {
    const root = tempDir();
    const sample = [
      'Glossary map format:',
      '',
      '```md',
      '- [Ordering](./src/ordering/GLOSSARY.md)',
      '```',
    ].join('\n');
    const fenced = makeSkill('refs-fenced', {
      root,
      body: 'See [guide](references/guide.md).',
      files: { 'references/guide.md': sample },
    });
    expect(validate(fenced)).toEqual([]);
    const outside = makeSkill('refs-after-fence', {
      root,
      body: 'See [guide](references/guide.md).',
      files: {
        'references/guide.md': `${sample}\n\nMore in [deep](references/deep.md)`,
        'references/deep.md': 'x',
      },
    });
    expect(codes(validate(outside), 'warning')).toContain('reference-depth');
  });
});
