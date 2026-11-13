import pytest

from agentskills.validator import has_errors, validate


def codes(diagnostics, level=None):
    return {d.code for d in diagnostics if level is None or d.level == level}


def test_valid_skill_is_clean(make_skill):
    assert validate(make_skill()) == []


@pytest.mark.parametrize(
    "name",
    ["PDF-Processing", "-pdf", "pdf-", "pdf--processing", "pdf_processing", "pdf processing", "a" * 65],
)
def test_invalid_names(make_skill, name):
    skill_dir = make_skill(
        name, frontmatter=f'name: "{name}"\ndescription: Does a demo task. Use when asked for a demo.'
    )
    assert codes(validate(skill_dir), "error") & {"name-format", "name-length"}


@pytest.mark.parametrize("name", ["pdf-processing", "data-analysis", "a", "x1-2y", "a" * 64])
def test_valid_names(make_skill, name):
    assert not has_errors(validate(make_skill(name)))


def test_name_must_match_directory(make_skill):
    assert "name-directory" in codes(validate(make_skill("demo-skill", dir_name="other-name")), "error")


def test_description_rules(make_skill):
    missing = make_skill("no-desc", frontmatter="name: no-desc")
    assert "description-required" in codes(validate(missing), "error")
    too_long = make_skill("long-desc", frontmatter=f"name: long-desc\ndescription: Use when {'x' * 1024}")
    assert "description-length" in codes(validate(too_long), "error")
    vague = make_skill("vague", frontmatter="name: vague\ndescription: Helps with PDFs.")
    result = validate(vague)
    assert "description-trigger" in codes(result, "warning") and not has_errors(result)


def test_optional_field_rules(make_skill):
    base = "name: {n}\ndescription: Does a demo task. Use when asked for a demo.\n"
    assert "compatibility-length" in codes(
        validate(make_skill("c1", frontmatter=base.format(n="c1") + f"compatibility: {'x' * 501}"))
    )
    assert "compatibility-type" in codes(
        validate(make_skill("c2", frontmatter=base.format(n="c2") + 'compatibility: ""'))
    )
    assert "metadata-type" in codes(validate(make_skill("m1", frontmatter=base.format(n="m1") + "metadata: text")))
    assert "metadata-value" in codes(
        validate(make_skill("m2", frontmatter=base.format(n="m2") + "metadata:\n  version: 1.0"))
    )
    assert "allowed-tools-type" in codes(
        validate(make_skill("t1", frontmatter=base.format(n="t1") + "allowed-tools: [Read]"))
    )
    assert "unknown-field" in codes(
        validate(make_skill("u1", frontmatter=base.format(n="u1") + "color: blue")), "warning"
    )
    known = validate(make_skill("k1", frontmatter=base.format(n="k1") + "disable-model-invocation: true"))
    assert "unknown-field" not in codes(known)


def test_execution_mode_must_be_known(make_skill):
    fm = 'name: {n}\ndescription: Does a demo task. Use when asked for a demo.\nmetadata:\n  agentskills.execution: "{m}"'
    assert "execution-mode" in codes(validate(make_skill("e1", frontmatter=fm.format(n="e1", m="background"))), "error")
    assert validate(make_skill("e2", frontmatter=fm.format(n="e2", m="subagent"))) == []


def test_unquoted_colon_is_an_error_in_strict_validation(make_skill):
    skill_dir = make_skill(
        "colon", frontmatter="name: colon\ndescription: Use this skill when: the user asks for a demo"
    )
    assert "yaml-invalid" in codes(validate(skill_dir), "error")


def test_structural_errors(tmp_path, make_skill):
    assert codes(validate(tmp_path / "missing")) == {"not-a-directory"}
    empty = tmp_path / "empty"
    empty.mkdir()
    assert codes(validate(empty)) == {"skill-md-missing"}
    (empty / "skill.md").write_text("x", encoding="utf-8")
    assert "must be exactly SKILL.md" in validate(empty)[0].message
    broken = make_skill("broken")
    (broken / "SKILL.md").write_text("no frontmatter here", encoding="utf-8")
    assert codes(validate(broken)) == {"frontmatter-invalid"}


def test_body_size_warnings(make_skill):
    long_body = "\n".join(f"line {i}" for i in range(600))
    assert "body-lines" in codes(validate(make_skill("long", body=long_body)), "warning")
    heavy_body = "word " * 6000
    assert "body-tokens" in codes(validate(make_skill("heavy", body=heavy_body)), "warning")
    assert "body-empty" in codes(validate(make_skill("empty-body", body="")), "warning")


def test_references(make_skill):
    ok = make_skill(
        "refs-ok",
        body="See [guide](references/guide.md) and run scripts/run.py. Docs: [site](https://example.com).",
        files={"references/guide.md": "Guide", "scripts/run.py": "print(1)"},
    )
    assert validate(ok) == []
    missing = make_skill("refs-missing", body="See [guide](references/guide.md) and run scripts/run.py.")
    result = validate(missing)
    assert "reference-missing" in codes(result, "error") and "resource-missing" in codes(result, "warning")
    nested = make_skill(
        "refs-nested",
        body="See [guide](references/guide.md).",
        files={"references/guide.md": "More in [deep](references/deep.md)", "references/deep.md": "x"},
    )
    assert "reference-depth" in codes(validate(nested), "warning")
