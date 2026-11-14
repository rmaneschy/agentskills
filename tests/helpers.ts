import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import type { Diagnostic } from '../src/index.js';

const created: string[] = [];

/** A fresh temporary directory, removed after the test. */
export function tempDir(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agentskills-test-')));
  created.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of created.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

export interface MakeSkillOptions {
  root: string;
  frontmatter?: string;
  body?: string;
  files?: Record<string, string>;
  dirName?: string;
}

/** Create a skill directory and return its path. */
export function makeSkill(name: string, options: MakeSkillOptions): string {
  const skillDir = path.join(options.root, options.dirName ?? name);
  fs.mkdirSync(skillDir, { recursive: true });
  const frontmatter =
    options.frontmatter ??
    `name: ${name}\ndescription: Does a demo task end to end. Use when the user asks for a demo.`;
  const body = options.body ?? '# Demo\n\n1. Do the thing.\n';
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}`, 'utf8');
  for (const [relative, content] of Object.entries(options.files ?? {})) {
    const target = path.join(skillDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  return skillDir;
}

export function codes(diagnostics: Diagnostic[], level?: 'error' | 'warning'): Set<string> {
  return new Set(diagnostics.filter((d) => !level || d.level === level).map((d) => d.code));
}
