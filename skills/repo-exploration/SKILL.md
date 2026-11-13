---
name: repo-exploration
description: Explore an unfamiliar code repository in read-only mode and answer a specific question about it, such as where something is implemented, how a feature flows through the code, or how the project is built and tested. Use when a question needs searching across many files and only the conclusion, with file references, is needed.
license: MIT
metadata:
  author: rmaneschy
  agentskills.execution: "subagent"
---

# Repository exploration

Read-only. Do not create, edit or delete files, and do not run commands that change state.

## Steps

1. **Restate the question** in one sentence. If it has several parts, list them.
2. **Orient before searching.** Read, in this order and only if present: `AGENTS.md`, `README`, the build manifest (`pyproject.toml`, `package.json`, `pom.xml`, `build.gradle`, `go.mod`, `Cargo.toml`), and the top-level directory listing.
3. **Search narrowly.** Start from names the question mentions. Prefer a text search for an identifier over opening whole directories. Skip dependency and build output folders.
4. **Follow the path** from an entry point (route, command, handler, test) to the code that does the work. Read only the parts of each file you need.
5. **Stop when the question is answered.** Do not survey the rest of the repository.
6. **Verify each claim** by citing the file and line that supports it. If you could not confirm something, say so instead of guessing.

## Report

Return only this, in at most 200 words:

```
Answer: <one or two sentences>

Evidence:
- <path>:<line> - <what it shows>
- <path>:<line> - <what it shows>

How it fits: <the flow in one or two sentences, if relevant>

Not confirmed: <what you could not verify, or "nothing">
```

## Gotchas

- Generated code, vendored dependencies and build output often contain the same identifiers as the source. Check the path before citing.
- Tests are the fastest way to learn how a function is meant to be called.
- Configuration can override what the code suggests. If behaviour depends on a setting, cite where the setting is read.
- Do not paste file contents into the report. Paths and line numbers are enough.
