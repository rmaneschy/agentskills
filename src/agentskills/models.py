"""Data model shared by every layer. No I/O happens here."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

SKILL_FILE = "SKILL.md"
MAX_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024
MAX_COMPATIBILITY_LENGTH = 500
MAX_BODY_LINES = 500
MAX_BODY_TOKENS = 5000

#: Frontmatter fields defined by the specification.
SPEC_FIELDS = frozenset({"name", "description", "license", "compatibility", "metadata", "allowed-tools"})

#: Metadata key (namespaced, as the spec recommends) that selects how a skill runs.
EXECUTION_KEY = "agentskills.execution"
EXECUTION_INLINE = "inline"
EXECUTION_SUBAGENT = "subagent"
EXECUTION_MODES = frozenset({EXECUTION_INLINE, EXECUTION_SUBAGENT})

Level = Literal["error", "warning"]


class SkillError(Exception):
    """Base class for errors raised by this package."""


class ParseError(SkillError):
    """SKILL.md is missing, unreadable or has no usable frontmatter."""


class SkillNotFoundError(SkillError):
    """A skill name was requested that is not in the registry."""


@dataclass(frozen=True)
class Diagnostic:
    """One finding about a skill. ``code`` is stable and safe to match on."""

    level: Level
    code: str
    message: str
    path: Path | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "path": str(self.path) if self.path else None,
        }

    def __str__(self) -> str:
        where = f"{self.path}: " if self.path else ""
        return f"{self.level.upper()} [{self.code}] {where}{self.message}"


@dataclass(frozen=True)
class SkillProperties:
    """Frontmatter of a SKILL.md, normalised to the types the spec defines."""

    name: str
    description: str
    license: str | None = None
    compatibility: str | None = None
    metadata: Mapping[str, str] = field(default_factory=dict)
    allowed_tools: str | None = None
    extra: Mapping[str, Any] = field(default_factory=dict)

    @property
    def execution(self) -> str:
        return self.metadata.get(EXECUTION_KEY, EXECUTION_INLINE)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {"name": self.name, "description": self.description}
        if self.license is not None:
            out["license"] = self.license
        if self.compatibility is not None:
            out["compatibility"] = self.compatibility
        if self.metadata:
            out["metadata"] = dict(self.metadata)
        if self.allowed_tools is not None:
            out["allowed-tools"] = self.allowed_tools
        return out


@dataclass(frozen=True)
class Skill:
    """A discovered skill: its properties plus where it lives.

    The body is not stored. It is read from ``location`` at activation time, so
    edits made between activations are picked up and discovery stays cheap.
    """

    properties: SkillProperties
    location: Path
    scope: str = "path"

    @property
    def name(self) -> str:
        return self.properties.name

    @property
    def description(self) -> str:
        return self.properties.description

    @property
    def base_dir(self) -> Path:
        return self.location.parent

    @property
    def execution(self) -> str:
        return self.properties.execution


def estimate_tokens(text: str) -> int:
    """Rough, model-independent token estimate (about four characters per token)."""
    return (len(text) + 3) // 4
