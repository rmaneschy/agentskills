# AGENTS.md

A pack of [Agent Skills](https://agentskills.io) plus the TypeScript library and CLI that implement the format. This file tells coding agents how to work in this repository. Human-facing documentation is in `README.md`.

## Setup and checks

```
npm ci
npm run check
```

`npm run check` runs the type check, Biome, the build, the tests and the strict validation of `skills/`. All of it must pass before a change is finished. `npm run format` fixes formatting. Run one test file with `npx vitest run tests/validator.test.ts`, one test with `-t "<name>"`.

Node 20 or newer. The CLI in a checkout is `node dist/cli.js` after `npm run build`.

## Layout

```
src/
  models.ts       types, limits, errors; no I/O
  parser.ts       SKILL.md -> frontmatter + body (lenient)
  validator.ts    strict check of one skill against the spec
  discovery.ts    scan scopes, apply precedence, build the Registry
  catalog.ts      tier 1: name + description for the model
  activation.ts   tier 2: wrapped instructions, resource listing, session
  delegation.ts   subagent brief, Runner interface, CommandRunner
  installer.ts    bundled pack: locate, install with lockfile, scaffold
  cli.ts          command line over the layers above
  index.ts        public exports
skills/           the skill pack; one directory per skill, flat
tests/            vitest; fake-agent.mjs stands in for an agent CLI
.claude-plugin/   marketplace and plugin manifests for Claude Code
```

Dependencies point down that list. `cli.ts` may import anything; nothing imports `cli.ts` except its test.

## Rules that do not bend

1. **Follow the specification.** Field names, limits and naming rules come from https://agentskills.io/specification. When the spec and this code disagree, the code is wrong. Limits live in `models.ts` only.
2. **Lenient loading, strict validation.** `discovery` warns and loads; only a missing description or unparseable YAML skips a skill. `validator` reports every violation as an error.
3. **No model, no vendor.** Do not add an LLM SDK or call a model API anywhere in `src/`. Model access goes through the `Runner` interface or through text handed to the caller.
4. **Every operating system.** Build paths with `node:path`; read and write text as UTF-8; start processes with an argument list (`planSpawn` decides when Windows needs the command interpreter); no `.sh`, `.ps1` or `.bat` files in `src/` or `skills/`. Skill scripts are Node.js (`.mjs`) or Python.
5. **One runtime dependency: `yaml`.** Adding another needs a stated reason in the pull request. Argument parsing uses `node:util`.
6. **Diagnostic codes are public.** `Diagnostic.code` values are matched by users and CI. Add codes freely; rename or remove one only with a CHANGELOG entry.
7. **CLI contract.** Data on stdout, diagnostics on stderr, no prompts, exit codes as listed in `agentskills --help`. A new failure mode gets its own documented code.
8. **Never follow symlinks inside a skill**, and never build a destination path from an unvalidated skill name. `installer.ts` and `activation.ts` enforce both; keep it that way.
9. **Tests come with the change.** New behaviour has a test; a bug fix has a test that failed before it. Do not weaken or delete a test to make the suite pass.
10. **Do not copy third-party or employer-owned skills into `skills/`.** Every skill here must be original or carry a compatible license stated in its `license` field.

## Adding a skill to the pack

1. `node dist/cli.js new <name> --description "<what it does>. Use when <situations>." --path skills`
   Add `--subagent` if the skill reads broadly or produces long output.
2. Write the body following `skills/skill-authoring/SKILL.md` and its checklist.
3. Keep `skills/` flat: `skills/<name>/SKILL.md`. Plugin loading and `npx skills add` both rely on it.
4. `npm run check` must pass: the tests validate every bundled skill with zero warnings and reject OS-specific scripts.
5. Add the skill to the table in `README.md` and a line to `CHANGELOG.md`.

Nothing else needs registering: the npm package and the plugin both ship the whole `skills/` directory.

## Changing a layer

- A new frontmatter rule: constant in `models.ts`, check in `validator.ts`, case in `tests/validator.test.ts`.
- A new scan location: `defaultScopes` in `discovery.ts`. Project scopes come before user scopes, bundled is last.
- A new agent destination for `install`: `AGENT_DESTINATIONS` in `installer.ts`. Confirm the folder in that agent's documentation first.
- A new catalog format: `renderCatalog` and `CATALOG_FORMATS` in `catalog.ts`.
- A new way to run subagents: implement `Runner`. Do not special-case a vendor inside `CommandRunner`.
- A new CLI command: one entry in `commands` in `cli.ts`, its lines in `HELP`, one test in `tests/installer-cli.test.ts`.

## Use subagents to keep your context clean

If your environment can start subagents, delegate these and keep only the conclusion:

| Work | Delegate | Ask it to return |
|---|---|---|
| Finding where something is handled across `src/` and `tests/` | read-only exploration | file paths with line numbers, at most 10 lines |
| Running `npm run check` | test runner | pass or fail, and for failures the test name and the assertion message only |
| Reviewing a finished change | reviewer that has not seen the implementation | findings ordered by severity, each with file, line and a failing scenario |
| Trying a skill on realistic prompts | one subagent per prompt, with and without the skill | what was produced and whether each expectation held |

Give each subagent a task that stands alone, the exact paths, and the return format. Do not paste its transcript into the main conversation. Without subagents, do the same work in a separate session. `skills/context-isolation/SKILL.md` describes the method in full, and `node dist/cli.js delegate <skill> --task "..." --print-brief` produces a ready brief.

Do not delegate the decision itself: read the cited lines before acting on a subagent's report.

## Commits and pull requests

- Branch from `main`; never push to `main` directly.
- One logical change per pull request. Title in the imperative: `Add reference depth check to validator`.
- The description says what changed, why, and how it was verified, with the commands run.
- Update `CHANGELOG.md` under an `Unreleased` heading for anything a user would notice.

## Releasing

1. Set the version in `package.json` (`npm version <x.y.z> --no-git-tag-version`) and date the CHANGELOG entry.
2. Merge to `main`, then tag: `git tag v<version> && git push origin v<version>`.
3. The `release` workflow runs the checks, publishes `@rmaneschy/agentskills` to the GitHub Packages npm registry and attaches the tarball and a zip of the skills to a GitHub Release.

Create the tag from a terminal, not from the Releases page: a release made by hand uses the tag name you type, and a tag without the `v` prefix does not start the workflow. If a release for the tag already exists, the workflow uploads the files to it.

`dist/` is not committed. `npm run prepare` builds it, which is what makes `npx github:rmaneschy/agentskills` work.

## Out of scope for now

- Running evals (`evals/evals.json`, grading, benchmarks). The spec describes them; this package does not implement them yet.
- Trigger-rate testing of descriptions.
- Any hosted service or MCP server.
