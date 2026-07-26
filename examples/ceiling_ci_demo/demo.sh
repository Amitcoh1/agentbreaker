#!/usr/bin/env bash
# Prove-it-before-you-run demo — no API keys, no agent runs. Needs `pip install breakerbox`.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1. Prove the maximum, statically (zero API calls) =="
breakerbox ceiling pipeline.spec.json
echo

echo "== 2. A max_tokens bump raises the ceiling — caught at the PR =="
breakerbox diff pipeline.spec.json pipeline_v2.spec.json --fail-on-increase || echo "(exit 1 — PR would be red)"
