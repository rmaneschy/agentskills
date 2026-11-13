"""Command line interface. Data goes to stdout, diagnostics to stderr, and it never prompts."""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence
from pathlib import Path

from . import __version__
from .activation import Session
from .catalog import build_disclosure
from .delegation import CommandRunner, RunnerError, build_brief, delegate, parse_runner_command, runner_from_env
from .discovery import DEFAULT_CLIENT_DIRS, Registry, default_scopes, discover, find_skill_dirs
from .installer import DEFAULT_DESTINATION, bundled_skill_names, install_skills, scaffold_skill
from .models import SKILL_FILE, SkillError, SkillNotFoundError
from .parser import read_properties
from .validator import has_errors, validate

EXIT_OK, EXIT_INVALID, EXIT_USAGE, EXIT_NOT_FOUND, EXIT_RUNNER = 0, 1, 2, 3, 4

EPILOG = """exit codes:
  0  success
  1  validation found errors (or warnings with --strict)
  2  wrong usage or invalid argument
  3  skill or path not found
  4  the subagent runner failed

examples:
  agentskills validate skills
  agentskills install --target .
  agentskills catalog --format xml
  agentskills activate skill-authoring
  agentskills delegate repo-exploration --task "Where is authentication configured?" --print-brief
"""


def _emit(data: object) -> None:
    print(json.dumps(data, indent=2, ensure_ascii=False))


def _add_discovery_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--project", default=".", help="project directory (default: current directory)")
    parser.add_argument(
        "--client-dir",
        action="append",
        metavar="DIR",
        help=f"folder that holds a skills/ directory, repeatable (default: {' '.join(DEFAULT_CLIENT_DIRS)}; example: .claude)",
    )
    parser.add_argument("--untrusted", action="store_true", help="do not load project-level skills")
    parser.add_argument("--no-user", action="store_true", help="do not load user-level skills")
    parser.add_argument("--no-bundled", action="store_true", help="do not load the skills bundled with this package")


def _registry(args: argparse.Namespace) -> Registry:
    scopes = default_scopes(
        args.project,
        client_dirs=tuple(args.client_dir or DEFAULT_CLIENT_DIRS),
        project_trusted=not args.untrusted,
        include_user=not args.no_user,
        include_bundled=not args.no_bundled,
    )
    registry = discover(scopes)
    for diagnostic in registry.diagnostics:
        print(diagnostic, file=sys.stderr)
    return registry


def _cmd_validate(args: argparse.Namespace) -> int:
    targets: list[Path] = []
    for raw in args.paths:
        path = Path(raw)
        if not path.exists():
            print(f"Error: {path} does not exist.", file=sys.stderr)
            return EXIT_NOT_FOUND
        nested = [] if (path / SKILL_FILE).is_file() else find_skill_dirs(path)
        targets += nested or [path]
    report, failed = [], False
    for target in targets:
        diagnostics = validate(target)
        bad = has_errors(diagnostics) or (args.strict and bool(diagnostics))
        failed = failed or bad
        report.append({"skill": str(target), "valid": not bad, "diagnostics": [d.to_dict() for d in diagnostics]})
        if not args.json:
            for diagnostic in diagnostics:
                print(diagnostic, file=sys.stderr)
            print(f"{'FAIL' if bad else 'ok  '} {target}")
    if args.json:
        _emit(report)
    return EXIT_INVALID if failed else EXIT_OK


def _cmd_read_properties(args: argparse.Namespace) -> int:
    _emit(read_properties(Path(args.path)).to_dict())
    return EXIT_OK


def _cmd_list(args: argparse.Namespace) -> int:
    registry = _registry(args)
    rows = [
        {
            "name": s.name,
            "scope": s.scope,
            "execution": s.execution,
            "description": s.description,
            "location": str(s.location),
        }
        for _, s in sorted(registry.skills.items())
    ]
    if args.json:
        _emit(rows)
    else:
        for row in rows:
            print(f"{row['name']}\t{row['scope']}\t{row['execution']}\t{row['location']}")
    return EXIT_OK


def _cmd_catalog(args: argparse.Namespace) -> int:
    text = build_disclosure(_registry(args), fmt=args.format, activation=args.activation, exclude=args.exclude or ())
    if text:
        print(text)
    return EXIT_OK


def _cmd_activate(args: argparse.Namespace) -> int:
    print(Session(_registry(args)).activate(args.name, include_frontmatter=args.include_frontmatter).content)
    return EXIT_OK


def _cmd_delegate(args: argparse.Namespace) -> int:
    registry = _registry(args)
    skill = registry.get(args.name)
    if skill is None:
        raise SkillNotFoundError(
            f"skill {args.name!r} is not available. Available skills: {', '.join(registry.names()) or 'none'}"
        )
    if args.print_brief:
        print(build_brief(skill, args.task, inputs=args.input or (), output_dir=args.output_dir))
        return EXIT_OK
    runner = CommandRunner(parse_runner_command(args.runner)) if args.runner else runner_from_env()
    if runner is None:
        print(
            "Error: no subagent runner configured.\n"
            '       Pass --runner \'["<agent-cli>", "<flags>"]\' or set AGENTSKILLS_SUBAGENT_CMD to the same JSON array.\n'
            "       If your agent has native subagents, use --print-brief and hand the text to its subagent tool.",
            file=sys.stderr,
        )
        return EXIT_USAGE
    result = delegate(
        skill,
        args.task,
        runner,
        cwd=args.project,
        inputs=args.input or (),
        output_dir=args.output_dir,
        transcript_dir=args.transcript_dir,
        timeout=args.timeout,
        max_summary_chars=args.max_summary_chars,
    )
    if args.json:
        _emit(result.to_dict())
    else:
        print(result.summary)
        print(f"transcript: {result.transcript}", file=sys.stderr)
    return EXIT_OK if result.exit_code == 0 else EXIT_RUNNER


