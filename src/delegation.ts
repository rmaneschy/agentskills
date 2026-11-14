/**
 * Layer 5: run a skill in a separate subagent session to keep the main context clean.
 *
 * The main conversation never sees the subagent's working context. It receives a
 * short summary; the full output goes to a transcript file that can be opened
 * only if needed.
 *
 * Nothing here knows about a model or a vendor. A runner is anything that takes
 * a prompt and returns text: `CommandRunner` starts any agent CLI as a child
 * process, and a harness with native subagents can skip runners entirely and
 * pass the text from `buildBrief` to its own subagent tool.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { wrapSkillContent } from './activation.js';
import { RunnerError, type Skill } from './models.js';

export const ENV_RUNNER = 'AGENTSKILLS_SUBAGENT_CMD';
export const DEFAULT_SUMMARY_WORDS = 200;
export const DEFAULT_SUMMARY_CHARS = 4000;
const SUMMARY_BLOCK = /<summary>([\s\S]*?)<\/summary>/gi;
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;

export interface RunOutput {
  text: string;
  exitCode: number;
  durationMs: number;
}

export interface RunOptions {
  cwd: string;
  /** Seconds to wait before giving up. */
  timeout?: number;
}

/** Starts one isolated agent session with `brief` as its only input. */
export interface Runner {
  run(brief: string, options: RunOptions): RunOutput | Promise<RunOutput>;
}

export interface SubagentResult {
  skill: string;
  summary: string;
  truncated: boolean;
  exitCode: number;
  durationMs: number;
  /** File holding the brief and the subagent's full output. */
  transcript: string;
}

