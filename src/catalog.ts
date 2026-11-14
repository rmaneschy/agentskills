/**
 * Layer 3: tell the model which skills exist without loading their instructions.
 *
 * This is tier 1 of progressive disclosure: name and description only, about
 * 50 to 100 tokens per skill. The output is plain text any model can read.
 */
import type { Registry } from './discovery.js';
import type { Skill } from './models.js';

export type CatalogFormat = 'xml' | 'json' | 'markdown';
export type ActivationMode = 'file-read' | 'tool';
export const ACTIVATION_TOOL_NAME = 'activate_skill';
export const CATALOG_FORMATS: readonly CatalogFormat[] = ['xml', 'json', 'markdown'];
export const ACTIVATION_MODES: readonly ActivationMode[] = ['file-read', 'tool'];

const INSTRUCTIONS: Record<ActivationMode, string> = {
  'file-read': [
    'The following skills provide specialized instructions for specific tasks.',
    "When a task matches a skill's description, use your file-read tool to load",
    'the SKILL.md at the listed location before proceeding.',
    "When a skill references relative paths, resolve them against the skill's",
    'directory (the parent of SKILL.md) and use absolute paths in tool calls.',
  ].join('\n'),
  tool: [
    'The following skills provide specialized instructions for specific tasks.',
    `When a task matches a skill's description, call the ${ACTIVATION_TOOL_NAME} tool`,
    "with the skill's name to load its full instructions.",
  ].join('\n'),
};

export function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Skills the model may see: not excluded and not opted out of model invocation. */
export function visibleSkills(registry: Registry, exclude: Iterable<string> = []): Skill[] {
  const hidden = new Set(exclude);
  return registry
    .list()
    .filter(
      (skill) =>
        !hidden.has(skill.properties.name) && skill.properties.extra['disable-model-invocation'] !== true,
    );
}

/** Render the catalog. Returns an empty string when there are no skills. */
export function renderCatalog(
  skills: Skill[],
  format: CatalogFormat = 'xml',
  includeLocation = true,
): string {
  if (skills.length === 0) return '';
  if (format === 'json') {
    const entries = skills.map((skill) => ({
      name: skill.properties.name,
      description: skill.properties.description,
      ...(includeLocation ? { location: skill.location } : {}),
    }));
    return JSON.stringify({ available_skills: entries }, null, 2);
  }
  if (format === 'markdown') {
    return skills
      .map((skill) => {
        const suffix = includeLocation ? ` (\`${skill.location}\`)` : '';
        return `- **${skill.properties.name}**: ${skill.properties.description}${suffix}`;
      })
      .join('\n');
  }
  if (format === 'xml') {
    const lines = ['<available_skills>'];
    for (const skill of skills) {
      lines.push('  <skill>', `    <name>${escapeXml(skill.properties.name)}</name>`);
      lines.push(`    <description>${escapeXml(skill.properties.description)}</description>`);
      if (includeLocation) lines.push(`    <location>${escapeXml(skill.location)}</location>`);
      lines.push('  </skill>');
    }
    lines.push('</available_skills>');
    return lines.join('\n');
  }
  throw new RangeError(`unknown catalog format: ${JSON.stringify(format)}; expected xml, json or markdown`);
}

export function behavioralInstructions(activation: ActivationMode = 'file-read'): string {
  const text = INSTRUCTIONS[activation];
  if (!text)
    throw new RangeError(
      `unknown activation mode: ${JSON.stringify(activation)}; expected file-read or tool`,
    );
  return text;
}

export interface DisclosureOptions {
  format?: CatalogFormat;
  activation?: ActivationMode;
  exclude?: Iterable<string>;
}

/** Instructions plus catalog, ready for a system prompt. Empty when no skill is visible. */
export function buildDisclosure(registry: Registry, options: DisclosureOptions = {}): string {
  const skills = visibleSkills(registry, options.exclude);
  if (skills.length === 0) return '';
  const activation = options.activation ?? 'file-read';
  // With a dedicated tool the result carries the skill directory, so the location is not needed.
  const catalog = renderCatalog(skills, options.format ?? 'xml', activation === 'file-read');
  return `${behavioralInstructions(activation)}\n\n${catalog}`;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: { name: { type: 'string'; enum: string[]; description: string } };
    required: string[];
    additionalProperties: false;
  };
}

/**
 * Provider-neutral JSON Schema for an activation tool, or undefined when no skill is visible.
 * The name is constrained to the visible skills so the model cannot invent one.
 */
export function activationToolSchema(
  registry: Registry,
  exclude: Iterable<string> = [],
): ToolSchema | undefined {
  const skills = visibleSkills(registry, exclude);
  if (skills.length === 0) return undefined;
  return {
    name: ACTIVATION_TOOL_NAME,
    description: 'Load the full instructions of a skill listed in the skill catalog.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          enum: skills.map((skill) => skill.properties.name),
          description: 'Skill name',
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  };
}
