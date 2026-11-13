# agentskills

Python implementation of the [Agent Skills](https://agentskills.io) format, plus a pack of skills ready to install in any project.

- **Library and CLI**: parse, validate, discover, disclose, activate and delegate skills.
- **Skill pack**: the skills in [`skills/`](skills/) ship inside the package.
- **Subagents**: skills can run in an isolated session so the main conversation receives only a summary.
- **Neutral**: no model SDK, no vendor API, no shell scripts. Runs on Windows, macOS and Linux with Python 3.10+.

## Install

From a release tag:

```
pip install "rmaneschy-agentskills @ git+https://github.com/rmaneschy/agentskills@v0.1.0"
```

Without installing:

```
uvx --from git+https://github.com/rmaneschy/agentskills agentskills --help
pipx run --spec git+https://github.com/rmaneschy/agentskills agentskills --help
```

From GitHub Packages (container registry):

```
docker run --rm -v "$PWD:/work" -w /work ghcr.io/rmaneschy/agentskills install
```

GitHub Packages has no Python registry, so the wheel is attached to each GitHub Release and the container image is what goes to GitHub Packages.

## Use the skill pack

```
agentskills install --list            # what is bundled
agentskills install --target .        # copy to ./.agents/skills
agentskills install repo-exploration --dest .claude/skills
```

`.agents/skills/` is the cross-client location. Existing skills are kept unless you pass `--force`.

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

Data goes to stdout, diagnostics to stderr, nothing prompts. Exit codes are listed in `agentskills --help`.

## Library

```python
from agentskills import Session, build_disclosure, default_scopes, discover

registry = discover(default_scopes("."))  # project > user > bundled
system_prompt_section = build_disclosure(registry)  # "" when there are no skills
session = Session(registry)
content = session.activate("skill-authoring").content
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
agentskills new my-skill --description "What it does. Use when ..." --path skills
agentskills validate skills --strict
pytest
```

See [AGENTS.md](AGENTS.md) for the rules of this repository.

## Develop

```
pip install -e ".[dev]"
ruff check . && ruff format --check .
pytest
agentskills validate skills --strict
```

## License

MIT. See [LICENSE](LICENSE).
