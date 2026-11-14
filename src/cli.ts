#!/usr/bin/env node
/** Command line interface. Data goes to stdout, diagnostics to stderr, and it never prompts. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ParseArgsConfig, parseArgs } from 'node:util';
import { Session } from './activation.js';
import {
  ACTIVATION_MODES,
  type ActivationMode,
  CATALOG_FORMATS,
  type CatalogFormat,
  buildDisclosure,
} from './catalog.js';
import { CommandRunner, buildBrief, delegate, parseRunnerCommand, runnerFromEnv } from './delegation.js';
import { DEFAULT_CLIENT_DIRS, type Registry, defaultScopes, discover, findSkillDirs } from './discovery.js';
import {
  AGENT_DESTINATIONS,
  bundledSkillNames,
  installSkills,
  packageVersion,
  scaffoldSkill,
} from './installer.js';
import {
  RunnerError,
  SKILL_FILE,
  SkillError,
  SkillNotFoundError,
  formatDiagnostic,
  propertiesToObject,
  skillExecution,
} from './models.js';
import { readProperties } from './parser.js';
import { hasErrors, validate } from './validator.js';

export const EXIT = { ok: 0, invalid: 1, usage: 2, notFound: 3, runner: 4 } as const;

const HELP = `agentskills ${packageVersion()}
Work with Agent Skills: validate, discover, disclose, activate, delegate and install.

usage: agentskills <command> [options]

commands:
  validate <path>...            check skill directories against the specification
      --strict                  treat warnings as failures
      --json                    print the report as JSON
  read-properties <dir>         print a skill's frontmatter as JSON
  list                          list the skills visible from a project
      --json
  catalog                       print the instructions and skill catalog for a system prompt
      --format xml|json|markdown    (default: xml)
      --activation file-read|tool   how the model loads a skill (default: file-read)
      --exclude <name>          hide a skill, repeatable
  activate <name>               print a skill's instructions, wrapped for the conversation
      --include-frontmatter
  delegate <name> --task <text> run a skill in an isolated subagent session, print only its summary
      --input <file>            input file to mention in the brief, repeatable
      --output-dir <dir>        where the subagent must save its outputs
      --print-brief             print the subagent brief and exit, without running anything
      --runner <json>           agent command as a JSON array, e.g. '["my-agent", "--print"]'
      --timeout <seconds>
      --transcript-dir <dir>    where to save the full output (default: system temp directory)
      --max-summary-chars <n>   (default: 4000)
      --json
  install [name]...             copy bundled skills into a project (default: all)
      --target <dir>            project directory (default: current directory)
      --agent <agent>           ${Object.keys(AGENT_DESTINATIONS).join(' | ')} (default: universal)
      --dest <dir>              destination inside the project; overrides --agent
      --force                   replace skills edited locally or not installed by this tool
      --dry-run                 show what would change without writing
      --list                    list bundled skills and exit
      --json
  new <name> --description <text>   create a skill from the template
      --path <dir>              parent directory (default: skills)
      --subagent                mark the skill to run in a subagent session

discovery options (list, catalog, activate, delegate):
      --project <dir>           project directory (default: current directory)
      --client-dir <dir>        folder holding a skills/ directory, repeatable (default: ${DEFAULT_CLIENT_DIRS.join(' ')})
      --untrusted               do not load project-level skills
      --no-user                 do not load user-level skills
      --no-bundled              do not load the skills bundled with this package

exit codes:
  0  success
  1  validation found errors (or warnings with --strict)
  2  wrong usage or invalid argument
  3  skill or path not found
  4  the subagent runner failed

environment:
  AGENTSKILLS_SUBAGENT_CMD      default subagent runner, as a JSON array

examples:
  agentskills validate skills --strict
  agentskills install --target . --agent claude-code
  agentskills catalog --format xml
  agentskills delegate repo-exploration --task "Where is authentication configured?" --print-brief
`;

class UsageError extends SkillError {}

type Options = NonNullable<ParseArgsConfig['options']>;
const DISCOVERY: Options = {
  project: { type: 'string', default: '.' },
  'client-dir': { type: 'string', multiple: true },
  untrusted: { type: 'boolean', default: false },
  'no-user': { type: 'boolean', default: false },
  'no-bundled': { type: 'boolean', default: false },
};

interface Parsed {
  values: Record<string, string | boolean | string[] | undefined>;
  positionals: string[];
}

function parse(args: string[], options: Options): Parsed {
  try {
    return parseArgs({ args, options, allowPositionals: true, strict: true }) as Parsed;
  } catch (cause) {
    throw new UsageError(cause instanceof Error ? cause.message : String(cause));
  }
}

interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
}

const emit = (io: Io, data: unknown): void => io.out(JSON.stringify(data, null, 2));

function registryFrom(values: Parsed['values'], io: Io): Registry {
  const registry = discover(
    defaultScopes({
      projectDir: values.project as string,
      clientDirs: (values['client-dir'] as string[] | undefined) ?? DEFAULT_CLIENT_DIRS,
      projectTrusted: !values.untrusted,
      includeUser: !values['no-user'],
      includeBundled: !values['no-bundled'],
    }),
  );
  for (const diagnostic of registry.diagnostics) io.err(formatDiagnostic(diagnostic));
  return registry;
}

function requireName(positionals: string[], what: string): string {
  const name = positionals[0];
  if (!name) throw new UsageError(`missing ${what}. Run 'agentskills --help' for usage.`);
  return name;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], flag: string): T {
  if (!allowed.includes(value as T)) {
    throw new UsageError(`${flag} must be one of: ${allowed.join(', ')}. Received: ${JSON.stringify(value)}`);
  }
  return value as T;
}

function positiveNumber(value: unknown, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new UsageError(`${flag} must be a positive number. Received: ${value}`);
  return number;
}

const commands: Record<string, (args: string[], io: Io) => number | Promise<number>> = {
  validate(args, io) {
    const { values, positionals } = parse(args, { strict: { type: 'boolean' }, json: { type: 'boolean' } });
    if (positionals.length === 0) throw new UsageError('validate needs at least one path');
    const targets: string[] = [];
    for (const raw of positionals) {
      if (!fs.existsSync(raw)) {
        io.err(`Error: ${raw} does not exist.`);
        return EXIT.notFound;
      }
      const nested = fs.existsSync(path.join(raw, SKILL_FILE)) ? [] : findSkillDirs(raw);
      targets.push(...(nested.length > 0 ? nested : [raw]));
    }
    let failed = false;
    const report = targets.map((target) => {
      const diagnostics = validate(target);
      const bad = hasErrors(diagnostics) || (Boolean(values.strict) && diagnostics.length > 0);
      failed ||= bad;
      if (!values.json) {
        for (const diagnostic of diagnostics) io.err(formatDiagnostic(diagnostic));
        io.out(`${bad ? 'FAIL' : 'ok  '} ${target}`);
      }
      return { skill: target, valid: !bad, diagnostics };
    });
    if (values.json) emit(io, report);
    return failed ? EXIT.invalid : EXIT.ok;
  },

  'read-properties'(args, io) {
    const { positionals } = parse(args, {});
    emit(io, propertiesToObject(readProperties(requireName(positionals, 'skill directory'))));
    return EXIT.ok;
  },

  list(args, io) {
    const { values } = parse(args, { ...DISCOVERY, json: { type: 'boolean' } });
    const rows = registryFrom(values, io)
      .list()
      .map((skill) => ({
        name: skill.properties.name,
        scope: skill.scope,
        execution: skillExecution(skill),
        description: skill.properties.description,
        location: skill.location,
      }));
    if (values.json) emit(io, rows);
    else for (const row of rows) io.out([row.name, row.scope, row.execution, row.location].join('\t'));
    return EXIT.ok;
  },

  catalog(args, io) {
    const { values } = parse(args, {
      ...DISCOVERY,
      format: { type: 'string', default: 'xml' },
      activation: { type: 'string', default: 'file-read' },
      exclude: { type: 'string', multiple: true },
    });
    const text = buildDisclosure(registryFrom(values, io), {
      format: oneOf<CatalogFormat>(values.format, CATALOG_FORMATS, '--format'),
      activation: oneOf<ActivationMode>(values.activation, ACTIVATION_MODES, '--activation'),
      exclude: (values.exclude as string[] | undefined) ?? [],
    });
    if (text) io.out(text);
    return EXIT.ok;
  },

  activate(args, io) {
    const { values, positionals } = parse(args, { ...DISCOVERY, 'include-frontmatter': { type: 'boolean' } });
    const session = new Session(registryFrom(values, io));
    io.out(
      session.activate(requireName(positionals, 'skill name'), {
        includeFrontmatter: Boolean(values['include-frontmatter']),
      }).content,
    );
    return EXIT.ok;
  },

  async delegate(args, io) {
    const { values, positionals } = parse(args, {
      ...DISCOVERY,
      task: { type: 'string' },
      input: { type: 'string', multiple: true },
      'output-dir': { type: 'string' },
      'print-brief': { type: 'boolean' },
      runner: { type: 'string' },
      timeout: { type: 'string' },
      'transcript-dir': { type: 'string' },
      'max-summary-chars': { type: 'string' },
      json: { type: 'boolean' },
    });
    const name = requireName(positionals, 'skill name');
    const task = values.task as string | undefined;
    if (!task || task.trim().length === 0) throw new UsageError('--task is required and must not be empty');
    const registry = registryFrom(values, io);
    const skill = registry.get(name);
    if (!skill) {
      throw new SkillNotFoundError(
        `skill ${JSON.stringify(name)} is not available. Available skills: ${registry.names().join(', ') || 'none'}`,
      );
    }
    const briefOptions = {
      inputs: (values.input as string[] | undefined) ?? [],
      outputDir: values['output-dir'] as string | undefined,
    };
    if (values['print-brief']) {
      io.out(buildBrief(skill, task, briefOptions));
      return EXIT.ok;
    }
    const runner = values.runner
      ? new CommandRunner(parseRunnerCommand(values.runner as string))
      : runnerFromEnv();
    if (!runner) {
      io.err(
        [
          'Error: no subagent runner configured.',
          `       Pass --runner '["<agent-cli>", "<flags>"]' or set AGENTSKILLS_SUBAGENT_CMD to the same JSON array.`,
          '       If your agent has native subagents, use --print-brief and hand the text to its subagent tool.',
        ].join('\n'),
      );
      return EXIT.usage;
    }
    const result = await delegate(skill, task, runner, {
      ...briefOptions,
      cwd: values.project as string,
      transcriptDir: values['transcript-dir'] as string | undefined,
      timeout: positiveNumber(values.timeout, '--timeout'),
      maxSummaryChars: positiveNumber(values['max-summary-chars'], '--max-summary-chars'),
    });
    if (values.json) emit(io, result);
    else {
      io.out(result.summary);
      io.err(`transcript: ${result.transcript}`);
    }
    return result.exitCode === 0 ? EXIT.ok : EXIT.runner;
  },

  install(args, io) {
    const { values, positionals } = parse(args, {
      target: { type: 'string', default: '.' },
      agent: { type: 'string', default: 'universal' },
      dest: { type: 'string' },
      force: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      list: { type: 'boolean' },
      json: { type: 'boolean' },
    });
    if (values.list) {
      for (const name of bundledSkillNames()) io.out(name);
      return EXIT.ok;
    }
    const agent = oneOf(values.agent, Object.keys(AGENT_DESTINATIONS), '--agent');
    const actions = installSkills(values.target as string, {
      names: positionals,
      destination: (values.dest as string | undefined) ?? AGENT_DESTINATIONS[agent],
      force: Boolean(values.force),
      dryRun: Boolean(values['dry-run']),
    });
    if (values.json) emit(io, actions);
    else for (const action of actions) io.out([action.status, action.name, action.target].join('\t'));
    return EXIT.ok;
  },

  new(args, io) {
    const { values, positionals } = parse(args, {
      description: { type: 'string' },
      path: { type: 'string', default: 'skills' },
      subagent: { type: 'boolean' },
    });
    const description = values.description as string | undefined;
    if (!description)
      throw new UsageError('--description is required: say what the skill does and when to use it');
    io.out(
      scaffoldSkill(
        values.path as string,
        requireName(positionals, 'skill name'),
        description,
        Boolean(values.subagent),
      ),
    );
    return EXIT.ok;
  },
};

const defaultIo: Io = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
};

export async function main(argv: string[], io: Io = defaultIo): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    io.out(HELP);
    return command ? EXIT.ok : EXIT.usage;
  }
  if (command === '--version' || command === '-v') {
    io.out(`agentskills ${packageVersion()}`);
    return EXIT.ok;
  }
  const handler = commands[command];
  if (!handler) {
    io.err(
      `Error: unknown command ${JSON.stringify(command)}. Commands: ${Object.keys(commands).join(', ')}.`,
    );
    return EXIT.usage;
  }
  try {
    return await handler(rest, io);
  } catch (error) {
    if (!(error instanceof SkillError) && !(error instanceof RangeError)) throw error;
    io.err(`Error: ${error.message}`);
    if (error instanceof SkillNotFoundError) return EXIT.notFound;
    if (error instanceof RunnerError) return EXIT.runner;
    return EXIT.usage;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      process.stderr.write(
        `Unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : error}\n`,
      );
      process.exitCode = 70;
    },
  );
}
