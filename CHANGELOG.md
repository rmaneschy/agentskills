# Changelog

## Unreleased

- Release workflow can run again for the same tag: it skips a version that is already published and uploads the files to a release that already exists.

## 0.2.0 - 2026-11-13

- Rewritten in TypeScript. The Python package is removed; the CLI commands and their exit codes are unchanged.
- Published as `@rmaneschy/agentskills` on the GitHub Packages npm registry.
- `install` tracks content hashes in `.agentskills-lock.json`: untouched skills update, edited ones are kept unless `--force`.
- `install --agent` selects the destination for `universal`, `claude-code`, `cursor` or `copilot`.
- Claude Code plugin manifest, so the repository can be added as a plugin marketplace.
- Windows: agent CLIs installed as `.cmd` shims are started correctly by `delegate`.
- Symlinks inside skills are never followed, listed or copied.

## 0.1.0 - 2026-11-13

- Parser and strict validator for the Agent Skills specification.
- Discovery across project, user and bundled scopes, with collision and trust handling.
- Catalog rendering (XML, JSON, Markdown) and activation with structured wrapping.
- Subagent delegation: brief builder, runner protocol and command runner.
- Bundled skills: `skill-authoring`, `context-isolation`, `repo-exploration`.
