# AGENTS.md

Python implementation of the [Agent Skills](https://agentskills.io) format and a pack of skills shipped inside the package. This file tells coding agents how to work in this repository. Human-facing documentation is in `README.md`.

## Setup and checks

```
python -m pip install -e ".[dev]"
ruff check . && ruff format --check .
python -m pytest
agentskills validate skills --strict
```

All four must pass before a change is finished. `ruff format .` fixes formatting. Run one test with `python -m pytest tests/test_validator.py -k name`.

## Layout

```
src/agentskills/
  models.py       data types, limits and constants; no I/O
  parser.py       SKILL.md -> frontmatter + body (lenient)
  validator.py    strict check of one skill against the spec
  discovery.py    scan scopes, apply precedence, build the Registry
  catalog.py      tier 1: name + description for the model
  activation.py   tier 2: wrapped instructions, resource listing, session
  delegation.py   subagent brief, Runner protocol, CommandRunner
  installer.py    bundled pack: locate, install, scaffold
  cli.py          argparse front end over the layers above
skills/           the skill pack; each directory is one skill
tests/            pytest; fake_agent.py stands in for an agent CLI
```

Dependencies point one way: `models` <- `parser` <- `validator`, `discovery` <- `catalog`, `activation` <- `delegation`; `cli` may import anything; nothing imports `cli`. Keep it that way.

## Rules that do not bend

1. **Follow the specification.** Field names, limits and naming rules come from https://agentskills.io/specification. When the spec and this code disagree, the code is wrong. Limits live in `models.py` only.
2. **Lenient loading, strict validation.** `discovery` warns and loads; only a missing description or unparseable YAML skips a skill. `validator` reports every violation as an error.
3. **No model, no vendor.** Do not import an LLM SDK or call a model API anywhere in `src/`. Model access goes through the `Runner` protocol or through text handed to the caller.
4. **Every operating system.** Use `pathlib`; read and write text with `encoding="utf-8"`; start processes with an argument list and never `shell=True`; no `.sh`, `.ps1` or `.bat` files in `src/` or `skills/`. Skill scripts are Python.
5. **One runtime dependency: PyYAML.** Adding another needs a stated reason in the pull request.
6. **Diagnostic codes are public.** `Diagnostic.code` values are matched by users and CI. Add codes freely; rename or remove one only with a CHANGELOG entry.
7. **CLI contract.** Data on stdout, diagnostics on stderr, no prompts, exit codes as listed in `agentskills --help`. A new failure mode gets its own documented code.
8. **Tests come with the change.** New behaviour has a test; a bug fix has a test that failed before it. Do not weaken or delete a test to make the suite pass.
9. **Do not copy third-party or employer-owned skills into `skills/`.** Every skill here must be original or carry a compatible license stated in its `license` field.

## Adding a skill to the pack

1. `agentskills new <name> --description "<what it does>. Use when <situations>." --path skills`
   Add `--subagent` if the skill reads broadly or produces long output.
2. Write the body following the bundled `skill-authoring` skill (`skills/skill-authoring/SKILL.md`) and its checklist.
3. `agentskills validate skills --strict` must print no errors and no warnings.
4. `python -m pytest`: `tests/test_installer_cli.py` checks every bundled skill automatically. Add the name to the expected set in `test_bundled_skills_are_valid_without_warnings` only if the skill is meant to be permanent.
5. Add a line to `CHANGELOG.md` and to the skill list in `README.md` if one exists.

Nothing else needs registering: the wheel includes the whole `skills/` directory.

## Changing a layer

- A new frontmatter rule: constant in `models.py`, check in `validator.py`, case in `tests/test_validator.py`.
- A new scan location: `default_scopes` in `discovery.py`. Project scopes come before user scopes, bundled is last.
- A new catalog format: `render_catalog` in `catalog.py`, and the `--format` choices in `cli.py`.
- A new way to run subagents: implement the `Runner` protocol. Do not special-case a vendor inside `CommandRunner`.
- A new CLI command: one `_cmd_*` function, one subparser, one test in `tests/test_installer_cli.py`.

## Use subagents to keep your context clean

If your environment can start subagents, delegate these and keep only the conclusion:

| Work | Delegate | Ask it to return |
|---|---|---|
| Finding where something is handled across `src/` and `tests/` | read-only exploration | file paths with line numbers, at most 10 lines |
| Running the full check suite | test runner | pass or fail, and for failures the test name and the assertion message only |
| Reviewing a finished change | reviewer that has not seen the implementation | findings ordered by severity, each with file, line and a failing scenario |
| Trying a skill on realistic prompts | one subagent per prompt, with and without the skill | what was produced and whether each expectation held |

Give each subagent a task that stands alone, the exact paths, and the return format. Do not paste its transcript into the main conversation. Without subagents, do the same work in a separate session. The `context-isolation` skill in this repository describes the method in full, and `agentskills delegate <skill> --task "..." --print-brief` produces a ready brief.

Do not delegate the decision itself: read the cited lines before acting on a subagent's report.

## Commits and pull requests

- Branch from `main`; never push to `main` directly.
- One logical change per pull request. Title in the imperative: `Add reference depth check to validator`.
- The description says what changed, why, and how it was verified, with the commands run.
- Update `CHANGELOG.md` under an `Unreleased` heading for anything a user would notice.

## Releasing

1. Set the version in `pyproject.toml` and in `src/agentskills/__init__.py` (they must match), and date the CHANGELOG entry.
2. Merge to `main`, then tag: `git tag v<version> && git push origin v<version>`.
3. The `release` workflow tests, builds, attaches the wheel, sdist and skills zip to a GitHub Release, and pushes the container image to `ghcr.io/rmaneschy/agentskills`.

GitHub Packages has no Python registry. Do not add a step that uploads the wheel there; the wheel is installed from the release or from the git tag.

## Out of scope for now

- Running evals (`evals/evals.json`, grading, benchmarks). The spec describes them; this package does not implement them yet.
- Trigger-rate testing of descriptions.
- Any hosted service.
