"""DSH equivalent of upstream test_codex.py: run, observe, assert.

No custom guards, skill bridge, stage controller, approval records or reports.
Only the two test functions opt into inference. Helpers also support native replay.
"""
import json
import os
from pathlib import Path
import subprocess
from unittest.mock import patch
import uuid

import pytest
from deepseek_harness import HarnessClient, HarnessConfig
from pydantic import BaseModel

from upstream_contract import assert_upstream_artifacts, assert_upstream_child_count

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RUNTIME = Path(os.environ.get("EGM_TEST_RUNTIME", str(HERE / "runtime"))).resolve()
MODEL = os.environ.get("DSH_EGM_MODEL")
TARBALL = os.environ.get("DSH_EGM_TARBALL")
LIVE = pytest.mark.skipif(os.environ.get("DSH_EGM_LIVE") != "1", reason="Set DSH_EGM_LIVE=1 for paid tests")
SKILLS = ("egm-brainstorm", "egm-draft", "egm-review")
# Native user gestures activate user-only skills. The upstream prompt stays in
# its own unchanged text block; this is the entire DSH-specific input addition.
INVOCATIONS = "/egm-brainstorm /egm-draft /egm-review"


class Empty(BaseModel):
    pass


def jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").split("\n") if line.strip()]


def private_env(home):
    # SDK environments merge with the caller; replace the process environment
    # too so user profile selection cannot leak into this disposable install.
    keep = ("PATH", "SYSTEMROOT", "LANG", "LC_ALL", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
            "http_proxy", "https_proxy", "all_proxy", "no_proxy", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE",
            "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE", "DEEPSEEK_API_KEY")
    env = {key: os.environ[key] for key in keep if key in os.environ}
    env.update(HOME=str(home), USERPROFILE=str(home), DSH_HOME=str(home),
               XDG_CONFIG_HOME=str(home / "config"), XDG_CACHE_HOME=str(home / "cache"))
    env["PATH"] = str(RUNTIME / "node_modules/.bin") + os.pathsep + env.get("PATH", "")
    return env


@pytest.fixture(scope="module")
def installed_plugin(tmp_path_factory):
    """Install once in a disposable profile, like upstream's plugin fixture."""
    root = tmp_path_factory.mktemp("dsh-live-install")
    if TARBALL:
        tarball = Path(TARBALL).resolve(strict=True)
    else:
        packed = subprocess.run(["npm", "pack", "--json", "--pack-destination", str(root)], cwd=REPO,
                                capture_output=True, text=True, timeout=60, check=True)
        tarball = root / json.loads(packed.stdout)[0]["filename"]
    home = root / "home"
    binary = RUNTIME / "node_modules/.bin/dsh"
    assert binary.is_file(), "Install tests/integration/runtime dependencies first"
    install = subprocess.run([str(binary), "plugin", "--profile", "sdk", "add", str(tarball)],
                             cwd=root, env=private_env(home), capture_output=True, text=True, timeout=120)
    (root / "install.log").write_text(install.stdout + install.stderr, encoding="utf-8")
    assert install.returncode == 0, f"Installation failed: {root / 'install.log'}"
    plugin = home / "profiles/sdk/node_modules/dsh-egm"
    assert all((plugin / "skills" / name / "SKILL.md").is_file() for name in SKILLS)
    return home, plugin


