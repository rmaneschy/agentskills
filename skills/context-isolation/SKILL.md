---
name: context-isolation
description: Decide when and how to hand part of a task to a subagent so the main conversation keeps a small, clean context. Use when a task needs broad searching or reading of many files, produces long logs or test output, runs several independent pieces of work, or when the conversation is getting long and you are about to load large material that only a conclusion is needed from.
license: MIT
metadata:
  author: rmaneschy
---

# Context isolation with subagents

Everything read into the main conversation stays there and competes for attention with the user's request. A subagent starts with an empty context, does the noisy work, and returns a short summary. The main conversation pays for the summary only.

## Delegate when

- The work is a search or survey: many files or pages read, a few facts wanted.
- The output is long and mostly irrelevant: builds, test runs, logs, large diffs.
- Several pieces are independent and none needs the others' intermediate state.
- You need an unbiased check: a reviewer or evaluator that has not seen how the work was produced.

## Keep it in the main conversation when

- The task is short, or its result is needed in full.
- The next step depends on details that a summary would lose.
- It needs back-and-forth with the user.

## Steps

1. **State the task so it stands alone.** The subagent knows nothing of this conversation. Give the goal, the exact paths or inputs, the constraints, and what "done" means.
2. **Define the return contract** before delegating: what the summary must contain, in what format, and its maximum size. Ask for file paths and line numbers instead of file contents.
3. **Send large results to files.** Have the subagent write long output to a file and return the path.
4. **Delegate with what the environment offers:**
   - If your agent has a native subagent or task tool, generate the brief and pass it to that tool:
     ```
     agentskills delegate <skill-name> --task "<task>" --print-brief
     ```
   - If it does not, run any agent CLI as an isolated child process. Set `AGENTSKILLS_SUBAGENT_CMD` to the command as a JSON array, then:
     ```
     agentskills delegate <skill-name> --task "<task>" --json
     ```
     The command prints only the summary. The full output is saved to the `transcript` path in the result.
   - If neither is possible, do the work in a separate session and bring back only the conclusion.
5. **Use the summary, and verify what matters.** Treat it as a report from a colleague: check the claims the next step depends on, by reading the cited lines. Open the transcript only when the summary is not enough.
6. **Do not paste the transcript** into the main conversation. That undoes the isolation.

## Gotchas

- A subagent that is not told what to return sends back everything it found. Always give the return contract.
- Subagents cannot ask the user questions. Resolve ambiguity before delegating, or tell the subagent which assumption to make and to report it.
- Parallel subagents must not edit the same files. Give each its own files or its own working copy.
- A summary can be wrong. Delegation moves the reading out of the context; it does not move the responsibility.
- A skill marked `agentskills.execution: "subagent"` in its metadata is designed to be run this way.
- The `agentskills` command comes from this pack's CLI. If it is not installed, run it as `npx github:rmaneschy/agentskills <command>`.
