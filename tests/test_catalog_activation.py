import json

import pytest

from agentskills import Session, SkillNotFoundError, activation_tool_schema, build_disclosure, render_catalog
from agentskills.activation import list_resources
from agentskills.discovery import Registry, Scope, discover


@pytest.fixture
def registry(tmp_path, make_skill):
    root = tmp_path / "skills"
    make_skill("alpha", root=root, frontmatter='name: alpha\ndescription: "Handles <tags> & things. Use when asked."')
    make_skill(
        "beta",
        root=root,
        files={"scripts/run.py": "print(1)", "references/guide.md": "g", ".hidden/x": "h", "__pycache__/c.pyc": "c"},
    )
    make_skill(
        "manual-only",
        root=root,
        frontmatter="name: manual-only\ndescription: Only runs when the user asks. Use when invoked by name.\ndisable-model-invocation: true",
    )
    return discover([Scope("path", root)])


def test_no_skills_means_no_disclosure_and_no_tool():
    empty = Registry()
    assert build_disclosure(empty) == "" and render_catalog([]) == "" and activation_tool_schema(empty) is None


def test_xml_catalog_escapes_and_hides_opted_out_skills(registry):
    text = build_disclosure(registry, fmt="xml")
    assert text.startswith("The following skills provide specialized instructions")
    assert "Handles &lt;tags&gt; &amp; things" in text
    assert "<name>beta</name>" in text and "manual-only" not in text and "<location>" in text


def test_json_and_markdown_catalogs(registry):
    data = json.loads(render_catalog(registry.skills.values(), "json"))
    assert {e["name"] for e in data["available_skills"]} == {"alpha", "beta", "manual-only"}
    assert "- **alpha**:" in render_catalog(registry.skills.values(), "markdown", include_location=False)
    with pytest.raises(ValueError):
        render_catalog(registry.skills.values(), "yaml")


def test_tool_mode_omits_location_and_constrains_names(registry):
    text = build_disclosure(registry, activation="tool", exclude=["alpha"])
    assert "activate_skill" in text and "<location>" not in text and "alpha" not in text
    schema = activation_tool_schema(registry)
    assert schema["parameters"]["properties"]["name"]["enum"] == ["alpha", "beta"]


def test_activation_wraps_body_lists_resources_and_deduplicates(registry):
    session = Session(registry)
    first = session.activate("beta")
    assert first.content.startswith('<skill_content name="beta">') and first.content.endswith("</skill_content>")
    assert "name: beta" not in first.content  # frontmatter stripped
    assert "<file>references/guide.md</file>" in first.content and "<file>scripts/run.py</file>" in first.content
    assert (
        ".hidden" not in first.content and "__pycache__" not in first.content and "SKILL.md</file>" not in first.content
    )
    assert "Skill directory:" in first.content
    second = session.activate("beta")
    assert second.already_active and "already loaded" in second.content
    assert session.allowlisted_dirs() == [registry.get("beta").base_dir]


def test_activation_can_keep_frontmatter_and_reports_unknown_names(registry):
    assert "name: alpha" in Session(registry).activate("alpha", include_frontmatter=True).content
    with pytest.raises(SkillNotFoundError, match="Available skills: alpha, beta, manual-only"):
        Session(registry).activate("nope")


def test_resource_listing_is_capped(registry, tmp_path):
    skill = registry.get("beta")
    for index in range(5):
        (skill.base_dir / "assets").mkdir(exist_ok=True)
        (skill.base_dir / "assets" / f"f{index}.txt").write_text("x", encoding="utf-8")
    paths, truncated = list_resources(skill, limit=3)
    assert len(paths) == 3 and truncated
    assert "listing truncated" in Session(registry).activate("beta", max_resources=3).content
