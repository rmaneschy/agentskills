# agentskills

A pack of [Agent Skills](https://agentskills.io) to share, and a TypeScript library and CLI that implement the format: validate, discover, disclose, activate and delegate skills.

- **Skill pack** in [`skills/`](skills/): install it with the tool you already use.
- **Subagents**: a skill can run in an isolated session so the main conversation receives only a summary.
- **Neutral**: no model SDK, no vendor API, no shell scripts. Node 20+, on Windows, macOS and Linux.

## Skills

| Skill | Mode | What it is for |
|---|---|---|
| [`skill-authoring`](skills/skill-authoring/SKILL.md) | inline | Create or improve a skill so it validates and triggers on the right requests |
| [`context-isolation`](skills/context-isolation/SKILL.md) | inline | Decide when and how to hand work to a subagent and keep the main context small |
| [`repo-exploration`](skills/repo-exploration/SKILL.md) | subagent | Answer a question about an unfamiliar repository, read-only, with file references |
| [`ddd-domain-architect`](skills/ddd-domain-architect/SKILL.md) | inline | Map, group, review and refactor a business domain in code with Domain-Driven Design |

## Install the skills

Pick **one** method per agent. Installing the same skills twice makes every skill appear twice.

### Any agent, with the skills CLI

```
npx skills@latest add rmaneschy/agentskills
```

Copies editable files into the agent's skills folder. Add `-a <agent>` to choose the agent and `--skill <name>` to pick one skill. Update with `npx skills@latest update`.

### Claude Code, as a plugin

```
claude plugin marketplace add rmaneschy/agentskills
claude plugin install rmaneschy-skills@rmaneschy
```

Turn on auto-update for the marketplace in `/plugin` to follow new commits.

### This package's CLI

```
npx github:rmaneschy/agentskills install --target .
npx github:rmaneschy/agentskills install --target . --agent claude-code
```

`--agent` accepts `universal` (`.agents/skills`, the default), `claude-code`, `cursor` and `copilot`. The CLI records what it installed in `.agentskills-lock.json`: running it again updates untouched skills and leaves the ones you edited alone unless you pass `--force`.

### From GitHub Packages

The package is published as `@rmaneschy/agentskills` on the GitHub Packages npm registry. GitHub requires a token to install from that registry, even for public packages, so each person needs a personal access token with `read:packages` in their `~/.npmrc`:

```
@rmaneschy:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
```

```
npm install -g @rmaneschy/agentskills
agentskills install --target .
```

If that is too much setup for the people you share with, use one of the three methods above: they need no token while the repository is public.

## CLI

| Command | What it does |
|---|---|
| `validate <path>...` | Check skills against the specification. `--strict` fails on warnings |
| `read-properties <dir>` | Print the frontmatter as JSON |
| `list` | Skills visible from a project: project, user and bundled scopes |
| `catalog` | Instructions plus catalog for a system prompt (`--format xml\|json\|markdown`) |
| `activate <name>` | A skill's instructions wrapped in `<skill_content>` with its resource list |
| `delegate <name> --task ...` | Run a skill in a subagent session and print only the summary |
| `install [names]` | Copy bundled skills into a project |
| `new <name> --description ...` | Create a skill from the template |

Data goes to stdout, diagnostics to stderr, nothing prompts. `agentskills --help` lists every flag and exit code.

## Library

```ts
import { Session, buildDisclosure, defaultScopes, discover } from '@rmaneschy/agentskills';

const registry = discover(defaultScopes({ projectDir: '.' })); // project > user > bundled
const systemPromptSection = buildDisclosure(registry);         // '' when there are no skills
const session = new Session(registry);
const { content } = session.activate('skill-authoring');
```

## Subagents

A skill opts in through metadata:

```yaml
metadata:
  agentskills.execution: "subagent"
```

Two ways to run it, neither tied to a model:

```
# 1. Your agent has a native subagent tool: get the brief and hand it over
agentskills delegate repo-exploration --task "Where is auth configured?" --print-brief

# 2. Any agent CLI as an isolated child process
export AGENTSKILLS_SUBAGENT_CMD='["<agent-cli>", "<non-interactive-flag>"]'
agentskills delegate repo-exploration --task "Where is auth configured?" --json
```

The brief is sent on standard input unless an argument contains `{prompt_file}` or `{prompt}`. Only the `<summary>` block comes back; the full output is saved to a transcript file.

## Add a skill to the pack

```
npm run build
node dist/cli.js new my-skill --description "What it does. Use when ..." --path skills
npm run check
```

See [AGENTS.md](AGENTS.md) for the rules of this repository.

## Develop

```
npm ci
npm run check     # typecheck, lint, build, tests, skill validation
npm run format    # fix formatting and lint
```

## Credits

The layout follows practices from [mattpocock/skills](https://github.com/mattpocock/skills) (flat `skills/` folder, plugin manifest, one install method per agent), [tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills) (lockfile with content hashing, path and symlink guards) and [vercel-labs/skills](https://github.com/vercel-labs/skills) (the `npx skills add` layout). The format is defined by [agentskills.io](https://agentskills.io/specification).

## License

MIT. See [LICENSE](LICENSE). `ddd-domain-architect` adapts material from other authors, part of it under CC BY 4.0; its attribution is in [`skills/ddd-domain-architect/NOTICE.md`](skills/ddd-domain-architect/NOTICE.md).
