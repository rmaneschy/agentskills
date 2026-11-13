"""Layer 5: run a skill in a separate subagent session to keep the main context clean.

The main conversation never sees the subagent's working context. It receives a
short summary; the full output goes to a transcript file that can be opened
only if needed.

Nothing here knows about a model or a vendor. A runner is anything that takes
a prompt and returns text: ``CommandRunner`` starts any agent CLI as a child
process, and a harness with native subagents can skip runners entirely and
pass the text from ``build_brief`` to its own subagent tool.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from .activation import wrap_skill_content
from .models import Skill, SkillError

ENV_RUNNER = "AGENTSKILLS_SUBAGENT_CMD"
DEFAULT_SUMMARY_WORDS = 200
DEFAULT_SUMMARY_CHARS = 4000
_SUMMARY_BLOCK = re.compile(r"<summary>(.*?)</summary>", re.S | re.I)


class RunnerError(SkillError):
    """The subagent could not be started or did not finish."""


@dataclass(frozen=True)
class RunOutput:
    text: str
    exit_code: int
    duration_ms: int


class Runner(Protocol):
    """Starts one isolated agent session with ``brief`` as its only input."""

    def run(self, brief: str, *, cwd: Path, timeout: float | None = None) -> RunOutput: ...


@dataclass(frozen=True)
class SubagentResult:
    skill: str
    summary: str
    truncated: bool
    exit_code: int
    duration_ms: int
    transcript: Path

    def to_dict(self) -> dict[str, object]:
        return {
            "skill": self.skill,
            "summary": self.summary,
            "truncated": self.truncated,
            "exit_code": self.exit_code,
            "duration_ms": self.duration_ms,
            "transcript": str(self.transcript),
        }


@dataclass(frozen=True)
class CommandRunner:
    """Runs an agent CLI as a child process, without a shell, on any operating system.

    ``argv`` is the command as a list. The brief is delivered through:
    - ``{prompt_file}`` in an argument: replaced by the path of a UTF-8 file holding the brief;
    - ``{prompt}`` in an argument: replaced by the brief itself (mind OS command-line limits);
    - otherwise: standard input.
    """

    argv: Sequence[str]
    env: Mapping[str, str] | None = None

    def run(self, brief: str, *, cwd: Path, timeout: float | None = None) -> RunOutput:
        if not self.argv:
            raise RunnerError("runner command is empty")
        executable = shutil.which(self.argv[0])
        if executable is None:
            raise RunnerError(f"runner executable {self.argv[0]!r} was not found on PATH")
        prompt_file: Path | None = None
        stdin: str | None = brief
        argv = [executable]
        for arg in self.argv[1:]:
            if "{prompt_file}" in arg:
                if prompt_file is None:
                    handle, name = tempfile.mkstemp(prefix="agentskills-brief-", suffix=".md")
                    os.close(handle)
                    prompt_file = Path(name)
                    prompt_file.write_text(brief, encoding="utf-8")
                arg = arg.replace("{prompt_file}", str(prompt_file))
                stdin = None
            if "{prompt}" in arg:
                arg = arg.replace("{prompt}", brief)
                stdin = None
            argv.append(arg)
        started = time.monotonic()
        try:
            done = subprocess.run(  # noqa: S603 - argv list, no shell
                argv,
                input=stdin,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                cwd=str(cwd),
                timeout=timeout,
                env={**os.environ, **self.env} if self.env else None,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise RunnerError(f"subagent did not finish within {timeout} seconds") from error
        except OSError as error:
            raise RunnerError(f"could not start subagent: {error}") from error
        finally:
            if prompt_file is not None:
                prompt_file.unlink(missing_ok=True)
        text = done.stdout or ""
        if done.returncode != 0 and done.stderr:
            text = f"{text}\n[stderr]\n{done.stderr}".strip()
        return RunOutput(text=text, exit_code=done.returncode, duration_ms=int((time.monotonic() - started) * 1000))


def parse_runner_command(value: str) -> list[str]:
    """Parse a runner command written as a JSON array of strings."""
    try:
        argv = json.loads(value)
    except json.JSONDecodeError as error:
        raise RunnerError(
            f'runner command must be a JSON array, for example ["my-agent", "--print"]: {error}'
        ) from error
    if not isinstance(argv, list) or not argv or not all(isinstance(item, str) for item in argv):
        raise RunnerError("runner command must be a non-empty JSON array of strings")
    return argv


def runner_from_env(environ: Mapping[str, str] | None = None) -> CommandRunner | None:
    """Runner configured through AGENTSKILLS_SUBAGENT_CMD, or None when unset."""
    value = (os.environ if environ is None else environ).get(ENV_RUNNER, "").strip()
    return CommandRunner(parse_runner_command(value)) if value else None


def build_brief(
    skill: Skill,
    task: str,
    *,
    inputs: Sequence[str | Path] = (),
    output_dir: str | Path | None = None,
    max_summary_words: int = DEFAULT_SUMMARY_WORDS,
) -> str:
    """Self-contained instructions for a subagent that starts with an empty context."""
    if not task.strip():
        raise ValueError("task must not be empty")
    lines = [
        "You are a subagent working on one delegated task. You start with no prior context,",
        "and the agent that delegated to you will see only your final summary.",
        "",
        "## Skill to follow",
        wrap_skill_content(skill, delegation_hint=False),
        "",
        "## Task",
        task.strip(),
    ]
    if inputs:
        lines += ["", "## Input files", *[f"- {item}" for item in inputs]]
    if output_dir is not None:
        lines += ["", "## Outputs", f"Save every file you produce under: {output_dir}"]
    lines += [
        "",
        "## How to report",
        f"End your reply with one <summary>...</summary> block of at most {max_summary_words} words containing:",
        "1. the result, or the reason the task could not be completed;",
        "2. the files you created or changed, with paths;",
        "3. open questions or risks the delegating agent must know about.",
        "If the skill defines its own report format, put that report inside the block instead.",
        "Do not put logs, file contents or intermediate reasoning inside the summary.",
    ]
    return "\n".join(lines)


def extract_summary(text: str, *, max_chars: int = DEFAULT_SUMMARY_CHARS) -> tuple[str, bool]:
    """The last <summary> block, or the end of the output when the subagent did not write one."""
    blocks = _SUMMARY_BLOCK.findall(text)
    summary = blocks[-1].strip() if blocks else text.strip()
    if len(summary) <= max_chars:
        return summary, False
    return "[...truncated...]\n" + summary[-max_chars:], True


def delegate(
    skill: Skill,
    task: str,
    runner: Runner,
    *,
    cwd: str | Path | None = None,
    inputs: Sequence[str | Path] = (),
    output_dir: str | Path | None = None,
    transcript_dir: str | Path | None = None,
    timeout: float | None = None,
    max_summary_chars: int = DEFAULT_SUMMARY_CHARS,
) -> SubagentResult:
    """Run ``task`` with ``skill`` in an isolated session and return only the summary."""
    brief = build_brief(skill, task, inputs=inputs, output_dir=output_dir)
    output = runner.run(brief, cwd=Path(cwd) if cwd is not None else Path.cwd(), timeout=timeout)
    folder = (
        Path(transcript_dir) if transcript_dir is not None else Path(tempfile.gettempdir()) / "agentskills-transcripts"
    )
    folder.mkdir(parents=True, exist_ok=True)
    transcript = folder / f"{skill.name}-{time.strftime('%Y%m%dT%H%M%S')}-{os.getpid()}.md"
    transcript.write_text(f"# Brief\n\n{brief}\n\n# Output\n\n{output.text}\n", encoding="utf-8")
    summary, truncated = extract_summary(output.text, max_chars=max_summary_chars)
    if not summary:
        summary = f"The subagent produced no output (exit code {output.exit_code})."
    return SubagentResult(skill.name, summary, truncated, output.exit_code, output.duration_ms, transcript)
