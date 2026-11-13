from pathlib import Path

import pytest

from agentskills.models import ParseError
from agentskills.parser import load_frontmatter, read_body, read_properties, split_frontmatter, to_properties


def test_split_frontmatter_handles_bom_and_crlf():
    yaml_text, body = split_frontmatter("﻿---\r\nname: a\r\ndescription: b\r\n---\r\n\r\nBody\r\n")
    assert yaml_text == "name: a\ndescription: b"
    assert body == "Body"


@pytest.mark.parametrize("text", ["# no frontmatter", "", "---\nname: a\n"])
def test_split_frontmatter_rejects_missing_or_unclosed(text):
    with pytest.raises(ParseError):
        split_frontmatter(text)


def test_unquoted_colon_is_repaired():
    data, repaired = load_frontmatter("name: pdf\ndescription: Use this skill when: the user asks about PDFs")
    assert repaired is True
    assert data["description"] == "Use this skill when: the user asks about PDFs"


def test_valid_yaml_is_not_reported_as_repaired():
    data, repaired = load_frontmatter('name: pdf\ndescription: "Use when: PDFs"\nlicense: https://example.com/license')
    assert repaired is False
    assert data["license"] == "https://example.com/license"


def test_non_mapping_frontmatter_is_rejected():
    with pytest.raises(ParseError):
        load_frontmatter("- a\n- b")


def test_properties_coerce_scalars_and_keep_extra_fields():
    props = to_properties(
        {
            "name": 123,
            "description": "d",
            "metadata": {"version": 1.0, "author": "me"},
            "allowed-tools": "Read",
            "disable-model-invocation": True,
        }
    )
    assert props.name == "123"
    assert props.metadata == {"version": "1.0", "author": "me"}
    assert props.allowed_tools == "Read"
    assert props.extra == {"disable-model-invocation": True}
    assert props.to_dict()["allowed-tools"] == "Read"


@pytest.mark.parametrize("frontmatter", [{"name": "a"}, {"description": "d"}, {"name": "a", "description": "  "}])
def test_properties_require_name_and_description(frontmatter):
    with pytest.raises(ParseError):
        to_properties(frontmatter)


def test_read_properties_and_body(make_skill):
    skill_dir = make_skill("demo-skill", body="Line one\n\nLine two\n")
    assert read_properties(skill_dir).name == "demo-skill"
    assert read_body(skill_dir / "SKILL.md") == "Line one\n\nLine two"


def test_missing_skill_md(tmp_path: Path):
    with pytest.raises(ParseError):
        read_properties(tmp_path)
