/**
 * Layer 1b: strict validation of one skill directory against the specification.
 *
 * Errors are violations of the spec. Warnings are recommendations from the spec
 * and the authoring guides (size limits, reference depth, description wording).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  type Diagnostic,
  EXECUTION_KEY,
  EXECUTION_MODES,
  MAX_BODY_LINES,
  MAX_BODY_TOKENS,
  MAX_COMPATIBILITY_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  ParseError,
  SKILL_FILE,
  SPEC_FIELDS,
  estimateTokens,
} from './models.js';
import { parseSkillFile } from './parser.js';

export const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MD_LINK = /\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)/g;
const RESOURCE_PATH = /(?<![\w./-])((?:scripts|references|assets)\/[\w./-]+\.\w+)/g;
const TRIGGER_HINT = /\buse (?:this skill )?(?:when|for|if|whenever)\b|\bquando\b|\bwhen\b/i;
/** Extra frontmatter keys other clients are known to use. Accepted without a warning. */
export const KNOWN_CLIENT_FIELDS: ReadonlySet<string> = new Set(['disable-model-invocation']);

const error = (code: string, message: string, file: string): Diagnostic => ({
  level: 'error',
  code,
  message,
  path: file,
});
const warning = (code: string, message: string, file: string): Diagnostic => ({
  level: 'warning',
  code,
  message,
  path: file,
});

export function validateName(name: unknown, dirName: string | undefined, file: string): Diagnostic[] {
  if (typeof name !== 'string' || name.length === 0) {
    return [error('name-required', "'name' is required and must be a non-empty string", file)];
  }
  const out: Diagnostic[] = [];
  if (name.length > MAX_NAME_LENGTH) {
    out.push(
      error('name-length', `'name' has ${name.length} characters; maximum is ${MAX_NAME_LENGTH}`, file),
    );
  }
  if (!NAME_PATTERN.test(name)) {
    out.push(
      error(
        'name-format',
        `'name' is ${JSON.stringify(name)}; use lowercase letters, digits and single hyphens, not starting or ending with a hyphen (example: pdf-processing)`,
        file,
      ),
    );
  }
  if (dirName !== undefined && name !== dirName) {
    out.push(
      error(
        'name-directory',
        `'name' is ${JSON.stringify(name)} but the directory is ${JSON.stringify(dirName)}; they must match`,
        file,
      ),
    );
  }
  return out;
}

function relativeTargets(text: string): { links: Set<string>; bare: Set<string> } {
  const links = new Set<string>();
  for (const match of text.matchAll(MD_LINK)) {
    const target = match[1]!;
    if (!target.includes('://') && !target.startsWith('mailto:') && !target.startsWith('/'))
      links.add(target);
  }
  const bare = new Set<string>();
  for (const match of text.matchAll(RESOURCE_PATH)) if (!links.has(match[1]!)) bare.add(match[1]!);
  return { links, bare };
}

function checkReferences(skillDir: string, body: string, skillFile: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const { links, bare } = relativeTargets(body);
  for (const target of [...links].sort()) {
    const resolved = path.join(skillDir, target);
    if (!fs.existsSync(resolved)) {
      out.push(
        error(
          'reference-missing',
          `link target ${JSON.stringify(target)} does not exist in the skill directory`,
          skillFile,
        ),
      );
    } else if (resolved.toLowerCase().endsWith('.md') && fs.statSync(resolved).isFile()) {
      const nested = relativeTargets(fs.readFileSync(resolved, 'utf8'));
      const nestedMd = [...nested.links, ...nested.bare]
        .filter((t) => t.toLowerCase().endsWith('.md'))
        .sort();
      if (nestedMd.length > 0) {
        out.push(
          warning(
            'reference-depth',
            `${target} points to further files (${nestedMd.join(', ')}); keep references one level deep from ${SKILL_FILE}`,
            resolved,
          ),
        );
      }
    }
  }
  for (const target of [...bare].sort()) {
    if (!fs.existsSync(path.join(skillDir, target))) {
      out.push(
        warning(
          'resource-missing',
          `${JSON.stringify(target)} is mentioned but does not exist in the skill directory`,
          skillFile,
        ),
      );
    }
  }
  return out;
}

