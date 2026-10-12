"""The optional CPU humour model (mc_agent.humor): its pure parts always; a real score only when its optional
dependencies (`uv sync --group humor`) and MC_HUMOR_MODEL_DIR are present."""

import importlib.util
import subprocess
import sys

import pytest

from mc_agent import humor


def test_off_without_a_model_dir(monkeypatch):
    monkeypatch.delenv("MC_HUMOR_MODEL_DIR", raising=False)
    assert humor.enabled() is False


def test_off_when_the_dir_lacks_the_files(monkeypatch, tmp_path):
    monkeypatch.setenv("MC_HUMOR_MODEL_DIR", str(tmp_path))
    assert humor.enabled() is False


def test_text_keeps_the_last_two_setup_lines_then_the_line():
    assert humor.text_for(" punch ", ["one", " ", "two", "three"]) == "two three punch"
    assert humor.text_for("punch", []) == "punch"


def test_percentile_is_monotone_and_bounded():
    q = humor.QUANTILES
    assert list(q) == sorted(q) and len(q) == 21
    xs = [q[0] - 1, q[0], 0.8, 1.0, 1.5, 2.5, q[-1], q[-1] + 1]
    ps = [humor.percentile(x) for x in xs]
    assert ps == sorted(ps) and ps[0] == 0.0 and ps[-1] == 1.0
    assert humor.percentile(q[10]) == pytest.approx(0.5, abs=0.01)  # the dev median is a typical joke


def test_the_default_path_never_imports_it():
    code = "import sys; import mc_agent.app, mc_agent.judge; print('mc_agent.humor' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=60,
                         env={"MC_WARM": "0", "PATH": ""})
    assert out.stdout.strip() == "False", out.stderr[-400:]


DEPS = all(importlib.util.find_spec(m) for m in ("onnxruntime", "tokenizers", "numpy"))


@pytest.mark.skipif(not DEPS or not humor.enabled(), reason="needs `uv sync --group humor` and MC_HUMOR_MODEL_DIR")
def test_scores_a_line():
    out = humor.score("He didn't say which winter.", ["My landlord said he'd fix the heating by winter."])
    assert 0.0 <= out["score"] <= 1.0 and isinstance(out["raw"], float) and out["ms"] >= 0
