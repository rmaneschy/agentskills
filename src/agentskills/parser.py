"""Layer 1a: read a SKILL.md into frontmatter and body.

Parsing is lenient on purpose, following the client implementation guide:
skills written for other clients may carry YAML that is technically invalid
(most often an unquoted value containing a colon). Strictness lives in
``validator``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import yaml

from .models import SKILL_FILE, ParseError, SkillProperties

_DELIMITER = re.compile(r"^---[ \t]*$")
_PLAIN_SCALAR_WITH_COLON = re.compile(r"^([A-Za-z0-9_-]+):[ \t]+(?![\"'>|\[{&*!])(.*:[ \t].*|.*:)$")


def split_frontmatter(text: str) -> tuple[str, str]:
    """Return ``(yaml_text, body)``. Raises ParseError when there is no frontmatter."""
    lines = text.lstrip("﻿").splitlines()
    if not lines or not _DELIMITER.match(lines[0]):
        raise ParseError("SKILL.md must start with a '---' line that opens the YAML frontmatter")
    for index in range(1, len(lines)):
        if _DELIMITER.match(lines[index]):
            return "\n".join(lines[1:index]), "\n".join(lines[index + 1 :]).strip()
    raise ParseError("frontmatter is not closed: expected a second '---' line")


def _repair(yaml_text: str) -> str:
    """Quote top-level plain scalars that contain a colon, the usual cross-client breakage."""
    fixed = []
    for line in yaml_text.splitlines():
        match = _PLAIN_SCALAR_WITH_COLON.match(line)
        fixed.append(f"{match.group(1)}: {json.dumps(match.group(2))}" if match else line)
    return "\n".join(fixed)


def load_frontmatter(yaml_text: str) -> tuple[dict[str, Any], bool]:
    """Parse the YAML block. Returns ``(mapping, repaired)``."""
    repaired = False
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as first_error:
        try:
            data = yaml.safe_load(_repair(yaml_text))
            repaired = True
        except yaml.YAMLError:
            raise ParseError(f"frontmatter is not valid YAML: {first_error}") from first_error
    if data is None:
        data = {}
    if not isinstance(data, dict):
        raise ParseError("frontmatter must be a YAML mapping of fields")
    return {str(key): value for key, value in data.items()}, repaired


def find_skill_file(skill_dir: Path) -> Path:
    path = Path(skill_dir) / SKILL_FILE
    if not path.is_file():
        raise ParseError(f"{SKILL_FILE} not found in {skill_dir}")
    return path


def parse_skill_md(path: Path) -> tuple[dict[str, Any], str, bool]:
    """Read one SKILL.md. Returns ``(frontmatter, body, repaired)``."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise ParseError(f"cannot read {path}: {error}") from error
    yaml_text, body = split_frontmatter(text)
    frontmatter, repaired = load_frontmatter(yaml_text)
    return frontmatter, body, repaired


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    return value if isinstance(value, str) else str(value)


def to_properties(frontmatter: dict[str, Any]) -> SkillProperties:
    """Build SkillProperties, coercing scalars to strings. Requires name and description."""
    name = _optional_text(frontmatter.get("name"))
    description = _optional_text(frontmatter.get("description"))
    if not name or not name.strip():
        raise ParseError("frontmatter field 'name' is required")
    if not description or not description.strip():
        raise ParseError("frontmatter field 'description' is required and must not be empty")
    raw_metadata = frontmatter.get("metadata")
    metadata = {str(k): str(v) for k, v in raw_metadata.items()} if isinstance(raw_metadata, dict) else {}
    known = {"name", "description", "license", "compatibility", "metadata", "allowed-tools"}
    return SkillProperties(
        name=name.strip(),
        description=description.strip(),
        license=_optional_text(frontmatter.get("license")),
        compatibility=_optional_text(frontmatter.get("compatibility")),
        metadata=metadata,
        allowed_tools=_optional_text(frontmatter.get("allowed-tools")),
        extra={k: v for k, v in frontmatter.items() if k not in known},
    )


def read_properties(skill_dir: Path) -> SkillProperties:
    """Lenient read of a skill directory's properties."""
    frontmatter, _body, _repaired = parse_skill_md(find_skill_file(Path(skill_dir)))
    return to_properties(frontmatter)


def read_body(skill_md: Path) -> str:
    """Markdown body of a SKILL.md, without the frontmatter."""
    _frontmatter, body, _repaired = parse_skill_md(Path(skill_md))
    return body
