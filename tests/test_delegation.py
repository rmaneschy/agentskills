import sys
from pathlib import Path

import pytest

from agentskills import CommandRunner, RunnerError, build_brief, delegate, extract_summary, runner_from_env
from agentskills.delegation import ENV_RUNNER, RunOutput, parse_runner_command
from agentskills.discovery import load_skill

FAKE = str(Path(__file__).parent / "fake_agent.py")
SUBAGENT_FM = (
    'name: explore\ndescription: Explores things. Use when exploring.\nmetadata:\n  agentskills.execution: "subagent"'
)


@pytest.fixture
def skill(make_skill):
    loaded, _ = load_skill(make_skill("explore", frontmatter=SUBAGENT_FM, body="# Explore\n\nRead only."))
    return loaded


def test_brief_is_self_contained_and_does_not_tell_the_subagent_to_delegate(skill):
    brief = build_brief(skill, "Find the entry point", inputs=["a.py"], output_dir="out")
    assert '<skill_content name="explore">' in brief and "Read only." in brief
    assert "## Task\nFind the entry point" in brief and "- a.py" in brief and "under: out" in brief
    assert "<summary>...</summary>" in brief and "no prior context" in brief
    assert "meant to run in a separate subagent" not in brief
    with pytest.raises(ValueError):
        build_brief(skill, "   ")


def test_extract_summary_prefers_last_block_and_truncates():
    assert extract_summary("log\n<summary>first</summary>\nmore\n<SUMMARY>\nlast\n</SUMMARY>") == ("last", False)
    assert extract_summary("  only output  ") == ("only output", False)
    text, truncated = extract_summary("x" * 50 + "END", max_chars=10)
    assert truncated and text.endswith("END") and text.startswith("[...truncated...]")


@pytest.mark.parametrize(
    "argv",
    [
        [sys.executable, FAKE],
        [sys.executable, FAKE, "--from-file", "{prompt_file}"],
        [sys.executable, FAKE, "--from-arg", "{prompt}"],
    ],
)
def test_command_runner_delivers_the_brief_three_ways(skill, tmp_path, argv):
    result = delegate(skill, "Do it", CommandRunner(argv), cwd=tmp_path, transcript_dir=tmp_path / "t")
    assert result.exit_code == 0 and not result.truncated
    assert "task seen: True" in result.summary and "ação concluída" in result.summary
    assert "noise line" not in result.summary
    transcript = result.transcript.read_text(encoding="utf-8")
    assert "noise line" in transcript and "# Brief" in transcript
    assert result.to_dict()["skill"] == "explore"


def test_missing_summary_falls_back_to_truncated_tail(skill, tmp_path):
    runner = CommandRunner([sys.executable, FAKE, "--no-summary"])
    result = delegate(skill, "Do it", runner, cwd=tmp_path, transcript_dir=tmp_path, max_summary_chars=40)
    assert result.truncated and len(result.summary) < 80


def test_failure_is_reported_with_exit_code_and_stderr(skill, tmp_path):
    result = delegate(
        skill, "Do it", CommandRunner([sys.executable, FAKE, "--fail"]), cwd=tmp_path, transcript_dir=tmp_path
    )
    assert result.exit_code == 7 and "boom" in result.summary


def test_runner_errors(skill, tmp_path):
    with pytest.raises(RunnerError, match="not found on PATH"):
        CommandRunner(["definitely-not-a-real-agent-cli"]).run("x", cwd=tmp_path)
    with pytest.raises(RunnerError, match="empty"):
        CommandRunner([]).run("x", cwd=tmp_path)
    slow = CommandRunner([sys.executable, "-c", "import time; time.sleep(5)"])
    with pytest.raises(RunnerError, match="did not finish"):
        slow.run("x", cwd=tmp_path, timeout=0.5)


def test_runner_configuration():
    assert runner_from_env({}) is None
    assert runner_from_env({ENV_RUNNER: '["agent", "--print"]'}).argv == ["agent", "--print"]
    for bad in ["agent --print", "[]", '["a", 1]', '{"a": 1}']:
        with pytest.raises(RunnerError):
            parse_runner_command(bad)


def test_any_callable_object_can_be_a_runner(skill, tmp_path):
    class Echo:
        def run(self, brief, *, cwd, timeout=None):
            return RunOutput(text="<summary>custom runner</summary>", exit_code=0, duration_ms=1)

    assert delegate(skill, "Do it", Echo(), transcript_dir=tmp_path).summary == "custom runner"
