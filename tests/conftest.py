from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

import pytest

SkillFactory = Callable[..., Path]


@pytest.fixture
def make_skill(tmp_path: Path) -> SkillFactory:
    """Create a skill directory and return its path."""

    def _make(
        name: str = "demo-skill",
        *,
        root: Path | None = None,
        frontmatter: str | None = None,
        body: str = "# Demo\n\n1. Do the thing.\n",
        files: dict[str, str] | None = None,
        dir_name: str | None = None,
    ) -> Path:
        skill_dir = (root or tmp_path / "skills") / (dir_name or name)
        skill_dir.mkdir(parents=True, exist_ok=True)
        if frontmatter is None:
            frontmatter = f"name: {name}\ndescription: Does a demo task end to end. Use when the user asks for a demo."
        (skill_dir / "SKILL.md").write_text(f"---\n{frontmatter}\n---\n\n{body}", encoding="utf-8")
        for relative, content in (files or {}).items():
            target = skill_dir / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
        return skill_dir

    return _make
