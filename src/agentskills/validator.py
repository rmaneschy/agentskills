"""Layer 1b: strict validation of one skill directory against the specification.

Errors are violations of the spec. Warnings are recommendations from the spec
and the authoring guides (size limits, reference depth, description wording).
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .models import (
    EXECUTION_KEY,
    EXECUTION_MODES,
    MAX_BODY_LINES,
    MAX_BODY_TOKENS,
    MAX_COMPATIBILITY_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_NAME_LENGTH,
    SKILL_FILE,
    SPEC_FIELDS,
    Diagnostic,
    ParseError,
    estimate_tokens,
)
from .parser import parse_skill_md

NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_MD_LINK = re.compile(r"\[[^\]]*\]\(([^)\s#]+)(?:#[^)]*)?\)")
_RESOURCE_PATH = re.compile(r"(?<![\w./-])((?:scripts|references|assets)/[\w./-]+\.\w+)")
_TRIGGER_HINT = re.compile(r"\buse (?:this skill )?(?:when|for|if|whenever)\b|\bquando\b|\bwhen\b", re.I)
#: Extra frontmatter keys other clients are known to use. Accepted without a warning.
KNOWN_CLIENT_FIELDS = frozenset({"disable-model-invocation"})


def _error(code: str, message: str, path: Path) -> Diagnostic:
    return Diagnostic("error", code, message, path)


def _warning(code: str, message: str, path: Path) -> Diagnostic:
    return Diagnostic("warning", code, message, path)


def validate_name(name: Any, dir_name: str | None, path: Path) -> list[Diagnostic]:
    out: list[Diagnostic] = []
    if not isinstance(name, str) or not name:
        return [_error("name-required", "'name' is required and must be a non-empty string", path)]
    if len(name) > MAX_NAME_LENGTH:
        out.append(_error("name-length", f"'name' has {len(name)} characters; maximum is {MAX_NAME_LENGTH}", path))
    if not NAME_PATTERN.match(name):
        out.append(
            _error(
                "name-format",
                f"'name' is {name!r}; use lowercase letters, digits and single hyphens, "
                "not starting or ending with a hyphen (example: pdf-processing)",
                path,
            )
        )
    if dir_name is not None and name != dir_name:
        out.append(
            _error("name-directory", f"'name' is {name!r} but the directory is {dir_name!r}; they must match", path)
        )
    return out


def _relative_targets(text: str) -> tuple[set[str], set[str]]:
    """Return ``(markdown link targets, bare resource paths)`` that look like local files."""
    links = {t for t in _MD_LINK.findall(text) if "://" not in t and not t.startswith(("mailto:", "/"))}
    bare = set(_RESOURCE_PATH.findall(text)) - links
    return links, bare


def _check_references(skill_dir: Path, body: str, skill_md: Path) -> list[Diagnostic]:
    out: list[Diagnostic] = []
    links, bare = _relative_targets(body)
    for target in sorted(links):
        resolved = skill_dir / target
        if not resolved.exists():
            out.append(
                _error("reference-missing", f"link target {target!r} does not exist in the skill directory", skill_md)
            )
        elif resolved.suffix.lower() == ".md" and resolved.is_file():
            nested_links, nested_bare = _relative_targets(resolved.read_text(encoding="utf-8", errors="replace"))
            nested_md = sorted(t for t in nested_links | nested_bare if t.lower().endswith(".md"))
            if nested_md:
                out.append(
                    _warning(
                        "reference-depth",
                        f"{target} points to further files ({', '.join(nested_md)}); keep references one level deep from {SKILL_FILE}",
                        resolved,
                    )
                )
    for target in sorted(bare):
        if not (skill_dir / target).exists():
            out.append(
                _warning(
                    "resource-missing", f"{target!r} is mentioned but does not exist in the skill directory", skill_md
                )
            )
    return out


def validate(skill_dir: Path | str) -> list[Diagnostic]:
    """Validate one skill directory. An empty list means the skill is valid and clean."""
    skill_dir = Path(skill_dir)
    if not skill_dir.is_dir():
        return [_error("not-a-directory", "path is not a directory", skill_dir)]
    skill_md = skill_dir / SKILL_FILE
    if not skill_md.is_file():
        lookalike = next((p.name for p in skill_dir.iterdir() if p.name.lower() == SKILL_FILE.lower()), None)
        hint = f" (found {lookalike!r}; the file name must be exactly {SKILL_FILE})" if lookalike else ""
        return [_error("skill-md-missing", f"{SKILL_FILE} not found{hint}", skill_dir)]
    try:
        frontmatter, body, repaired = parse_skill_md(skill_md)
    except ParseError as error:
        return [_error("frontmatter-invalid", str(error), skill_md)]

    out: list[Diagnostic] = []
    if repaired:
        out.append(
            _error(
                "yaml-invalid",
                "frontmatter is not valid YAML (a value contains an unquoted colon); wrap the value in quotes",
                skill_md,
            )
        )
    out += validate_name(frontmatter.get("name"), skill_dir.resolve().name, skill_md)

    description = frontmatter.get("description")
    if not isinstance(description, str) or not description.strip():
        out.append(_error("description-required", "'description' is required and must be a non-empty string", skill_md))
    else:
        if len(description) > MAX_DESCRIPTION_LENGTH:
            out.append(
                _error(
                    "description-length",
                    f"'description' has {len(description)} characters; maximum is {MAX_DESCRIPTION_LENGTH}",
                    skill_md,
                )
            )
        if len(description.strip()) < 40 or not _TRIGGER_HINT.search(description):
            out.append(
                _warning(
                    "description-trigger",
                    "'description' should say what the skill does and when to use it (for example: 'Use when ...')",
                    skill_md,
                )
            )

    compatibility = frontmatter.get("compatibility")
    if compatibility is not None:
        if not isinstance(compatibility, str) or not compatibility.strip():
            out.append(
                _error("compatibility-type", "'compatibility' must be a non-empty string when present", skill_md)
            )
        elif len(compatibility) > MAX_COMPATIBILITY_LENGTH:
            out.append(
                _error(
                    "compatibility-length",
                    f"'compatibility' has {len(compatibility)} characters; maximum is {MAX_COMPATIBILITY_LENGTH}",
                    skill_md,
                )
            )

    for key in ("license", "allowed-tools"):
        value = frontmatter.get(key)
        if value is not None and not isinstance(value, str):
            out.append(_error(f"{key}-type", f"'{key}' must be a string", skill_md))

    metadata = frontmatter.get("metadata")
    if metadata is not None:
        if not isinstance(metadata, dict):
            out.append(
                _error("metadata-type", "'metadata' must be a mapping of string keys to string values", skill_md)
            )
        else:
            for key, value in metadata.items():
                if not isinstance(key, str) or not isinstance(value, str):
                    out.append(
                        _error(
                            "metadata-value",
                            f"metadata entry {key!r} must map a string to a string; quote the value (got {value!r})",
                            skill_md,
                        )
                    )
            mode = metadata.get(EXECUTION_KEY)
            if mode is not None and mode not in EXECUTION_MODES:
                out.append(
                    _error(
                        "execution-mode",
                        f"metadata '{EXECUTION_KEY}' is {mode!r}; expected one of {sorted(EXECUTION_MODES)}",
                        skill_md,
                    )
                )

    unknown = sorted(set(frontmatter) - SPEC_FIELDS - KNOWN_CLIENT_FIELDS)
    if unknown:
        out.append(
            _warning(
                "unknown-field",
                f"fields not defined by the specification: {', '.join(unknown)}; put custom data under 'metadata'",
                skill_md,
            )
        )

    if not body:
        out.append(_warning("body-empty", "the body has no instructions", skill_md))
    lines = body.count("\n") + 1 if body else 0
    if lines > MAX_BODY_LINES:
        out.append(
            _warning(
                "body-lines",
                f"body has {lines} lines; keep {SKILL_FILE} under {MAX_BODY_LINES} and move detail to references/",
                skill_md,
            )
        )
    tokens = estimate_tokens(body)
    if tokens > MAX_BODY_TOKENS:
        out.append(
            _warning(
                "body-tokens", f"body is about {tokens} tokens; the recommended limit is {MAX_BODY_TOKENS}", skill_md
            )
        )

    out += _check_references(skill_dir, body, skill_md)
    return out


def has_errors(diagnostics: list[Diagnostic]) -> bool:
    return any(d.level == "error" for d in diagnostics)
