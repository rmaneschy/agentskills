/**
 * Layer 1a: read a SKILL.md into frontmatter and body.
 *
 * Parsing is lenient on purpose, following the client implementation guide:
 * skills written for other clients may carry YAML that is technically invalid
 * (most often an unquoted value containing a colon). Strictness lives in `validator`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ParseError, SKILL_FILE, type SkillProperties } from './models.js';

const DELIMITER = /^---[ \t]*$/;
const PLAIN_SCALAR_WITH_COLON = /^([A-Za-z0-9_-]+):[ \t]+(?!["'>|[{&*!])(.*:[ \t].*|.*:)$/;
const KNOWN = new Set(['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']);

export interface ParsedSkillFile {
  frontmatter: Record<string, unknown>;
  body: string;
  /** True when the YAML was invalid and had to be repaired to load. */
  repaired: boolean;
}

/** Split a SKILL.md into its YAML text and its Markdown body. */
export function splitFrontmatter(text: string): { yaml: string; body: string } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines.length === 0 || !DELIMITER.test(lines[0] ?? '')) {
    throw new ParseError("SKILL.md must start with a '---' line that opens the YAML frontmatter");
  }
  for (let index = 1; index < lines.length; index++) {
    if (DELIMITER.test(lines[index] ?? '')) {
      return {
        yaml: lines.slice(1, index).join('\n'),
        body: lines
          .slice(index + 1)
          .join('\n')
          .trim(),
      };
    }
  }
  throw new ParseError("frontmatter is not closed: expected a second '---' line");
}

/** Quote top-level plain scalars that contain a colon, the usual cross-client breakage. */
function repair(yamlText: string): string {
  return yamlText
    .split('\n')
    .map((line) => {
      const match = PLAIN_SCALAR_WITH_COLON.exec(line);
      return match ? `${match[1]}: ${JSON.stringify(match[2])}` : line;
    })
    .join('\n');
}

export function loadFrontmatter(yamlText: string): { data: Record<string, unknown>; repaired: boolean } {
  let data: unknown;
  let repaired = false;
  try {
    data = parseYaml(yamlText);
  } catch (firstError) {
    try {
      data = parseYaml(repair(yamlText));
      repaired = true;
    } catch {
      const reason = firstError instanceof Error ? firstError.message.split('\n')[0] : String(firstError);
      throw new ParseError(`frontmatter is not valid YAML: ${reason}`, { cause: firstError });
    }
  }
  if (data === null || data === undefined) data = {};
  if (typeof data !== 'object' || Array.isArray(data)) {
    throw new ParseError('frontmatter must be a YAML mapping of fields');
  }
  return { data: data as Record<string, unknown>, repaired };
}

export function findSkillFile(skillDir: string): string {
  const file = path.join(skillDir, SKILL_FILE);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new ParseError(`${SKILL_FILE} not found in ${skillDir}`);
  }
  return file;
}

export function parseSkillFile(file: string): ParsedSkillFile {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new ParseError(`cannot read ${file}: ${error instanceof Error ? error.message : error}`, {
      cause: error,
    });
  }
  const { yaml, body } = splitFrontmatter(text);
  const { data, repaired } = loadFrontmatter(yaml);
  return { frontmatter: data, body, repaired };
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === 'string' ? value : String(value);
}

/** Build SkillProperties, coercing scalars to strings. Requires name and description. */
export function toProperties(frontmatter: Record<string, unknown>): SkillProperties {
  const name = optionalText(frontmatter.name)?.trim();
  const description = optionalText(frontmatter.description)?.trim();
  if (!name) throw new ParseError("frontmatter field 'name' is required");
  if (!description) throw new ParseError("frontmatter field 'description' is required and must not be empty");
  const rawMetadata = frontmatter.metadata;
  const metadata: Record<string, string> = {};
  if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
    for (const [key, value] of Object.entries(rawMetadata)) metadata[key] = String(value);
  }
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) if (!KNOWN.has(key)) extra[key] = value;
  return {
    name,
    description,
    license: optionalText(frontmatter.license),
    compatibility: optionalText(frontmatter.compatibility),
    metadata,
    allowedTools: optionalText(frontmatter['allowed-tools']),
    extra,
  };
}

/** Lenient read of a skill directory's properties. */
export function readProperties(skillDir: string): SkillProperties {
  return toProperties(parseSkillFile(findSkillFile(skillDir)).frontmatter);
}

/** Markdown body of a SKILL.md, without the frontmatter. */
export function readBody(skillFile: string): string {
  return parseSkillFile(skillFile).body;
}