/** Find an executable on PATH the way the operating system would, including PATHEXT on Windows. */
export function resolveExecutable(
  command: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const isFile = (candidate: string): boolean => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  };
  const extensions =
    platform === 'win32' ? ['', ...(env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)] : [''];
  const delimiter = platform === 'win32' ? ';' : ':';
  const hasDir = command.includes('/') || (platform === 'win32' && command.includes('\\'));
  const dirs = hasDir ? [''] : (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const extension of extensions) {
      const candidate = dir ? path.join(dir, command + extension) : command + extension;
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

export interface SpawnPlan {
  file: string;
  args: string[];
  /** Brief to write on standard input, when it is not passed another way. */
  stdin?: string;
  /** Windows batch shims (.cmd, .bat) can only be started through the command interpreter. */
  shell: boolean;
  /** Temporary file to delete after the run. */
  promptFile?: string;
}

/**
 * Decide how to start the runner. The brief is delivered through:
 * - `{prompt_file}` in an argument: replaced by the path of a UTF-8 file holding the brief;
 * - `{prompt}` in an argument: replaced by the brief itself (mind OS command-line limits);
 * - otherwise: standard input.
 */
export function planSpawn(
  argv: readonly string[],
  brief: string,
  executable: string,
  platform: NodeJS.Platform = process.platform,
  writePromptFile: (text: string) => string = defaultPromptFile,
): SpawnPlan {
  const shell = platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
  let stdin: string | undefined = brief;
  let promptFile: string | undefined;
  const args = argv.slice(1).map((arg) => {
    let value = arg;
    if (value.includes('{prompt_file}')) {
      promptFile ??= writePromptFile(brief);
      value = value.replaceAll('{prompt_file}', promptFile);
      stdin = undefined;
    }
    if (value.includes('{prompt}')) {
      if (shell) {
        throw new RunnerError(
          `${path.basename(executable)} is a batch file, so the brief cannot be passed as an argument safely; use {prompt_file} or standard input`,
        );
      }
      value = value.replaceAll('{prompt}', brief);
      stdin = undefined;
    }
    return value;
  });
  const quote = (value: string): string =>
    /[\s"&|<>^]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return shell
    ? { file: quote(executable), args: args.map(quote), stdin, shell, promptFile }
    : { file: executable, args, stdin, shell, promptFile };
}

function defaultPromptFile(text: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentskills-brief-'));
  const file = path.join(dir, 'brief.md');
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

/** Runs an agent CLI as a child process on any operating system. `argv` is the command as a list. */
export class CommandRunner implements Runner {
  constructor(
    readonly argv: readonly string[],
    readonly env?: Record<string, string>,
  ) {}

  run(brief: string, options: RunOptions): RunOutput {
    const command = this.argv[0];
    if (!command) throw new RunnerError('runner command is empty');
    const executable = resolveExecutable(command);
    if (!executable)
      throw new RunnerError(`runner executable ${JSON.stringify(command)} was not found on PATH`);
    const plan = planSpawn(this.argv, brief, executable);
    const started = Date.now();
    try {
      const done = spawnSync(plan.file, plan.args, {
        input: plan.stdin,
        encoding: 'utf8',
        cwd: options.cwd,
        timeout: options.timeout === undefined ? undefined : options.timeout * 1000,
        env: this.env ? { ...process.env, ...this.env } : process.env,
        shell: plan.shell,
        windowsHide: true,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      if (done.error) {
        const code = (done.error as NodeJS.ErrnoException).code;
        if (code === 'ETIMEDOUT')
          throw new RunnerError(`subagent did not finish within ${options.timeout} seconds`);
        throw new RunnerError(`could not start subagent: ${done.error.message}`, { cause: done.error });
      }
      const exitCode = done.status ?? 1;
      let text = done.stdout ?? '';
      if (exitCode !== 0 && done.stderr) text = `${text}\n[stderr]\n${done.stderr}`.trim();
      return { text, exitCode, durationMs: Date.now() - started };
    } finally {
      if (plan.promptFile) fs.rmSync(path.dirname(plan.promptFile), { recursive: true, force: true });
    }
  }
}

/** Parse a runner command written as a JSON array of strings. */
export function parseRunnerCommand(value: string): string[] {
  let argv: unknown;
  try {
    argv = JSON.parse(value);
  } catch (cause) {
    throw new RunnerError('runner command must be a JSON array, for example ["my-agent", "--print"]', {
      cause,
    });
  }
  if (!Array.isArray(argv) || argv.length === 0 || !argv.every((item) => typeof item === 'string')) {
    throw new RunnerError('runner command must be a non-empty JSON array of strings');
  }
  return argv as string[];
}

/** Runner configured through AGENTSKILLS_SUBAGENT_CMD, or undefined when unset. */
export function runnerFromEnv(env: NodeJS.ProcessEnv = process.env): CommandRunner | undefined {
  const value = (env[ENV_RUNNER] ?? '').trim();
  return value ? new CommandRunner(parseRunnerCommand(value)) : undefined;
}

export interface BriefOptions {
  inputs?: readonly string[];
  outputDir?: string;
  maxSummaryWords?: number;
}

/** Self-contained instructions for a subagent that starts with an empty context. */
export function buildBrief(skill: Skill, task: string, options: BriefOptions = {}): string {
  if (task.trim().length === 0) throw new RangeError('task must not be empty');
  const lines = [
    'You are a subagent working on one delegated task. You start with no prior context,',
    'and the agent that delegated to you will see only your final summary.',
    '',
    '## Skill to follow',
    wrapSkillContent(skill, { delegationHint: false }),
    '',
    '## Task',
    task.trim(),
  ];
  if (options.inputs && options.inputs.length > 0) {
    lines.push('', '## Input files', ...options.inputs.map((item) => `- ${item}`));
  }
  if (options.outputDir !== undefined) {
    lines.push('', '## Outputs', `Save every file you produce under: ${options.outputDir}`);
  }
  lines.push(
    '',
    '## How to report',
    `End your reply with one <summary>...</summary> block of at most ${options.maxSummaryWords ?? DEFAULT_SUMMARY_WORDS} words containing:`,
    '1. the result, or the reason the task could not be completed;',
    '2. the files you created or changed, with paths;',
    '3. open questions or risks the delegating agent must know about.',
    'If the skill defines its own report format, put that report inside the block instead.',
    'Do not put logs, file contents or intermediate reasoning inside the summary.',
  );
  return lines.join('\n');
}

/** The last <summary> block, or the end of the output when the subagent did not write one. */
export function extractSummary(
  text: string,
  maxChars = DEFAULT_SUMMARY_CHARS,
): { summary: string; truncated: boolean } {
  const blocks = [...text.matchAll(SUMMARY_BLOCK)];
  const summary = (blocks.length > 0 ? blocks[blocks.length - 1]![1]! : text).trim();
  if (summary.length <= maxChars) return { summary, truncated: false };
  return { summary: `[...truncated...]\n${summary.slice(-maxChars)}`, truncated: true };
}

export interface DelegateOptions extends BriefOptions {
  cwd?: string;
  transcriptDir?: string;
  timeout?: number;
  maxSummaryChars?: number;
}

/** Run `task` with `skill` in an isolated session and return only the summary. */
export async function delegate(
  skill: Skill,
  task: string,
  runner: Runner,
  options: DelegateOptions = {},
): Promise<SubagentResult> {
  const brief = buildBrief(skill, task, options);
  const output = await runner.run(brief, { cwd: options.cwd ?? process.cwd(), timeout: options.timeout });
  const folder = options.transcriptDir ?? path.join(os.tmpdir(), 'agentskills-transcripts');
  fs.mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
  const transcript = path.join(folder, `${skill.properties.name}-${stamp}-${process.pid}.md`);
  fs.writeFileSync(transcript, `# Brief\n\n${brief}\n\n# Output\n\n${output.text}\n`, 'utf8');
  const extracted = extractSummary(output.text, options.maxSummaryChars ?? DEFAULT_SUMMARY_CHARS);
  return {
    skill: skill.properties.name,
    summary: extracted.summary || `The subagent produced no output (exit code ${output.exitCode}).`,
    truncated: extracted.truncated,
    exitCode: output.exitCode,
    durationMs: output.durationMs,
    transcript,
  };
}
