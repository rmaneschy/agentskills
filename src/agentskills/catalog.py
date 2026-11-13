"""Layer 3: tell the model which skills exist without loading their instructions.

This is tier 1 of progressive disclosure: name and description only, about
50 to 100 tokens per skill. The output is plain text in a format any model can
read, so nothing here depends on a provider.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from typing import Any, Literal
from xml.sax.saxutils import escape

from .discovery import Registry
from .models import Skill

CatalogFormat = Literal["xml", "json", "markdown"]
Activation = Literal["file-read", "tool"]
ACTIVATION_TOOL_NAME = "activate_skill"

_INSTRUCTIONS: dict[str, str] = {
    "file-read": (
        "The following skills provide specialized instructions for specific tasks.\n"
        "When a task matches a skill's description, use your file-read tool to load\n"
        "the SKILL.md at the listed location before proceeding.\n"
        "When a skill references relative paths, resolve them against the skill's\n"
        "directory (the parent of SKILL.md) and use absolute paths in tool calls."
    ),
    "tool": (
        "The following skills provide specialized instructions for specific tasks.\n"
        f"When a task matches a skill's description, call the {ACTIVATION_TOOL_NAME} tool\n"
        "with the skill's name to load its full instructions."
    ),
}


def visible_skills(registry: Registry, *, exclude: Iterable[str] = ()) -> list[Skill]:
    """Skills the model may see: not excluded and not opted out of model invocation."""
    hidden = set(exclude)
    return [
        skill
        for name, skill in sorted(registry.skills.items())
        if name not in hidden and skill.properties.extra.get("disable-model-invocation") is not True
    ]


def render_catalog(skills: Iterable[Skill], fmt: CatalogFormat = "xml", *, include_location: bool = True) -> str:
    """Render the catalog. Returns an empty string when there are no skills."""
    skills = list(skills)
    if not skills:
        return ""
    if fmt == "json":
        entries: list[dict[str, Any]] = []
        for skill in skills:
            entry: dict[str, Any] = {"name": skill.name, "description": skill.description}
            if include_location:
                entry["location"] = str(skill.location)
            entries.append(entry)
        return json.dumps({"available_skills": entries}, indent=2, ensure_ascii=False)
    if fmt == "markdown":
        lines = []
        for skill in skills:
            suffix = f" (`{skill.location}`)" if include_location else ""
            lines.append(f"- **{skill.name}**: {skill.description}{suffix}")
        return "\n".join(lines)
    if fmt == "xml":
        lines = ["<available_skills>"]
        for skill in skills:
            lines += [
                "  <skill>",
                f"    <name>{escape(skill.name)}</name>",
                f"    <description>{escape(skill.description)}</description>",
            ]
            if include_location:
                lines.append(f"    <location>{escape(str(skill.location))}</location>")
            lines.append("  </skill>")
        lines.append("</available_skills>")
        return "\n".join(lines)
    raise ValueError(f"unknown catalog format: {fmt!r}; expected xml, json or markdown")


def behavioral_instructions(activation: Activation = "file-read") -> str:
    if activation not in _INSTRUCTIONS:
        raise ValueError(f"unknown activation mode: {activation!r}; expected file-read or tool")
    return _INSTRUCTIONS[activation]


def build_disclosure(
    registry: Registry,
    *,
    fmt: CatalogFormat = "xml",
    activation: Activation = "file-read",
    exclude: Iterable[str] = (),
) -> str:
    """Instructions plus catalog, ready for a system prompt. Empty when no skill is visible."""
    skills = visible_skills(registry, exclude=exclude)
    if not skills:
        return ""
    # With a dedicated tool the result carries the skill directory, so the location is not needed.
    catalog = render_catalog(skills, fmt, include_location=activation == "file-read")
    return f"{behavioral_instructions(activation)}\n\n{catalog}"


def activation_tool_schema(registry: Registry, *, exclude: Iterable[str] = ()) -> dict[str, Any] | None:
    """Provider-neutral JSON Schema for an activation tool, or None when no skill is visible.

    The name is constrained to the visible skills so the model cannot invent one.
    """
    skills = visible_skills(registry, exclude=exclude)
    if not skills:
        return None
    return {
        "name": ACTIVATION_TOOL_NAME,
        "description": "Load the full instructions of a skill listed in the skill catalog.",
        "parameters": {
            "type": "object",
            "properties": {"name": {"type": "string", "enum": [s.name for s in skills], "description": "Skill name"}},
            "required": ["name"],
            "additionalProperties": False,
        },
    }