/** Validate one skill directory. An empty list means the skill is valid and clean. */
export function validate(skillDir: string): Diagnostic[] {
  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) {
    return [error('not-a-directory', 'path is not a directory', skillDir)];
  }
  const skillFile = path.join(skillDir, SKILL_FILE);
  const entries = fs.readdirSync(skillDir);
  if (!entries.includes(SKILL_FILE)) {
    const lookalike = entries.find((entry) => entry.toLowerCase() === SKILL_FILE.toLowerCase());
    const hint = lookalike
      ? ` (found ${JSON.stringify(lookalike)}; the file name must be exactly ${SKILL_FILE})`
      : '';
    return [error('skill-md-missing', `${SKILL_FILE} not found${hint}`, skillDir)];
  }
  let parsed: ReturnType<typeof parseSkillFile>;
  try {
    parsed = parseSkillFile(skillFile);
  } catch (cause) {
    if (cause instanceof ParseError) return [error('frontmatter-invalid', cause.message, skillFile)];
    throw cause;
  }
  const { frontmatter, body, repaired } = parsed;
  const out: Diagnostic[] = [];
  if (repaired) {
    out.push(
      error(
        'yaml-invalid',
        'frontmatter is not valid YAML (a value contains an unquoted colon); wrap the value in quotes',
        skillFile,
      ),
    );
  }
  out.push(...validateName(frontmatter.name, path.basename(path.resolve(skillDir)), skillFile));

  const description = frontmatter.description;
  if (typeof description !== 'string' || description.trim().length === 0) {
    out.push(
      error('description-required', "'description' is required and must be a non-empty string", skillFile),
    );
  } else {
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      out.push(
        error(
          'description-length',
          `'description' has ${description.length} characters; maximum is ${MAX_DESCRIPTION_LENGTH}`,
          skillFile,
        ),
      );
    }
    if (description.trim().length < 40 || !TRIGGER_HINT.test(description)) {
      out.push(
        warning(
          'description-trigger',
          "'description' should say what the skill does and when to use it (for example: 'Use when ...')",
          skillFile,
        ),
      );
    }
  }

  const compatibility = frontmatter.compatibility;
  if (compatibility !== undefined && compatibility !== null) {
    if (typeof compatibility !== 'string' || compatibility.trim().length === 0) {
      out.push(
        error('compatibility-type', "'compatibility' must be a non-empty string when present", skillFile),
      );
    } else if (compatibility.length > MAX_COMPATIBILITY_LENGTH) {
      out.push(
        error(
          'compatibility-length',
          `'compatibility' has ${compatibility.length} characters; maximum is ${MAX_COMPATIBILITY_LENGTH}`,
          skillFile,
        ),
      );
    }
  }

  for (const key of ['license', 'allowed-tools']) {
    const value = frontmatter[key];
    if (value !== undefined && value !== null && typeof value !== 'string') {
      out.push(error(`${key}-type`, `'${key}' must be a string`, skillFile));
    }
  }

  const metadata = frontmatter.metadata;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      out.push(
        error('metadata-type', "'metadata' must be a mapping of string keys to string values", skillFile),
      );
    } else {
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value !== 'string') {
          out.push(
            error(
              'metadata-value',
              `metadata entry ${JSON.stringify(key)} must map a string to a string; quote the value (got ${JSON.stringify(value)})`,
              skillFile,
            ),
          );
        }
      }
      const mode = (metadata as Record<string, unknown>)[EXECUTION_KEY];
      if (typeof mode === 'string' && !EXECUTION_MODES.has(mode)) {
        out.push(
          error(
            'execution-mode',
            `metadata '${EXECUTION_KEY}' is ${JSON.stringify(mode)}; expected one of ${[...EXECUTION_MODES].sort().join(', ')}`,
            skillFile,
          ),
        );
      }
    }
  }

  const unknown = Object.keys(frontmatter)
    .filter((key) => !SPEC_FIELDS.has(key) && !KNOWN_CLIENT_FIELDS.has(key))
    .sort();
  if (unknown.length > 0) {
    out.push(
      warning(
        'unknown-field',
        `fields not defined by the specification: ${unknown.join(', ')}; put custom data under 'metadata'`,
        skillFile,
      ),
    );
  }

  if (body.length === 0) out.push(warning('body-empty', 'the body has no instructions', skillFile));
  const lines = body.length === 0 ? 0 : body.split('\n').length;
  if (lines > MAX_BODY_LINES) {
    out.push(
      warning(
        'body-lines',
        `body has ${lines} lines; keep ${SKILL_FILE} under ${MAX_BODY_LINES} and move detail to references/`,
        skillFile,
      ),
    );
  }
  const tokens = estimateTokens(body);
  if (tokens > MAX_BODY_TOKENS) {
    out.push(
      warning(
        'body-tokens',
        `body is about ${tokens} tokens; the recommended limit is ${MAX_BODY_TOKENS}`,
        skillFile,
      ),
    );
  }

  out.push(...checkReferences(skillDir, body, skillFile));
  return out;
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.level === 'error');
}
