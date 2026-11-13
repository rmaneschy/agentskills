"""Layer 2: find skills on disk and build a registry.

Scopes are scanned in precedence order: project, then user, then the skills
bundled with this package. The first skill found for a name wins and every
shadowed duplicate is reported. Loading is lenient: cosmetic problems produce
warnings, and only a missing description or unparseable YAML skips a skill.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from .models import MAX_NAME_LENGTH, SKILL_FILE, Diagnostic, ParseError, Skill
from .parser import parse_skill_md, to_properties

SKIP_DIRS = frozenset({".git", "node_modules", "__pycache__", ".venv", "venv", "dist", "build", "target", ".tox"})
DEFAULT_MAX_DEPTH = 4
DEFAULT_MAX_DIRS = 2000
#: Cross-client convention. Add client folders such as ".claude" through ``client_dirs``.
DEFAULT_CLIENT_DIRS: tuple[str, ...] = (".agents",)


@dataclass(frozen=True)
class Scope:
    """A directory that holds skill directories, with a label used in diagnostics."""

    name: str
    root: Path


@dataclass
class Registry:
    """Skills keyed by name, plus everything noticed while loading them."""

    skills: dict[str, Skill] = field(default_factory=dict)
    diagnostics: list[Diagnostic] = field(default_factory=list)

    def get(self, name: str) -> Skill | None:
        return self.skills.get(name)

    def names(self) -> list[str]:
        return sorted(self.skills)

    def __len__(self) -> int:
        return len(self.skills)


def default_scopes(
    project_dir: Path | str | None = None,
    *,
    home: Path | str | None = None,
    client_dirs: Sequence[str] = DEFAULT_CLIENT_DIRS,
    project_trusted: bool = True,
    include_user: bool = True,
    include_bundled: bool = True,
) -> list[Scope]:
    """Scopes in precedence order. Untrusted projects contribute no skills."""
    scopes: list[Scope] = []
    project = Path(project_dir) if project_dir is not None else Path.cwd()
    if project_trusted:
        scopes += [Scope("project", project / client / "skills") for client in client_dirs]
    if include_user:
        user_home = Path(home) if home is not None else Path.home()
        scopes += [Scope("user", user_home / client / "skills") for client in client_dirs]
    if include_bundled:
        from .installer import bundled_skills_dir

        bundled = bundled_skills_dir()
        if bundled is not None:
            scopes.append(Scope("bundled", bundled))
    return scopes


def find_skill_dirs(
    root: Path | str, *, max_depth: int = DEFAULT_MAX_DEPTH, max_dirs: int = DEFAULT_MAX_DIRS
) -> list[Path]:
    """Directories under ``root`` that contain a file named exactly SKILL.md, in sorted order."""
    root = Path(root)
    if not root.is_dir():
        return []
    found: list[Path] = []
    for visited, (current, dirs, files) in enumerate(os.walk(root), start=1):
        if visited > max_dirs:
            break
        depth = len(Path(current).relative_to(root).parts)
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS) if depth < max_depth else []
        if SKILL_FILE in files:
            found.append(Path(current))
            dirs[:] = []  # a skill's own subfolders are resources, not nested skills
    return sorted(found)


def load_skill(skill_dir: Path | str, scope: str = "path") -> tuple[Skill | None, list[Diagnostic]]:
    """Lenient load of one skill directory. Returns ``(skill or None, diagnostics)``."""
    skill_dir = Path(skill_dir)
    location = (skill_dir / SKILL_FILE).resolve()
    diagnostics: list[Diagnostic] = []
    try:
        frontmatter, _body, repaired = parse_skill_md(location)
        properties = to_properties(frontmatter)
    except ParseError as error:
        return None, [Diagnostic("error", "skill-skipped", f"skill not loaded: {error}", location)]
    if repaired:
        diagnostics.append(
            Diagnostic(
                "warning", "yaml-repaired", "frontmatter had an unquoted colon and was repaired while loading", location
            )
        )
    if properties.name != skill_dir.resolve().name:
        diagnostics.append(
            Diagnostic(
                "warning",
                "name-directory",
                f"name {properties.name!r} does not match directory {skill_dir.resolve().name!r}",
                location,
            )
        )
    if len(properties.name) > MAX_NAME_LENGTH:
        diagnostics.append(
            Diagnostic("warning", "name-length", f"name is longer than {MAX_NAME_LENGTH} characters", location)
        )
    return Skill(properties=properties, location=location, scope=scope), diagnostics


def discover(
    scopes: Iterable[Scope] | None = None, *, max_depth: int = DEFAULT_MAX_DEPTH, max_dirs: int = DEFAULT_MAX_DIRS
) -> Registry:
    """Scan scopes in order and return the registry. Earlier scopes take precedence."""
    registry = Registry()
    for scope in default_scopes() if scopes is None else scopes:
        for skill_dir in find_skill_dirs(scope.root, max_depth=max_depth, max_dirs=max_dirs):
            skill, diagnostics = load_skill(skill_dir, scope.name)
            registry.diagnostics += diagnostics
            if skill is None:
                continue
            existing = registry.skills.get(skill.name)
            if existing is not None:
                if skill.scope == "bundled":
                    continue  # a bundled skill replaced by an installed copy is the normal case
                registry.diagnostics.append(
                    Diagnostic(
                        "warning",
                        "name-collision",
                        f"skill {skill.name!r} from scope '{skill.scope}' is shadowed by {existing.location} (scope '{existing.scope}')",
                        skill.location,
                    )
                )
                continue
            registry.skills[skill.name] = skill
    return registry
