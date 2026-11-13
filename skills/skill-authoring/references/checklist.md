# Skill checklist

Go through every item. A skill is finished when all of them hold.

## Format
- [ ] `agentskills validate <skill-dir>` prints no errors and no unexplained warnings.
- [ ] The directory name equals `name`.
- [ ] `description` says what the skill does and when to use it, in at most 1024 characters.

## Content
- [ ] Every instruction is something the agent would get wrong without it.
- [ ] Steps describe a method that works for a class of tasks, not the answer to one task.
- [ ] There is one default approach; alternatives are short escape hatches.
- [ ] Fragile operations are spelled out exactly; flexible ones explain the reason and leave room.
- [ ] Non-obvious environment facts are in a `Gotchas` section inside `SKILL.md`.
- [ ] There is a verification step.

## Size and structure
- [ ] `SKILL.md` has fewer than 500 lines.
- [ ] Each reference file is mentioned with the condition under which to read it.
- [ ] Reference files do not point to further reference files.

## Scripts
- [ ] No interactive prompts.
- [ ] `--help` documents flags, examples and exit codes.
- [ ] Structured output on stdout, diagnostics on stderr.
- [ ] Runs on Windows, macOS and Linux.

## Context use
- [ ] If the skill reads many files or produces long output, it is marked `agentskills.execution: "subagent"` and states what the summary must contain.

## Evidence
- [ ] At least two realistic prompts were run with the skill, and the traces were read.
- [ ] Prompts that should not trigger the skill were tried too.
