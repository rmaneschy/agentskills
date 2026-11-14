import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CommandRunner,
  ENV_RUNNER,
  type RunOutput,
  RunnerError,
  type Skill,
  buildBrief,
  delegate,
  extractSummary,
  loadSkill,
  parseRunnerCommand,
  planSpawn,
  resolveExecutable,
  runnerFromEnv,
} from '../src/index.js';
import { makeSkill, tempDir } from './helpers.js';

const FAKE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fake-agent.mjs');
const NODE = process.execPath;
const SUBAGENT_FM =
  'name: explore\ndescription: Explores things. Use when exploring.\nmetadata:\n  agentskills.execution: "subagent"';

function exploreSkill(): Skill {
  return loadSkill(
    makeSkill('explore', { root: tempDir(), frontmatter: SUBAGENT_FM, body: '# Explore\n\nRead only.' }),
  ).skill!;
}

describe('brief and summary', () => {
  it('builds a self-contained brief that does not tell the subagent to delegate', () => {
    const brief = buildBrief(exploreSkill(), 'Find the entry point', { inputs: ['a.ts'], outputDir: 'out' });
    expect(brief).toContain('<skill_content name="explore">');
    expect(brief).toContain('Read only.');
    expect(brief).toContain('## Task\nFind the entry point');
    expect(brief).toContain('- a.ts');
    expect(brief).toContain('under: out');
    expect(brief).toContain('<summary>...</summary>');
    expect(brief).not.toContain('meant to run in a separate subagent');
    expect(() => buildBrief(exploreSkill(), '   ')).toThrow(RangeError);
  });

  it('prefers the last summary block and truncates long output', () => {
    expect(extractSummary('log\n<summary>first</summary>\nmore\n<SUMMARY>\nlast\n</SUMMARY>')).toEqual({
      summary: 'last',
      truncated: false,
    });
    expect(extractSummary('  only output  ')).toEqual({ summary: 'only output', truncated: false });
    const cut = extractSummary(`${'x'.repeat(50)}END`, 10);
    expect(cut.truncated).toBe(true);
    expect(cut.summary.endsWith('END')).toBe(true);
  });
});

describe('command runner', () => {
  it.each([
    ['standard input', [NODE, FAKE]],
    ['a prompt file', [NODE, FAKE, '--from-file', '{prompt_file}']],
    ['an argument', [NODE, FAKE, '--from-arg', '{prompt}']],
  ])('delivers the brief through %s', async (_label, argv) => {
    const dir = tempDir();
    const result = await delegate(exploreSkill(), 'Do it', new CommandRunner(argv), {
      cwd: dir,
      transcriptDir: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.summary).toContain('task seen: true');
    expect(result.summary).toContain('ação concluída');
    expect(result.summary).not.toContain('noise line');
    const transcript = fs.readFileSync(result.transcript, 'utf8');
    expect(transcript).toContain('noise line');
    expect(transcript).toContain('# Brief');
  });

  it('falls back to the tail of the output when there is no summary', async () => {
    const dir = tempDir();
    const runner = new CommandRunner([NODE, FAKE, '--no-summary']);
    const result = await delegate(exploreSkill(), 'Do it', runner, {
      cwd: dir,
      transcriptDir: dir,
      maxSummaryChars: 40,
    });
    expect(result.truncated).toBe(true);
    expect(result.summary.length).toBeLessThan(80);
  });

  it('reports failure with the exit code and stderr', async () => {
    const dir = tempDir();
    const result = await delegate(exploreSkill(), 'Do it', new CommandRunner([NODE, FAKE, '--fail']), {
      cwd: dir,
      transcriptDir: dir,
    });
    expect(result.exitCode).toBe(7);
    expect(result.summary).toContain('boom');
  });

  it('raises clear errors', () => {
    const cwd = tempDir();
    expect(() => new CommandRunner(['definitely-not-a-real-agent-cli']).run('x', { cwd })).toThrow(
      /not found on PATH/,
    );
    expect(() => new CommandRunner([]).run('x', { cwd })).toThrow(/empty/);
    const slow = new CommandRunner([NODE, '-e', 'setTimeout(() => {}, 5000)']);
    expect(() => slow.run('x', { cwd, timeout: 0.5 })).toThrow(/did not finish/);
  });

  it('reads its configuration from the environment', () => {
    expect(runnerFromEnv({})).toBeUndefined();
    expect(runnerFromEnv({ [ENV_RUNNER]: '["agent", "--print"]' })?.argv).toEqual(['agent', '--print']);
    for (const bad of ['agent --print', '[]', '["a", 1]', '{"a": 1}']) {
      expect(() => parseRunnerCommand(bad)).toThrow(RunnerError);
    }
  });

  it('accepts any object with a run method, sync or async', async () => {
    const dir = tempDir();
    const custom = {
      run: async (): Promise<RunOutput> => ({
        text: '<summary>custom runner</summary>',
        exitCode: 0,
        durationMs: 1,
      }),
    };
    expect((await delegate(exploreSkill(), 'Do it', custom, { transcriptDir: dir })).summary).toBe(
      'custom runner',
    );
  });
});

describe('cross-platform process start', () => {
  const noFile = () => 'C:\\tmp\\brief.md';

  it('uses standard input by default and no shell for real executables', () => {
    const plan = planSpawn(['agent', '--print'], 'BRIEF', '/usr/bin/agent', 'linux');
    expect(plan).toMatchObject({ file: '/usr/bin/agent', args: ['--print'], stdin: 'BRIEF', shell: false });
    expect(planSpawn(['agent'], 'B', 'C:\\bin\\agent.exe', 'win32').shell).toBe(false);
  });

  it('starts Windows batch shims through the command interpreter, never with the brief as an argument', () => {
    const plan = planSpawn(
      ['agent', '--file', '{prompt_file}', 'two words'],
      'BRIEF',
      'C:\\Program Files\\npm\\agent.cmd',
      'win32',
      noFile,
    );
    expect(plan.shell).toBe(true);
    expect(plan.file).toBe('"C:\\Program Files\\npm\\agent.cmd"');
    expect(plan.args).toEqual(['--file', 'C:\\tmp\\brief.md', '"two words"']);
    expect(plan.stdin).toBeUndefined();
    expect(() => planSpawn(['agent', '{prompt}'], 'BRIEF', 'C:\\npm\\agent.cmd', 'win32')).toThrow(
      /batch file/,
    );
  });

  it('resolves executables with PATHEXT on Windows', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'agent.CMD'), '');
    fs.writeFileSync(path.join(dir, 'tool'), '');
    expect(resolveExecutable('agent', { PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')).toBe(
      path.join(dir, 'agent.CMD'),
    );
    expect(resolveExecutable('tool', { PATH: dir }, 'linux')).toBe(path.join(dir, 'tool'));
    expect(resolveExecutable('missing', { PATH: dir }, 'linux')).toBeUndefined();
  });
});
