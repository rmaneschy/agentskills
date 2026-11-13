"""Python implementation of the Agent Skills format (https://agentskills.io).

Layers, from the file format up:
    parser, validator   read and check one SKILL.md
    discovery           find skills in project, user and bundled scopes
    catalog             disclose name and description to the model
    activation          load a skill's instructions into the conversation
    delegation          run a skill in an isolated subagent session
    installer           ship and install the bundled skill pack
"""

from .activation import ActivationResult, Session, list_resources, wrap_skill_content
from .catalog import activation_tool_schema, behavioral_instructions, build_disclosure, render_catalog, visible_skills
from .delegation import (
    CommandRunner,
    Runner,
    RunnerError,
    RunOutput,
    SubagentResult,
    build_brief,
    delegate,
    extract_summary,
    runner_from_env,
)
from .discovery import Registry, Scope, default_scopes, discover, find_skill_dirs, load_skill
from .installer import bundled_skill_names, bundled_skills_dir, install_skills, scaffold_skill
from .models import Diagnostic, ParseError, Skill, SkillError, SkillNotFoundError, SkillProperties
from .parser import read_properties
from .validator import has_errors, validate

__version__ = "0.1.0"

__all__ = [
    "ActivationResult",
    "CommandRunner",
    "Diagnostic",
    "ParseError",
    "Registry",
    "RunOutput",
    "Runner",
    "RunnerError",
    "Scope",
    "Session",
    "Skill",
    "SkillError",
    "SkillNotFoundError",
    "SkillProperties",
    "SubagentResult",
    "activation_tool_schema",
    "behavioral_instructions",
    "build_brief",
    "build_disclosure",
    "bundled_skill_names",
    "bundled_skills_dir",
    "default_scopes",
    "delegate",
    "discover",
    "extract_summary",
    "find_skill_dirs",
    "has_errors",
    "install_skills",
    "list_resources",
    "load_skill",
    "read_properties",
    "render_catalog",
    "runner_from_env",
    "scaffold_skill",
    "validate",
    "visible_skills",
    "wrap_skill_content",
]