def _cmd_install(args: argparse.Namespace) -> int:
    if args.list:
        for name in bundled_skill_names():
            print(name)
        return EXIT_OK
    actions = install_skills(
        args.target, args.names or None, destination=args.dest, overwrite=args.force, dry_run=args.dry_run
    )
    if args.json:
        _emit([a.to_dict() for a in actions])
    else:
        for action in actions:
            print(f"{action.status}\t{action.name}\t{action.target}")
    return EXIT_OK


def _cmd_new(args: argparse.Namespace) -> int:
    print(scaffold_skill(args.path, args.name, args.description, subagent=args.subagent))
    return EXIT_OK


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="agentskills",
        description="Work with Agent Skills: validate, discover, disclose, activate, delegate and install.",
        epilog=EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--version", action="version", version=f"agentskills {__version__}")
    sub = parser.add_subparsers(dest="command", required=True, metavar="COMMAND")

    p = sub.add_parser("validate", help="check skill directories against the specification")
    p.add_argument("paths", nargs="+", help="skill directory, or a directory that contains skills")
    p.add_argument("--strict", action="store_true", help="treat warnings as failures")
    p.add_argument("--json", action="store_true", help="print the report as JSON")
    p.set_defaults(func=_cmd_validate)

    p = sub.add_parser("read-properties", help="print a skill's frontmatter as JSON")
    p.add_argument("path", help="skill directory")
    p.set_defaults(func=_cmd_read_properties)

    p = sub.add_parser("list", help="list the skills visible from a project")
    _add_discovery_options(p)
    p.add_argument("--json", action="store_true", help="print as JSON")
    p.set_defaults(func=_cmd_list)

    p = sub.add_parser("catalog", help="print the instructions and skill catalog for a system prompt")
    _add_discovery_options(p)
    p.add_argument("--format", choices=["xml", "json", "markdown"], default="xml")
    p.add_argument(
        "--activation", choices=["file-read", "tool"], default="file-read", help="how the model loads a skill"
    )
    p.add_argument("--exclude", action="append", metavar="NAME", help="hide a skill, repeatable")
    p.set_defaults(func=_cmd_catalog)

    p = sub.add_parser("activate", help="print a skill's instructions, wrapped for the conversation")
    p.add_argument("name")
    _add_discovery_options(p)
    p.add_argument("--include-frontmatter", action="store_true", help="keep the YAML frontmatter in the output")
    p.set_defaults(func=_cmd_activate)

    p = sub.add_parser("delegate", help="run a skill in an isolated subagent session and print only its summary")
    p.add_argument("name")
    p.add_argument("--task", required=True, help="what the subagent must do")
    p.add_argument("--input", action="append", metavar="FILE", help="input file to mention in the brief, repeatable")
    p.add_argument("--output-dir", help="directory where the subagent must save its outputs")
    p.add_argument(
        "--print-brief", action="store_true", help="print the subagent brief and exit, without running anything"
    )
    p.add_argument("--runner", metavar="JSON", help='agent command as a JSON array, e.g. \'["my-agent", "--print"]\'')
    p.add_argument("--timeout", type=float, help="seconds to wait for the subagent")
    p.add_argument("--transcript-dir", help="where to save the full output (default: system temp directory)")
    p.add_argument("--max-summary-chars", type=int, default=4000)
    p.add_argument("--json", action="store_true", help="print the result as JSON")
    _add_discovery_options(p)
    p.set_defaults(func=_cmd_delegate)

    p = sub.add_parser("install", help="copy bundled skills into a project")
    p.add_argument("names", nargs="*", help="skills to install (default: all)")
    p.add_argument("--target", default=".", help="project directory (default: current directory)")
    p.add_argument(
        "--dest", default=str(DEFAULT_DESTINATION), help="destination inside the project (default: .agents/skills)"
    )
    p.add_argument("--force", action="store_true", help="replace skills that already exist")
    p.add_argument("--dry-run", action="store_true", help="show what would change without writing")
    p.add_argument("--list", action="store_true", help="list bundled skills and exit")
    p.add_argument("--json", action="store_true", help="print as JSON")
    p.set_defaults(func=_cmd_install)

    p = sub.add_parser("new", help="create a skill from the template")
    p.add_argument("name", help="skill name, e.g. pdf-processing")
    p.add_argument("--description", required=True, help="what the skill does and when to use it")
    p.add_argument("--path", default="skills", help="parent directory (default: skills)")
    p.add_argument("--subagent", action="store_true", help="mark the skill to run in a subagent session")
    p.set_defaults(func=_cmd_new)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except SkillNotFoundError as error:
        print(f"Error: {error}", file=sys.stderr)
        return EXIT_NOT_FOUND
    except RunnerError as error:
        print(f"Error: {error}", file=sys.stderr)
        return EXIT_RUNNER
    except (SkillError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return EXIT_USAGE


if __name__ == "__main__":
    raise SystemExit(main())
