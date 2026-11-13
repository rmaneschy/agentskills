"""Stand-in for an agent CLI, used by the delegation tests. Reads a brief, prints a reply."""

import pathlib
import sys

args = sys.argv[1:]
if "--from-file" in args:
    brief = pathlib.Path(args[args.index("--from-file") + 1]).read_text(encoding="utf-8")
elif "--from-arg" in args:
    brief = args[args.index("--from-arg") + 1]
else:
    brief = sys.stdin.read()

if "--fail" in args:
    print("partial work")
    print("boom", file=sys.stderr)
    sys.exit(7)

print("noise line " * 50)
if "--no-summary" not in args:
    print(f"<summary>brief had {len(brief)} chars; task seen: {'## Task' in brief}; ação concluída</summary>")
