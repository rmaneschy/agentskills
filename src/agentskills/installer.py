"""Layer 6: the bundled skill pack, how it is installed into a project and how a new skill starts."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .models import EXECUTION_KEY, EXECUTION_SUBAGENT, SKILL_FILE, SkillError
from .validator import validate_name

DEFAULT_DESTINATION = Path(".agents") / "skills"
_IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store")


@dataclass(frozen=True)
class InstallAction:
    name: str
    target: Path
    status: str  # installed | updated | skipped | would-install | would-update

    def to_dict(self) -> dict[str, str]:
        return {"name": self.name, "target": str(self.target), "status": self.status}


def bundled_skills_dir() -> Path | None:
    """Skills shipped with this package: inside the wheel, or the repository's skills/ in a checkout."""
    package_dir = Path(__file__).resolve().parent
    for candidate in (package_dir / "_bundled" / "skills", package_dir.parent.parent / "skills"):
        if candidate.is_dir():
            return candidate
    return None


def bundled_skill_names() -> list[str]:
    root = bundled_skills_dir()
    return sorted(p.name for p in root.iterdir() if (p / SKILL_FILE).is_file()) if root else []


def install_skills(
    target_dir: Path | str,
    names: list[str] | None = None,
    *,
    destination: Path | str = DEFAULT_DESTINATION,
    overwrite: bool = False,
    dry_run: bool = False,
) -> list[InstallAction]:
    """Copy bundled skills into ``<target_dir>/<destination>``. Existing skills are kept unless ``overwrite``."""
    source_root = bundled_skills_dir()
    if source_root is None:
        raise SkillError("this installation has no bundled skills")
    available = bundled_skill_names()
    selected = names or available
    unknown = sorted(set(selected) - set(available))
    if unknown:
        raise SkillError(f"unknown bundled skill(s): {', '.join(unknown)}. Available: {', '.join(available)}")
    root = Path(target_dir) / destination
    actions: list[InstallAction] = []
    for name in selected:
        target = root / name
        exists = target.exists()
        if exists and not overwrite:
            actions.append(InstallAction(name, target, "skipped"))
            continue
        if dry_run:
            actions.append(InstallAction(name, target, "would-update" if exists else "would-install"))
            continue
        if exists:
            shutil.rmtree(target)
        shutil.copytree(source_root / name, target, ignore=_IGNORE)
        actions.append(InstallAction(name, target, "updated" if exists else "installed"))
    return actions


_TEMPLATE = """---
name: {name}
description: {description}
{metadata}---

# {title}

## When to use
State the situations that should trigger this skill and the ones that should not.

## Steps
1. First step.
2. Second step.

## Gotchas
- Facts about this environment that an agent would get wrong without being told.

## Verification
How to check the result before reporting it.
"""


def scaffold_skill(parent_dir: Path | str, name: str, description: str, *, subagent: bool = False) -> Path:
    """Create ``<parent_dir>/<name>/SKILL.md`` from the template. Refuses to overwrite."""
    problems = validate_name(name, None, Path(parent_dir) / name)
    if problems:
        raise SkillError(problems[0].message)
    if not description.strip():
        raise SkillError("description must not be empty")
    skill_dir = Path(parent_dir) / name
    if skill_dir.exists():
        raise SkillError(f"{skill_dir} already exists")
    skill_dir.mkdir(parents=True)
    metadata = f'metadata:\n  {EXECUTION_KEY}: "{EXECUTION_SUBAGENT}"\n' if subagent else ""
    safe_description = '"' + description.strip().replace("\\", "\\\\").replace('"', '\\"') + '"'
    text = _TEMPLATE.format(
        name=name, description=safe_description, metadata=metadata, title=name.replace("-", " ").capitalize()
    )
    (skill_dir / SKILL_FILE).write_text(text, encoding="utf-8", newline="\n")
    return skill_dir
