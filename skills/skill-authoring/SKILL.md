---
name: skill-authoring
description: Create or improve an Agent Skill (a folder with a SKILL.md) so that it validates against the specification and activates on the right requests. Use when asked to write a new skill, turn a repeated procedure into a skill, fix a skill that does not trigger, or review a SKILL.md, even if the word "skill" is not used.
license: MIT
metadata:
  author: rmaneschy
---

# Skill authoring

A skill is a directory whose name equals the `name` field of its `SKILL.md`. The agent sees only `name` and `description` until it decides to load the skill, so the description carries the whole burden of triggering.

## Steps

1. **Start from real material.** Ask for, or collect, what actually happened: the steps that worked, the corrections the user made, input and output formats, project facts the agent did not know. Do not write a skill from general knowledge alone; the result is generic advice.
2. **Scope it like a function.** One coherent unit of work. If the draft needs "and also" to describe it, split it.
3. **Create the directory** with the CLI, which checks the name rules:
   ```
   agentskills new <name> --description "<what it does and when to use it>" --path <parent-dir>
   ```
   Add `--subagent` when the skill does heavy reading or produces long output that the main conversation does not need (see the `context-isolation` skill).
4. **Write the description** as an instruction to the agent: what the skill does, then "Use when ...", listing situations where it applies even when the user does not name the domain. Maximum 1024 characters.
5. **Write the body.** Keep only what the agent would get wrong without it:
   - numbered steps for the procedure;
   - a `Gotchas` section with concrete, non-obvious facts;
   - one default tool or approach, with alternatives mentioned briefly;
   - a template when the output format matters;
   - a verification step the agent runs before reporting.
6. **Move detail out.** Keep `SKILL.md` under 500 lines. Put long reference material in `references/`, and say when to read each file ("Read the errors reference if the API returns a non-200 status"). Keep references one level deep.
7. **Scripts.** Bundle a script in `scripts/` when the agent would otherwise rewrite the same logic each run. Scripts must not prompt, must explain themselves with `--help`, print data to stdout and diagnostics to stderr, and use distinct exit codes. Write them in Node.js (`.mjs`) or Python so they run on every operating system; do not ship shell-only scripts.
8. **Validate until clean:**
   ```
   agentskills validate <skill-dir>
   ```
   Fix every error. Fix warnings unless there is a reason not to, and say what the reason is.
9. **Test it for real.** Run two or three realistic prompts with and without the skill. Read the execution trace, not only the final answer. Add each correction you had to make to `Gotchas`.

Read [references/checklist.md](references/checklist.md) before declaring a skill finished.

## Gotchas

- `name` allows lowercase letters, digits and single hyphens only, and must equal the directory name.
- A YAML value that contains `: ` must be quoted, or the frontmatter is invalid.
- `metadata` values must be strings: write `version: "1.0"`, not `version: 1.0`.
- Do not add frontmatter fields the specification does not define; put custom data under `metadata` with a namespaced key.
- A description that only names the topic ("Helps with PDFs") will not trigger. A description stuffed with keywords from failed test prompts overfits.
- The `agentskills` command comes from this pack's CLI. If it is not installed, run it as `npx github:rmaneschy/agentskills <command>`.
