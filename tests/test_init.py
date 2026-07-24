import ast
import json

import pytest

from breakerbox import codegen, graphspec, templates
from breakerbox.cli import main


def test_three_templates_present():
    assert set(templates.names()) == {"research-agent", "support-triage", "batch-extract"}


@pytest.mark.parametrize("name", templates.names())
def test_template_validates_and_generates(name):
    spec = templates.get(name)
    assert spec is not None
    result = graphspec.validate(spec)
    assert result.ok, f"{name} did not validate: {result.errors}"
    code = codegen.generate(spec)
    assert "from breakerbox import guard" in code
    assert "guard(" in code
    ast.parse(code)  # generated code is valid Python


def test_get_returns_fresh_copy():
    a = templates.get("research-agent")
    a["config"]["budget_usd"] = 999
    assert templates.get("research-agent")["config"]["budget_usd"] != 999  # no shared mutation


def test_get_unknown_is_none():
    assert templates.get("nope") is None


def test_init_writes_spec_and_code(tmp_path):
    rc = main(["init", "--template", "research-agent", "--output", str(tmp_path)])
    assert rc == 0
    spec_file = tmp_path / "research-agent.spec.json"
    code_file = tmp_path / "research-agent.py"
    assert spec_file.exists() and code_file.exists()
    assert graphspec.validate(json.loads(spec_file.read_text())).ok
    code = code_file.read_text()
    ast.parse(code)
    assert "from breakerbox import guard" in code


def test_init_custom_name(tmp_path):
    rc = main(["init", "-t", "batch-extract", "-o", str(tmp_path), "--name", "myflow"])
    assert rc == 0
    assert (tmp_path / "myflow.spec.json").exists()
    assert (tmp_path / "myflow.py").exists()


def test_init_list(capsys):
    assert main(["init", "--list"]) == 0
    out = capsys.readouterr().out
    for name in templates.names():
        assert name in out


def test_init_no_template_lists_and_returns_nonzero(capsys):
    assert main(["init"]) == 2
    assert "research-agent" in capsys.readouterr().out


def test_init_unknown_template_errors():
    with pytest.raises(SystemExit):  # argparse parser.error → SystemExit
        main(["init", "--template", "does-not-exist"])
