from agentskills.discovery import Scope, default_scopes, discover, find_skill_dirs, load_skill


def test_find_skill_dirs_only_matches_exact_file_and_skips_noise(tmp_path, make_skill):
    root = tmp_path / "skills"
    make_skill("alpha", root=root, files={"references/SKILL.md": "not a skill"})
    make_skill("beta", root=root / "group")
    make_skill("hidden", root=root / "node_modules")
    (root / "README.md").write_text("x", encoding="utf-8")
    assert [p.name for p in find_skill_dirs(root)] == ["alpha", "beta"]


def test_find_skill_dirs_respects_bounds(tmp_path, make_skill):
    root = tmp_path / "skills"
    make_skill("deep", root=root / "a" / "b" / "c")
    assert find_skill_dirs(root, max_depth=2) == []
    assert len(find_skill_dirs(root, max_depth=4)) == 1
    assert find_skill_dirs(tmp_path / "nope") == []


def test_project_overrides_user_and_collision_is_reported(tmp_path, make_skill):
    project, home = tmp_path / "project", tmp_path / "home"
    make_skill("shared", root=project / ".agents" / "skills", body="project version")
    make_skill("shared", root=home / ".agents" / "skills", body="user version")
    make_skill("only-user", root=home / ".agents" / "skills")
    registry = discover(default_scopes(project, home=home, include_bundled=False))
    assert registry.names() == ["only-user", "shared"]
    assert registry.get("shared").scope == "project"
    assert [d.code for d in registry.diagnostics] == ["name-collision"]


def test_untrusted_project_contributes_nothing(tmp_path, make_skill):
    project, home = tmp_path / "project", tmp_path / "home"
    make_skill("from-project", root=project / ".agents" / "skills")
    registry = discover(default_scopes(project, home=home, project_trusted=False, include_bundled=False))
    assert len(registry) == 0


def test_client_dirs_are_scanned_in_order(tmp_path, make_skill):
    project = tmp_path / "project"
    make_skill("one", root=project / ".claude" / "skills")
    make_skill("two", root=project / ".agents" / "skills")
    scopes = default_scopes(project, home=tmp_path / "home", client_dirs=(".agents", ".claude"), include_bundled=False)
    assert discover(scopes).names() == ["one", "two"]


def test_lenient_loading(tmp_path, make_skill):
    root = tmp_path / "skills"
    make_skill("good", root=root)
    make_skill("mismatch", root=root, dir_name="other-dir")
    make_skill("colon", root=root, frontmatter="name: colon\ndescription: Use this when: asked for a demo")
    make_skill("no-desc", root=root, frontmatter="name: no-desc")
    make_skill("bad-yaml", root=root, frontmatter="name: [unclosed")
    registry = discover([Scope("path", root)])
    assert registry.names() == ["colon", "good", "mismatch"]
    by_code = {d.code for d in registry.diagnostics}
    assert by_code == {"name-directory", "yaml-repaired", "skill-skipped"}
    assert sum(d.code == "skill-skipped" for d in registry.diagnostics) == 2


def test_load_skill_stores_absolute_location(make_skill):
    skill, diagnostics = load_skill(make_skill())
    assert diagnostics == [] and skill.location.is_absolute() and skill.base_dir.name == "demo-skill"


def test_bundled_skill_shadowed_by_installed_copy_is_silent(tmp_path, make_skill):
    make_skill("shared", root=tmp_path / "project")
    make_skill("shared", root=tmp_path / "bundled")
    registry = discover([Scope("project", tmp_path / "project"), Scope("bundled", tmp_path / "bundled")])
    assert registry.get("shared").scope == "project" and registry.diagnostics == []