def run_dsh(installed, root, content, provider="deepseek-official", model=None, provider_rows=None, workspace=None):
    """One SDK session. Record native evidence and always close the owned client."""
    home, plugin = installed
    workspace = workspace or root / "workspace"
    workspace.mkdir(exist_ok=True)
    model = model or MODEL
    assert model, "Set DSH_EGM_MODEL to the model you intend to use"
    if provider_rows is None:
        # Replay supplies its own provider; only live tests enter this branch.
        assert os.environ.get("DEEPSEEK_API_KEY"), "Set DEEPSEEK_API_KEY in this terminal"
        provider_rows = [{"id": "live-provider",
                          "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-llm-deepseek-api-key/lib/index.js"),
                          "config": {"apiKeyEnv": "DEEPSEEK_API_KEY", "thinking": "disabled", "reasoningEffort": "off",
                                     "models": [{"id": model, "contextWindow": 1048576}],
                                     "retryPolicy": {"mode": "normal", "maxRetries": 0}}}]
    rows = [{"id": "llm-deepseek", "disabled": True},
            {"id": "session-persistence-jsonl", "config": {"root": str(root / "sessions"), "compression": "none"}},
            {"insert": [
                {"id": "agent-preset-registry", "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js"), "config": {"default": "standard"}},
                {"id": "preset-standard", "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-agent-preset/lib/index.js"), "config": {"id": "standard", "plugins": []}},
                {"id": "live-observer", "name": str(HERE / "observer.mjs")}, *provider_rows,
            ]}]
    config_path = root / "profile.patch.json"
    config_path.write_text(json.dumps(rows), encoding="utf-8")
    env = private_env(home)
    env["EGM_TEST_RECORD"] = str(root / "records.jsonl")
    config = HarnessConfig(dsh_bin=str(RUNTIME / "node_modules/.bin/dsh"), dsh_home=str(home), cwd=str(workspace),
                           patches=(str(config_path),), env=env, initialize_timeout_seconds=30,
                           request_timeout_seconds=1200, shutdown_timeout_seconds=3)
    parent = "egm-test-" + uuid.uuid4().hex
    notifications = []
    client = HarnessClient(config)
    def collect(n):
        notifications.append({"method": n.method, "payload": n.payload})
    (root / "input.json").write_text(json.dumps(content), encoding="utf-8")
    print(f"Native evidence: {root}")
    try:
        with patch.dict(os.environ, env, clear=True):
            client.start()
            client.initialize(cwd=str(workspace), provider=provider, model=model, reasoning_effort="off" if provider == "deepseek-official" else None, max_tokens=32768)
            with client.subscribe_session_notifications(parent) as subscription:
                client.session_prompt(parent, content, notification_subscription=subscription, on_notification=collect)
                client.request("session/wait", {"sessionId": parent}, response_model=Empty,
                               timeout_seconds=1200, notification_subscription=subscription, on_notification=collect)
                subscription.drain(collect)
    finally:
        # Preserve notifications even when prompting or waiting fails.
        try:
            client.close()
        finally:
            (root / "notifications.json").write_text(json.dumps(notifications), encoding="utf-8")
    records = jsonl(root / "records.jsonl")
    sessions = {}
    for path in (root / "sessions").rglob("session.v4.jsonl"):
        trace = jsonl(path)
        assert trace[0]["id"] not in sessions, "Ambiguous native Session"
        sessions[trace[0]["id"]] = trace
    assert parent in sessions, "Missing native parent trace"
    assert complete(sessions[parent]), "Parent failed; inspect native turn/end reason"
    runtime = [row["pid"] for row in records if row["kind"] == "runtime"]
    assert len(runtime) == 1
    try:
        os.kill(runtime[0], 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError("Owned SDK runtime remains after close")
    return {"parent": parent, "records": records, "notifications": notifications,
            "sessions": sessions, "workspace": workspace, "plugin": plugin}


def complete(trace):
    ends = [row for row in trace if row.get("type") == "turn/end"]
    return bool(ends) and all(row["data"]["reason"]["kind"] == "completed" for row in ends)


def child_traces(run):
    """Join actual dispatches, SDK lifecycles and child logs, as upstream does."""
    spawns = [r for r in run["records"] if r["kind"] == "tool" and r["name"] == "egm_reviewer"]
    assert spawns, "No native reviewer dispatch"
    children = set()
    for row in spawns:
        assert row["sessionId"] == run["parent"] and not row["result"]["isError"]
        assert row["result"]["value"]["kind"] == "activation"
        children.add(row["result"]["value"]["subagentId"])
    # Count child Sessions, not parent claims or repeated activations.
    for method in ("subagent.started", "subagent.finished"):
        events = [n["payload"] for n in run["notifications"] if n["method"] == method]
        assert {e["childSessionId"] for e in events} == children, "Missing/unattributed native lifecycle"
        if method == "subagent.finished":
            assert all(e["status"] == "ok" and e["stopReason"] == "completed" for e in events)
    result = {}
    for child in children:
        assert child != run["parent"] and child in run["sessions"]
        trace = run["sessions"][child]
        assert trace[0].get("isSeeded") is False and trace[0].get("delegationDepth") == 1
        assert complete(trace), "Child has no successful native completion"
        assert any(r.get("type") == "subagent/descriptor" and r["data"].get("provider") == "spawn" for r in trace)
        assert any(r["kind"] == "agent" and r["sessionId"] == child and r["preset"] == "egm-reviewer" for r in run["records"])
        assert any(r["kind"] == "request" and r["sessionId"] == child for r in run["records"])
        result[child] = trace
    return result


def assert_skill_delivery(run):
    """Native user invocation must actually deliver the installed skill bodies."""
    requests = [r for r in run["records"] if r["kind"] == "request" and r["sessionId"] == run["parent"]]
    messages = [m for row in requests for m in row["messages"]]
    for name in SKILLS:
        source = (run["plugin"] / "skills" / name / "SKILL.md").read_text(encoding="utf-8")
        # The native skill wrapper adds host notes around this upstream body.
        body = source.split("---", 2)[-1].strip()
        assert any(body in block.get("text", "") for m in messages for block in m.get("content", []))
        assert any(row.get("type") == "user/message" and row.get("data", {}).get("source", {}).get("kind") == "skill-invocation"
                   and row["data"]["source"].get("name") == name for row in run["sessions"][run["parent"]]), "Missing native user skill invocation"


@LIVE
def test_fresh_context_isolation(installed_plugin, tmp_path):
    marker = "parent-only-" + uuid.uuid4().hex
    prompt = (f"Native EGM isolation test. Parent-only marker: {marker}\n"
              "Do not write or repeat this marker or pass it to another agent. Use egm_reviewer once with this exact task: "
              "'Do not use tools. If a parent-only marker is visible in your conversation, return it verbatim. "
              "Otherwise return exactly UNKNOWN.' Wait for completion. Do not simulate the response or use memory/external services.")
    run = run_dsh(installed_plugin, tmp_path, [{"type": "text", "text": prompt}])
    parent_requests = [r for r in run["records"] if r["kind"] == "request" and r["sessionId"] == run["parent"]]
    assert parent_requests and marker in json.dumps(parent_requests)
    children = child_traces(run)
    assert len(children) == 1
    child, trace = next(iter(children.items()))
    requests = [r for r in run["records"] if r["kind"] == "request" and r["sessionId"] == child]
    assert marker not in json.dumps(requests) and marker not in json.dumps(trace)
    answers = [r["data"]["message"] for r in trace if r.get("type") == "assistant/message"]
    assert "".join(b.get("text", "") for b in answers[-1]["content"] if b["type"] == "text").strip() == "UNKNOWN"


@LIVE
def test_brainstorm_draft_review(installed_plugin, tmp_path):
    prompt = (HERE / "fixtures/live-prompts/google-codex-line-count-v1.txt").read_bytes().decode("utf-8")
    run = run_dsh(installed_plugin, tmp_path, [{"type": "text", "text": INVOCATIONS}, {"type": "text", "text": prompt}])
    assert_skill_delivery(run)
    assert_upstream_artifacts(run["workspace"])
    assert_upstream_child_count(child_traces(run))
