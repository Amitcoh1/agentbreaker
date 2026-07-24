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
    parser.error(f"unknown command {args.command!r}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
