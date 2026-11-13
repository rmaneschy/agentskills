import json
import sys
from pathlib import Path

import pytest

from agentskills import bundled_skill_names, bundled_skills_dir, install_skills, scaffold_skill, validate
from agentskills.cli import main
from agentskills.models import SkillError

FAKE = str(Path(__file__).parent / "fake_agent.py")
ISOLATED = ["--no-user", "--no-bundled"]


def test_bundled_skills_are_valid_without_warnings():
    names = bundled_skill_names()
    assert {"skill-authoring", "context-isolation", "repo-exploration"} <= set(names)
    for name in names:
        assert validate(bundled_skills_dir() / name) == [], name


def test_bundled_skills_ship_no_shell_only_scripts():
    """The pack must run on every operating system: scripts are Python."""
    offenders = [p for p in bundled_skills_dir().rglob("*") if p.suffix in {".sh", ".bash", ".ps1", ".bat", ".cmd"}]
    assert offenders == []


def test_install_copies_skips_and_overwrites(tmp_path):
    first = install_skills(tmp_path, ["repo-exploration"])
    assert [a.status for a in first] == ["installed"]
    target = tmp_path / ".agents" / "skills" / "repo-exploration" / "SKILL.md"
    assert target.is_file()
    target.write_text("local edit", encoding="utf-8")
    assert [a.status for a in install_skills(tmp_path, ["repo-exploration"])] == ["skipped"]
    assert target.read_text(encoding="utf-8") == "local edit"
    assert [a.status for a in install_skills(tmp_path, ["repo-exploration"], overwrite=True, dry_run=True)] == [
        "would-update"
    ]
    assert target.read_text(encoding="utf-8") == "local edit"
    assert [a.status for a in install_skills(tmp_path, ["repo-exploration"], overwrite=True)] == ["updated"]
    assert target.read_text(encoding="utf-8").startswith("---")
    with pytest.raises(SkillError, match="unknown bundled skill"):
        install_skills(tmp_path, ["nope"])


def test_scaffold_creates_a_valid_skill(tmp_path):
    created = scaffold_skill(tmp_path, "my-skill", 'Does "X": end to end. Use when asked for X.', subagent=True)
    assert validate(created) == []
    with pytest.raises(SkillError):
        scaffold_skill(tmp_path, "my-skill", "again")
    with pytest.raises(SkillError):
        scaffold_skill(tmp_path, "Bad_Name", "desc")


def test_cli_validate_exit_codes_and_json(make_skill, tmp_path, capsys):
    good = make_skill("good")
    bad = make_skill("bad", frontmatter="name: Bad\ndescription: x")
    assert main(["validate", str(good)]) == 0
    capsys.readouterr()
    assert main(["validate", str(good.parent), "--json"]) == 1
    report = json.loads(capsys.readouterr().out)
    assert {Path(r["skill"]).name: r["valid"] for r in report} == {"good": True, "bad": False}
    assert main(["validate", str(tmp_path / "missing")]) == 3
    vague = make_skill("vague", frontmatter="name: vague\ndescription: Helps.")
    assert main(["validate", str(vague)]) == 0 and main(["validate", str(vague), "--strict"]) == 1
    assert bad.exists()


def test_cli_discovery_commands(make_skill, tmp_path, capsys):
    project = tmp_path / "project"
    make_skill("demo-skill", root=project / ".agents" / "skills", files={"scripts/a.py": "x"})
    base = ["--project", str(project), *ISOLATED]
    assert main(["list", "--json", *base]) == 0
    assert json.loads(capsys.readouterr().out)[0]["name"] == "demo-skill"
    assert main(["catalog", "--format", "json", *base]) == 0
    assert '"available_skills"' in capsys.readouterr().out
    assert main(["catalog", "--untrusted", *base]) == 0
    assert capsys.readouterr().out == ""
    assert main(["activate", "demo-skill", *base]) == 0
    assert "<file>scripts/a.py</file>" in capsys.readouterr().out
    assert main(["activate", "nope", *base]) == 3
    capsys.readouterr()
    assert main(["read-properties", str(project / ".agents" / "skills" / "demo-skill")]) == 0
    assert json.loads(capsys.readouterr().out)["name"] == "demo-skill"


def test_cli_delegate(make_skill, tmp_path, capsys, monkeypatch):
    project = tmp_path / "project"
    make_skill("demo-skill", root=project / ".agents" / "skills")
    base = ["--project", str(project), *ISOLATED]
    monkeypatch.delenv("AGENTSKILLS_SUBAGENT_CMD", raising=False)
    assert main(["delegate", "demo-skill", "--task", "T", "--print-brief", *base]) == 0
    assert "## Task\nT" in capsys.readouterr().out
    assert main(["delegate", "demo-skill", "--task", "T", *base]) == 2
    assert "no subagent runner configured" in capsys.readouterr().err
    runner = json.dumps([sys.executable, FAKE])
    args = [
        "delegate",
        "demo-skill",
        "--task",
        "T",
        "--runner",
        runner,
        "--transcript-dir",
        str(tmp_path / "t"),
        "--json",
        *base,
    ]
    assert main(args) == 0
    result = json.loads(capsys.readouterr().out)
    assert "task seen: True" in result["summary"] and Path(result["transcript"]).is_file()
    monkeypatch.setenv("AGENTSKILLS_SUBAGENT_CMD", json.dumps([sys.executable, FAKE, "--fail"]))
    assert main(["delegate", "demo-skill", "--task", "T", "--transcript-dir", str(tmp_path / "t"), *base]) == 4
    assert main(["delegate", "demo-skill", "--task", "T", "--runner", "not json", *base]) == 4


def test_cli_install_and_new(tmp_path, capsys):
    assert main(["install", "--list"]) == 0
    assert "skill-authoring" in capsys.readouterr().out
    assert main(["install", "--target", str(tmp_path), "--json"]) == 0
    assert all(a["status"] == "installed" for a in json.loads(capsys.readouterr().out))
    assert main(["new", "fresh-skill", "--description", "Does a thing. Use when asked.", "--path", str(tmp_path)]) == 0
    assert main(["validate", str(tmp_path / "fresh-skill")]) == 0
    assert main(["new", "Bad Name", "--description", "d", "--path", str(tmp_path)]) == 2
