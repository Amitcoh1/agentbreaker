"""agentbreaker command-line entry point."""

from __future__ import annotations

import argparse

from agentbreaker import pricing_update


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agentbreaker")
    sub = parser.add_subparsers(dest="command", required=True)

    up = sub.add_parser("update-prices", help="refresh prices.json from LiteLLM")
    up.add_argument("--source", default=pricing_update.DEFAULT_SOURCE, help="price-table URL")
    up.add_argument("--output", default=None, help="output path (default: bundled prices.json)")
    up.add_argument("--dry-run", action="store_true", help="show a diff, write nothing")

    args = parser.parse_args(argv)
    if args.command == "update-prices":
        return pricing_update.run(source=args.source, output=args.output, dry_run=args.dry_run)
    parser.error(f"unknown command {args.command!r}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
