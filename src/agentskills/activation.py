"""Layer 4: deliver a skill's instructions into the conversation (tier 2).

The content is wrapped in identifying tags so a harness can find it again,
protect it from context compaction and avoid injecting it twice. Bundled
resources are listed, never read: the model loads them on demand (tier 3).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import quoteattr

from .discovery import Registry
from .models import EXECUTION_SUBAGENT, SKILL_FILE, Skill, SkillNotFoundError
from .parser import read_body

DEFAULT_MAX_RESOURCES = 50
_IGNORED_PARTS = frozenset({"__pycache__", ".git", "node_modules"})


@dataclass(frozen=True)
class ActivationResult:
    name: str
    content: str
    already_active: bool = False


def list_resources(skill: Skill, *, limit: int = DEFAULT_MAX_RESOURCES) -> tuple[list[str], bool]:
    """Relative POSIX paths of the files a skill bundles. Returns ``(paths, truncated)``."""
    paths: list[str] = []
    for path in sorted(skill.base_dir.rglob("*")):
        relative = path.relative_to(skill.base_dir)
        if not path.is_file() or relative.as_posix() == SKILL_FILE:
            continue
        if any(part in _IGNORED_PARTS or part.startswith(".") for part in relative.parts):
            continue
        paths.append(relative.as_posix())
    return paths[:limit], len(paths) > limit


def wrap_skill_content(
    skill: Skill,
    *,
    include_frontmatter: bool = False,
    max_resources: int = DEFAULT_MAX_RESOURCES,
    delegation_hint: bool = True,
) -> str:
    """The text handed to the model when a skill is activated.

    ``delegation_hint`` adds a note to subagent-mode skills telling the main agent to
    delegate. It is turned off when the text is built for the subagent itself.
    """
    body = skill.location.read_text(encoding="utf-8").strip() if include_frontmatter else read_body(skill.location)
    resources, truncated = list_resources(skill, limit=max_resources)
    lines = [
        f"<skill_content name={quoteattr(skill.name)}>",
        body,
        "",
        f"Skill directory: {skill.base_dir}",
        "Relative paths in this skill are relative to the skill directory.",
    ]
    if delegation_hint and skill.execution == EXECUTION_SUBAGENT:
        lines.append(
            "This skill is meant to run in a separate subagent session. If you can start one, "
            "delegate the task and bring back only the summary."
        )
    if resources:
        lines += ["", "<skill_resources>", *[f"  <file>{p}</file>" for p in resources]]
        if truncated:
            lines.append("  <!-- listing truncated; more files exist in the skill directory -->")
        lines.append("</skill_resources>")
    lines.append("</skill_content>")
    return "\n".join(lines)


@dataclass
class Session:
    """Tracks which skills are already in context for one conversation."""

    registry: Registry
    activated: set[str] = field(default_factory=set)

    def activate(
        self, name: str, *, include_frontmatter: bool = False, max_resources: int = DEFAULT_MAX_RESOURCES
    ) -> ActivationResult:
        skill = self.registry.get(name)
        if skill is None:
            available = ", ".join(self.registry.names()) or "none"
            raise SkillNotFoundError(f"skill {name!r} is not available. Available skills: {available}")
        if name in self.activated:
            return ActivationResult(
                name, f"Skill {name!r} is already loaded in this session; follow the instructions given earlier.", True
            )
        content = wrap_skill_content(skill, include_frontmatter=include_frontmatter, max_resources=max_resources)
        self.activated.add(name)
        return ActivationResult(name, content)

    def allowlisted_dirs(self) -> list[Path]:
        """Directories a permission system should allow reading without prompting."""
        return sorted({self.registry.skills[name].base_dir for name in self.activated})
