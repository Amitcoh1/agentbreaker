"""breakerbox command-line entry point."""

from __future__ import annotations

import argparse

from breakerbox import pricing_update


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="breakerbox")
    sub = parser.add_subparsers(dest="command", required=True)

    up = sub.add_parser("update-prices", help="refresh prices.json from LiteLLM")
    up.add_argument("--source", default=pricing_update.DEFAULT_SOURCE, help="price-table URL")
    up.add_argument("--output", default=None, help="output path (default: bundled prices.json)")
    up.add_argument("--dry-run", action="store_true", help="show a diff, write nothing")

    val = sub.add_parser("validate", help="validate a graph spec (JSON)")
    val.add_argument("spec", help="path to a graph spec.json")

    bld = sub.add_parser("build", help="generate guarded LangGraph Python from a spec")
    bld.add_argument("spec", help="path to a graph spec.json")
    bld.add_argument("-o", "--output", default=None, help="write .py here (default: stdout)")

    ini = sub.add_parser("init", help="scaffold a guarded starter from a template")
    ini.add_argument("-t", "--template", default=None, help="template name (see --list)")
    ini.add_argument("--list", action="store_true", help="list available templates")
    ini.add_argument("-o", "--output", default=".", help="output directory (default: cwd)")
    ini.add_argument("--name", default=None, help="output basename (default: template name)")

    args = parser.parse_args(argv)
    if args.command == "update-prices":
        return pricing_update.run(source=args.source, output=args.output, dry_run=args.dry_run)
    if args.command == "validate":
        from breakerbox import graphspec

        result = graphspec.validate(graphspec.load_spec(args.spec))
        for e in result.errors:
            print("ERROR:", e)
        for w in result.warnings:
            print("WARN: ", w)
        for n in result.notes:
            print("NOTE: ", n)
        print("OK" if result.ok else f"INVALID — {len(result.errors)} error(s)")
        return 0 if result.ok else 1
    if args.command == "build":
        from breakerbox import codegen, graphspec

        spec = graphspec.load_spec(args.spec)
        result = graphspec.validate(spec)
        if not result.ok:
            for e in result.errors:
                print("ERROR:", e)
            return 1
        code = codegen.generate(spec)
        if args.output:
            from pathlib import Path

            Path(args.output).write_text(code)
            print(f"wrote {args.output}")
        else:
            print(code, end="")
        return 0
    if args.command == "init":
        from pathlib import Path

        from breakerbox import codegen, graphspec, templates

        if args.list or not args.template:
            for name, desc in templates.catalog():
                print(f"{name:16} {desc}")
            if not args.list:
                print("\nPick one:  breakerbox init --template <name>")
                return 2
            return 0
        spec = templates.get(args.template)
        if spec is None:
            parser.error(f"unknown template {args.template!r}; run `breakerbox init --list`")
        result = graphspec.validate(spec)
        if not result.ok:  # templates are valid by construction; guard against a bad edit
            for e in result.errors:
                print("ERROR:", e)
            return 1
        base = args.name or args.template
        out = Path(args.output)
        out.mkdir(parents=True, exist_ok=True)
        spec_path = out / f"{base}.spec.json"
        code_path = out / f"{base}.py"
        spec_path.write_text(graphspec.to_json(spec) + "\n")
        code_path.write_text(codegen.generate(spec))
        print(f"wrote {spec_path}")
        print(f"wrote {code_path}")
        print(f"\nNext:  edit {code_path} — fill in the node bodies, then run it.")
        print("       guard() is already wired from the template.")
        return 0
    parser.error(f"unknown command {args.command!r}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
