import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ParseError,
  loadFrontmatter,
  propertiesToObject,
  readBody,
  readProperties,
  splitFrontmatter,
  toProperties,
} from '../src/index.js';
import { makeSkill, tempDir } from './helpers.js';

describe('parser', () => {
  it('handles BOM and CRLF', () => {
    const { yaml, body } = splitFrontmatter('﻿---\r\nname: a\r\ndescription: b\r\n---\r\n\r\nBody\r\n');
    expect(yaml).toBe('name: a\ndescription: b');
    expect(body).toBe('Body');
  });

  it.each(['# no frontmatter', '', '---\nname: a\n'])(
    'rejects missing or unclosed frontmatter: %j',
    (text) => {
      expect(() => splitFrontmatter(text)).toThrow(ParseError);
    },
  );

  it('repairs an unquoted colon', () => {
    const { data, repaired } = loadFrontmatter(
      'name: pdf\ndescription: Use this skill when: the user asks about PDFs',
    );
    expect(repaired).toBe(true);
    expect(data.description).toBe('Use this skill when: the user asks about PDFs');
  });

  it('does not report valid YAML as repaired', () => {
    const { data, repaired } = loadFrontmatter(
      'name: pdf\ndescription: "Use when: PDFs"\nlicense: https://example.com/license',
    );
    expect(repaired).toBe(false);
    expect(data.license).toBe('https://example.com/license');
  });

  it('rejects non-mapping and unparseable frontmatter', () => {
    expect(() => loadFrontmatter('- a\n- b')).toThrow(ParseError);
    expect(() => loadFrontmatter('name: [unclosed')).toThrow(/not valid YAML/);
  });

  it('coerces scalars and keeps extra fields', () => {
    const props = toProperties({
      name: 123,
      description: 'd',
      metadata: { version: 1.5, author: 'me' },
      'allowed-tools': 'Read',
      'disable-model-invocation': true,
    });
    expect(props.name).toBe('123');
    expect(props.metadata).toEqual({ version: '1.5', author: 'me' });
    expect(props.extra).toEqual({ 'disable-model-invocation': true });
    expect(propertiesToObject(props)['allowed-tools']).toBe('Read');
  });

  it.each([{ name: 'a' }, { description: 'd' }, { name: 'a', description: '  ' }])(
    'requires name and description: %j',
    (fm) => {
      expect(() => toProperties(fm)).toThrow(ParseError);
    },
  );

  it('reads properties and body from disk', () => {
    const root = tempDir();
    const skillDir = makeSkill('demo-skill', { root, body: 'Line one\n\nLine two\n' });
    expect(readProperties(skillDir).name).toBe('demo-skill');
    expect(readBody(path.join(skillDir, 'SKILL.md'))).toBe('Line one\n\nLine two');
    expect(() => readProperties(root)).toThrow(ParseError);
  });
});
