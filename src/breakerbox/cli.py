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
    bld.add_argument("-p", "--policy", default="breakerbox.yaml", help="policy file to enforce")
    bld.add_argument("--no-policy", action="store_true", help="skip breakerbox.yaml enforcement")

    pol = sub.add_parser("policy", help="check spec(s) against a breakerbox.yaml policy")
    pol.add_argument("spec", nargs="+", help="spec(s) to check")
    pol.add_argument("-p", "--policy", default="breakerbox.yaml", help="policy file")

    egr = sub.add_parser("egress", help="certify the network endpoints a spec can reach")
    egr.add_argument("spec", help="path to a graph spec.json")
    egr.add_argument("--strict", action="store_true", help="exit 1 on an undeclared model egress")
    egr.add_argument("--json", action="store_true", help="machine-readable output")

    ceil = sub.add_parser("ceiling", help="print the provable worst-case cost ceiling of a spec")
    ceil.add_argument("spec", nargs="+", help="path(s) to graph spec.json file(s)")
    ceil.add_argument(
        "--max",
        type=float,
        default=None,
        help="fail if the ceiling exceeds this USD (or is unbounded)",
    )
    ceil.add_argument("--json", action="store_true", help="machine-readable output")

    dow = sub.add_parser("dow", help="assess denial-of-wallet exposure (unbounded spend) of a spec")
    dow.add_argument("spec", nargs="+", help="path(s) to graph spec.json file(s)")
    dow.add_argument("--strict", action="store_true", help="exit 1 if any spec has a DoW finding")
    dow.add_argument("--json", action="store_true", help="machine-readable output")

    mcp = sub.add_parser("mcp", help="audit an agent's MCP server config for posture issues")
    mcp.add_argument("config", nargs="+", help="path(s) to an MCP config (mcpServers JSON)")
    mcp.add_argument("--strict", action="store_true", help="exit 1 if any posture finding")
    mcp.add_argument("--json", action="store_true", help="machine-readable output")

    flw = sub.add_parser("flow", help="scan an exported agent flow (Langflow) for findings")
    flw.add_argument("flow", nargs="+", help="path(s) to an exported flow.json")
    flw.add_argument("--strict", action="store_true", help="exit 1 if any finding")
    flw.add_argument("--json", action="store_true", help="machine-readable output")

    bsl = sub.add_parser("baseline", help="fail CI on new findings vs an accepted baseline")
    bsl.add_argument("findings", nargs="*",
                     help="JSON/JSONL finding files from `dow|mcp|flow --json` (or - for stdin)")
    bsl.add_argument("--update", action="store_true", help="accept current findings as baseline")
    bsl.add_argument("-f", "--file", default=".breakerbox/findings-baseline.json",
                     help="baseline path")

    lck = sub.add_parser(
        "lock", help="pin the price table + ceiling to breakerbox.lock; --check for CI drift"
    )
    lck.add_argument("spec", nargs="*", help="spec(s) to lock (omit with --check)")
    lck.add_argument("--check", action="store_true", help="fail if prices or a ceiling drifted")
    lck.add_argument("-f", "--file", default="breakerbox.lock", help="lockfile path")

    dff = sub.add_parser("diff", help="ceiling delta between two files (spec.json or .py)")
    dff.add_argument("old", help="old spec.json or generated .py")
    dff.add_argument("new", help="new spec.json or generated .py")
    dff.add_argument(
        "--fail-on-increase", action="store_true", help="exit 1 if the ceiling rose/lost its bound"
    )

    ini = sub.add_parser("init", help="scaffold a guarded starter from a template")
    ini.add_argument("-t", "--template", default=None, help="template name (see --list)")
    ini.add_argument("--list", action="store_true", help="list available templates")
    ini.add_argument("-o", "--output", default=".", help="output directory (default: cwd)")
    ini.add_argument("--name", default=None, help="output basename (default: template name)")

    sr = sub.add_parser("shadow-report", help="aggregate would-trip events from shadow-mode runs")
    sr.add_argument("--dir", default="./breakerbox_reports", help="report dir to scan")
    sr.add_argument("--json", action="store_true", help="emit JSON instead of a text summary")

    cc = sub.add_parser("claudecode", help="install Breakerbox budget hooks into Claude Code")
    ccsub = cc.add_subparsers(dest="cc_command", required=True)
    cci = ccsub.add_parser("init", help="install/refresh the hooks in .claude/settings.json")
    cci.add_argument("-o", "--dir", default=".", help="project dir (default: cwd)")
    cci.add_argument("--session-ceiling", type=float, default=5.0, help="per-session USD ceiling")
    cci.add_argument("--daily-ceiling", type=float, default=50.0, help="per-day USD ceiling")
    cci.add_argument("--otel", default=None, help="local OTel collector endpoint (optional)")

    args = parser.parse_args(argv)
    if args.command == "update-prices":
        return pricing_update.run(source=args.source, output=args.output, dry_run=args.dry_run)
    if args.command == "shadow-report":
        import json as _json

        from breakerbox.report.shadow import aggregate_shadow, render_shadow

        summary = aggregate_shadow(args.dir)
        print(_json.dumps(summary) if args.json else render_shadow(summary))
        return 0
    if args.command == "claudecode":
        from breakerbox import claudecode as _cc

        summary = _cc.init(args.dir, args.session_ceiling, args.daily_ceiling, args.otel)
        print(f"breakerbox: Claude Code hooks installed -> {summary['settings_path']}")
        print(
            f"  session ceiling ${summary['session_ceiling']:.2f} · "
            f"daily ceiling ${summary['daily_ceiling']:.2f}"
        )
        return 0
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
        if not args.no_policy:
            from pathlib import Path

            ppath = Path(args.policy)
            if ppath.exists():
                from breakerbox import policy as _policy

                violations = _policy.check_policy(spec, _policy.load_policy(ppath))
                if violations:
                    for v in violations:
                        print(f"POLICY VIOLATION {v.rule}: {v.message}")
                    print(f"\nrefusing to emit — {args.policy} not satisfied.")
                    return 1
        code = codegen.generate(spec)
        if args.output:
            from pathlib import Path

            Path(args.output).write_text(code)
            print(f"wrote {args.output}")
        else:
            print(code, end="")
        return 0
    if args.command == "ceiling":
        import json as _json

        from breakerbox import ceiling as _ceiling
        from breakerbox import graphspec

        multi = len(args.spec) > 1
        failed = False
        for idx, spec_path in enumerate(args.spec):
            c = _ceiling.cost_ceiling(graphspec.load_spec(spec_path))
            if args.json:
                print(_json.dumps({"spec": spec_path, **c.__dict__}))
            else:
                if multi:
                    print(f"# {spec_path}")
                print(_ceiling.format_ceiling(c))
            # CI gate: fail when a limit is set and the ceiling is unbounded or exceeds it.
            if args.max is not None and (c.ceiling_usd is None or c.ceiling_usd > args.max):
                got = "unbounded" if c.ceiling_usd is None else f"${c.ceiling_usd:.2f}"
                print(f"FAIL: ceiling {got} exceeds the --max ${args.max:.2f} limit.")
                failed = True
            if not args.json and multi and idx < len(args.spec) - 1:
                print()
        return 1 if failed else 0
    if args.command == "dow":
        import json as _json

        from breakerbox import dow as _dow
        from breakerbox import graphspec

        multi = len(args.spec) > 1
        found = False
        for idx, spec_path in enumerate(args.spec):
            f = _dow.assess_dow(graphspec.load_spec(spec_path))
            if f.severity != "none":
                found = True
            if args.json:
                print(_json.dumps({"spec": spec_path, **f.as_dict()}))
            else:
                if multi:
                    print(f"# {spec_path}")
                print(_dow.format_dow(f))
                if multi and idx < len(args.spec) - 1:
                    print()
        return 1 if (args.strict and found) else 0
    if args.command == "mcp":
        import json as _json

        from breakerbox import mcpscan

        multi = len(args.config) > 1
        found = False
        for idx, cfg_path in enumerate(args.config):
            findings = mcpscan.scan_config(mcpscan.load_mcp_config(cfg_path))
            if findings:
                found = True
            if args.json:
                for fi in findings:
                    print(_json.dumps({"config": cfg_path, **fi.as_dict()}))
            else:
                if multi:
                    print(f"# {cfg_path}")
                print(mcpscan.format_findings(findings))
                if multi and idx < len(args.config) - 1:
                    print()
        return 1 if (args.strict and found) else 0
    if args.command == "flow":
        import json as _json

        from breakerbox import flowscan

        multi = len(args.flow) > 1
        found = False
        for idx, flow_path in enumerate(args.flow):
            findings = flowscan.scan_flow(flowscan.load_flow(flow_path))
            if findings:
                found = True
            if args.json:
                for fi in findings:
                    print(_json.dumps({"flow": flow_path, **fi.as_dict()}))
            else:
                if multi:
                    print(f"# {flow_path}")
                print(flowscan.format_findings(findings))
                if multi and idx < len(args.flow) - 1:
                    print()
        return 1 if (args.strict and found) else 0
    if args.command == "baseline":
        import json as _json
        import sys
        from pathlib import Path

        from breakerbox import findings as _f

        texts = [sys.stdin.read() if p == "-" else Path(p).read_text() for p in args.findings]
        if not args.findings:
            texts.append(sys.stdin.read())  # default to stdin when no files given
        found: list = []
        for t in texts:
            found.extend(_f.load_findings(t))
        bpath = Path(args.file)
        if args.update:
            bpath.parent.mkdir(parents=True, exist_ok=True)
            base = _f.build_baseline(found)
            bpath.write_text(_json.dumps(base, indent=2) + "\n")
            n = len(base["fingerprints"])
            print(f"wrote {args.file} — accepted {n} finding(s) as baseline.")
            return 0
        if not bpath.exists():
            print(f"no baseline at {args.file} — create it with "
                  f"`breakerbox baseline --update <findings>`")
            return 1
        res = _f.check_baseline(found, _json.loads(bpath.read_text()))
        for f in res.new:
            print(f"NEW: {_f.summarize(f)}")
        if res.fixed:
            print(f"({len(res.fixed)} baselined finding(s) no longer present — "
                  f"re-baseline with --update to prune)")
        if res.new:
            print(f"\n{len(res.new)} new finding(s) — fail. Accept with "
                  f"`breakerbox baseline --update`.")
            return 1
        print(f"{args.file}: no new findings ({len(res.known)} known).")
        return 0
    if args.command == "lock":
        import json as _json
        from pathlib import Path

        from breakerbox import lockfile

        lock_path = Path(args.file)
        if args.check:
            if not lock_path.exists():
                print(f"no lockfile at {args.file} — run `breakerbox lock <spec>...` first")
                return 1
            drifts = lockfile.check_lock(_json.loads(lock_path.read_text()))
            for d in drifts:
                print(f"DRIFT: {d.message}")
            if drifts:
                print(f"\n{len(drifts)} drift(s) — re-pin with `breakerbox lock <spec>...`.")
                return 1
            print(f"{args.file}: up to date.")
            return 0
        if not args.spec:
            parser.error("lock needs spec path(s), or --check to verify an existing lockfile")
        lock = lockfile.build_lock(args.spec)
        lock_path.write_text(_json.dumps(lock, indent=2) + "\n")
        print(f"wrote {args.file} — pinned {len(lock['specs'])} spec(s) "
              f"at price table {lock['price_table_version']}.")
        return 0
    if args.command == "diff":
        from breakerbox import budgetdiff

        msg, increased = budgetdiff.diff_ceiling(args.old, args.new)
        print(msg)
        return 1 if (args.fail_on_increase and increased) else 0
    if args.command == "policy":
        from pathlib import Path

        from breakerbox import graphspec
        from breakerbox import policy as _policy

        if not Path(args.policy).exists():
            print(f"no policy at {args.policy}")
            return 1
        pol = _policy.load_policy(args.policy)
        failed = False
        for sp in args.spec:
            for v in _policy.check_policy(graphspec.load_spec(sp), pol):
                print(f"VIOLATION [{sp}] {v.rule}: {v.message}")
                failed = True
        if failed:
            print("\npolicy check failed.")
            return 1
        print(f"policy OK — {len(args.spec)} spec(s) comply with {args.policy}.")
        return 0
    if args.command == "egress":
        from breakerbox import egress as _egress
        from breakerbox import graphspec

        e = _egress.certify(graphspec.load_spec(args.spec))
        if args.json:
            import json as _json

            print(_json.dumps(e.__dict__))
        else:
            print(_egress.format_certificate(e))
        return 1 if (args.strict and e.unknown_models) else 0
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
