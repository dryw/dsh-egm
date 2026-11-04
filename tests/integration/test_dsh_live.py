"""DSH equivalent of upstream test_codex.py: run, observe, assert.

No custom guards, skill bridge, stage controller, approval records or reports.
Only the two test functions opt into inference. Helpers also support native replay
and retained evidence: `python test_dsh_live.py check <evidence-dir>`.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
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
# Upstream egm-review stages 5 to 9, in order, by the report each one writes.
REPORTS = ("zoom_out_report.md", "comprehension_report.md", "critic_report.md",
           "intermediate_zoom_out_report.md", "implementation_readiness_report.md")
STATUS_LINE = re.compile(r"^\* \*\*Status:\*\*")


class Empty(BaseModel):
    pass


def jsonl(path):
    rows = []
    # Split on LF only: splitlines() also splits U+2028 inside JSON strings.
    for number, line in enumerate(Path(path).read_text(encoding="utf-8").split("\n"), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            raise AssertionError(f"malformed JSONL: {path}:{number}") from None
    return rows


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


def install(root, tarball, profile):
    """Install a tarball into a disposable DSH_HOME, as a user would."""
    home = root / "home"
    binary = RUNTIME / "node_modules/.bin/dsh"
    assert binary.is_file(), "Install tests/integration/runtime dependencies first"
    result = subprocess.run([str(binary), "plugin", "--profile", profile, "add", str(tarball)],
                            cwd=root, env=private_env(home), capture_output=True, text=True, timeout=120)
    (root / "install.log").write_text(result.stdout + result.stderr, encoding="utf-8")
    assert result.returncode == 0, f"Installation failed: {root / 'install.log'}"
    return home, home / "profiles" / profile / "node_modules/dsh-egm"


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
    home, plugin = install(root, tarball, "sdk")
    assert all((plugin / "skills" / name / "SKILL.md").is_file() for name in SKILLS)
    return home, plugin, tarball


def live_provider(model):
    return [{"id": "live-provider",
             "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-llm-deepseek-api-key/lib/index.js"),
             "config": {"apiKeyEnv": "DEEPSEEK_API_KEY", "thinking": "disabled", "reasoningEffort": "off",
                        "models": [{"id": model, "contextWindow": 1048576}],
                        "retryPolicy": {"mode": "normal", "maxRetries": 0}}}]


def profile_rows(root, provider_rows):
    """Session logs, observer and provider rows shared by SDK and terminal runs."""
    return [{"id": "llm-deepseek", "disabled": True},
            {"id": "session-persistence-jsonl", "config": {"root": str(root / "sessions"), "compression": "none"}},
            {"insert": [
                {"id": "agent-preset-registry", "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-agent-preset-registry/lib/index.js"), "config": {"default": "standard"}},
                {"id": "preset-standard", "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-agent-preset/lib/index.js"), "config": {"id": "standard", "plugins": []}},
                {"id": "live-observer", "name": str(HERE / "observer.mjs")}, *provider_rows,
            ]}]


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2), encoding="utf-8")


def write_identity(root, plugin, tarball, model, surface):
    """Record the candidate before any inference so a failed run keeps it."""
    source = os.environ.get("DSH_EGM_SOURCE_SHA")
    if TARBALL or surface == "tui":
        assert source, "Set DSH_EGM_SOURCE_SHA to the commit the tarball was packed from"
        dirty = None
    else:
        source = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO, capture_output=True,
                                text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=REPO, capture_output=True,
                                    text=True, check=True).stdout.strip())
    package = json.loads((Path(plugin) / "package.json").read_text(encoding="utf-8"))
    dsh = json.loads((RUNTIME / "node_modules/@deepseek-ai/dsh/package.json").read_text(encoding="utf-8"))
    lock = json.loads((REPO / "upstream.lock.json").read_text(encoding="utf-8"))
    write_json(root / "identity.json", {
        "package_version": package["version"],
        "tarball_sha256": hashlib.sha256(Path(tarball).read_bytes()).hexdigest(),
        "source_sha": source, "dirty": dirty, "upstream_commit": lock["commit"],
        "dsh_version": dsh["version"], "surface": surface, "model": model,
        "date_utc": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    })


def progress(method, payload, parent, labels, started):
    """One line per reviewer start/finish and per parent file write; visible with pytest -s."""
    line = None
    if method == "session.event" and payload.get("sessionId") == parent:
        event = payload.get("event", {})
        data = event.get("data", {})
        if event.get("type") == "subagent/catalog":
            labels[data.get("childId")] = data.get("label", "reviewer")
            line = f"reviewer started: {labels[data.get('childId')]}"
        elif event.get("type") == "tool/call" and data.get("name") in ("write", "edit"):
            try:
                line = f"{data['name']}: {Path(json.loads(data['arguments'])['file_path']).name}"
            except (KeyError, TypeError, ValueError):
                pass
    elif method == "subagent.finished":
        line = f"reviewer finished ({payload.get('status')}): {labels.get(payload.get('childSessionId'), payload.get('childSessionId'))}"
    if line:
        elapsed = int(time.monotonic() - started)
        print(f"  [{elapsed // 60:02d}:{elapsed % 60:02d}] {line}", flush=True)


def run_dsh(installed, root, content, provider="deepseek-official", model=None, provider_rows=None, workspace=None):
    """One SDK session. Record native evidence and always close the owned client."""
    home, plugin, tarball = installed
    workspace = workspace or root / "workspace"
    workspace.mkdir(exist_ok=True)
    model = model or MODEL
    assert model, "Set DSH_EGM_MODEL to the model you intend to use"
    if provider_rows is None:
        # Replay supplies its own provider; only live tests enter this branch.
        assert os.environ.get("DEEPSEEK_API_KEY"), "Set DEEPSEEK_API_KEY in this terminal"
        write_identity(root, plugin, tarball, model, "sdk-headless")
        provider_rows = live_provider(model)
    config_path = root / "profile.patch.json"
    write_json(config_path, profile_rows(root, provider_rows))
    env = private_env(home)
    env["EGM_TEST_RECORD"] = str(root / "records.jsonl")
    config = HarnessConfig(dsh_bin=str(RUNTIME / "node_modules/.bin/dsh"), dsh_home=str(home), cwd=str(workspace),
                           patches=(str(config_path),), env=env, initialize_timeout_seconds=30,
                           request_timeout_seconds=1200, shutdown_timeout_seconds=3)
    parent = "egm-test-" + uuid.uuid4().hex
    write_json(root / "run.json", {"parent": parent, "workspace": str(workspace), "plugin": str(plugin),
                                   "dsh_home": str(home)})
    notifications = []
    client = HarnessClient(config)
    labels, started = {}, time.monotonic()
    def collect(n):
        notifications.append({"method": n.method, "payload": n.payload})
        progress(n.method, n.payload, parent, labels, started)
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
    run = load_run(root)
    assert parent in run["sessions"], "Missing native parent trace"
    assert complete(run["sessions"][parent]), "Parent failed; inspect native turn/end reason"
    runtime = [row["pid"] for row in run["records"] if row["kind"] == "runtime"]
    assert len(runtime) == 1
    try:
        os.kill(runtime[0], 0)
    except ProcessLookupError:
        pass
    else:
        raise AssertionError("Owned SDK runtime remains after close")
    return run


def load_run(root):
    """Rebuild a run from an evidence directory; parsing only, no process checks."""
    root = Path(root)
    meta = json.loads((root / "run.json").read_text(encoding="utf-8")) if (root / "run.json").is_file() else {}
    sessions = {}
    for path in sorted((root / "sessions").rglob("session.v4.jsonl")):
        trace = jsonl(path)
        assert trace[0]["id"] not in sessions, "Ambiguous native Session"
        sessions[trace[0]["id"]] = trace
    parent = meta.get("parent") or next((key for key, trace in sessions.items()
                                         if trace[0].get("delegationDepth") == 0), None)
    plugin = meta.get("plugin")
    records = root / "records.jsonl"
    notifications = root / "notifications.json"
    return {"root": root, "parent": parent, "sessions": sessions,
            "records": jsonl(records) if records.is_file() else [],
            "notifications": json.loads(notifications.read_text(encoding="utf-8")) if notifications.is_file() else [],
            "workspace": Path(meta.get("workspace") or root / "workspace"),
            "plugin": Path(plugin) if plugin and Path(plugin).is_dir() else None}


def complete(trace):
    ends = [row for row in trace if row.get("type") == "turn/end"]
    return bool(ends) and all(row["data"]["reason"]["kind"] == "completed" for row in ends)


def child_traces(run):
    """Join actual dispatches, host lifecycles and child logs, as upstream does."""
    spawns = [r for r in run["records"] if r["kind"] == "tool" and r["name"] == "egm_reviewer"]
    assert spawns, "No native reviewer dispatch"
    children = set()
    for row in spawns:
        assert row["sessionId"] == run["parent"] and not row["result"]["isError"]
        assert row["result"]["value"]["kind"] == "activation"
        children.add(row["result"]["value"]["subagentId"])
    # Count child Sessions, not parent claims or repeated activations.
    if run["notifications"]:
        for method in ("subagent.started", "subagent.finished"):
            events = [n["payload"] for n in run["notifications"] if n["method"] == method]
            assert {e["childSessionId"] for e in events} == children, "Missing/unattributed native lifecycle"
            if method == "subagent.finished":
                assert all(e["status"] == "ok" and e["stopReason"] == "completed" for e in events)
    else:
        # A terminal UI run has no SDK notifications; use the parent's native catalog.
        catalog = {r["data"]["childId"] for r in run["sessions"].get(run["parent"], [])
                   if r.get("type") == "subagent/catalog"}
        assert catalog == children, "Missing/unattributed native lifecycle"
    result = {}
    for child in children:
        assert child != run["parent"] and child in run["sessions"], "Missing native child trace"
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


def resolve(run, path):
    return os.path.realpath(os.path.join(run["workspace"], path))


def envelope(prompt, key):
    match = re.search(rf"^{key}:[ \t]*(.+?)[ \t]*$", prompt, re.MULTILINE)
    return match.group(1) if match else None


def named_path(prompt, key):
    """An envelope path, or None when the line says none, e.g. "none (BRAINSTORM ...)"."""
    value = envelope(prompt, key)
    return None if value is None or re.match(r"none\b", value, re.IGNORECASE) else value


def row_times(run, kind):
    """Native tool/call or tool/result times by call id, from the parent log."""
    rows = [r for r in run["sessions"].get(run["parent"], []) if r.get("type") == kind]
    if kind == "tool/call":
        return {r["data"]["callId"]: r["time"] for r in rows}
    return {r["data"]["message"]["toolCallId"]: r["time"] for r in rows}


def dispatches(run):
    """Reviewer dispatches with their child id, prompt and native call time."""
    called = row_times(run, "tool/call")
    return [{"child": r["result"]["value"]["subagentId"], "prompt": r["arguments"]["prompt"],
             "time": called[r["callId"]]}
            for r in run["records"] if r["kind"] == "tool" and r["name"] == "egm_reviewer"
            and r["sessionId"] == run["parent"] and not r["result"]["isError"]]


def assert_stage_order(run):
    """Every stage-N reviewer finishes before report N; stages never overlap."""
    finished = row_times(run, "tool/result")
    writes = {name: [] for name in REPORTS}
    for r in run["records"]:
        if r["kind"] == "tool" and r["sessionId"] == run["parent"] and r["name"] in ("write", "edit") \
                and not r["result"]["isError"] and r["callId"] in finished:
            for name in REPORTS:
                if resolve(run, r["arguments"]["file_path"]) == resolve(run, name):
                    writes[name].append(finished[r["callId"]])
    for name in REPORTS:
        assert writes[name], f"missing stage report: {name}"
    first = [min(writes[name]) for name in REPORTS]
    last = [max(writes[name]) for name in REPORTS]
    stages, remediation = {str(n): [] for n in range(5, 10)}, []
    for d in dispatches(run):
        mode = envelope(d["prompt"], "Mode")
        if mode == "BRAINSTORM":
            continue
        assert mode == "REVIEW", "review child without Mode: REVIEW"
        assert d["time"] <= last[-1], "review child dispatched after the last report"
        index = next((i for i in range(5) if (i == 0 or last[i - 1] < d["time"]) and d["time"] <= first[i]), None)
        if index is None:
            # ponytail: between a report's first and last write is remediation;
            # reported, not ordered, until stage labels exist in native records.
            remediation.append(d["child"])
        else:
            stages[str(index + 5)].append(d["child"])
    for index, stage in enumerate(stages):
        assert stages[stage], f"stage {stage} has no reviewer dispatched after report {int(stage) - 1}"
    for index, stage in enumerate(stages):
        for child in stages[stage]:
            ends = [r["time"] for r in run["sessions"][child] if r.get("type") == "turn/end"]
            assert ends and max(ends) <= first[index], f"stage {stage} reviewer finished after its report"
    return stages, remediation


def assert_required_reads(run, stages):
    """Each reviewer reads its persona, target and standard (TESTING.md read rule)."""
    stage_of = {child: stage for stage, children in stages.items() for child in children}
    personas = {}
    for d in dispatches(run):
        persona = envelope(d["prompt"], "Persona")
        assert persona, "missing Persona line"
        assert envelope(d["prompt"], "TargetFile"), "missing TargetFile line"
        target = named_path(d["prompt"], "TargetFile")
        agents = os.path.realpath(run["plugin"] / "agents") if run["plugin"] else None
        persona_path = resolve(run, persona)
        assert (persona_path.startswith(agents + os.sep) if agents
                else f"{os.sep}node_modules{os.sep}dsh-egm{os.sep}agents{os.sep}" in persona_path), \
            f"persona outside the installed package: {persona}"
        stage = stage_of.get(d["child"], "brainstorm" if envelope(d["prompt"], "Mode") == "BRAINSTORM" else "remediation")
        personas.setdefault(stage, []).append(os.path.basename(persona_path))
        required = [persona] + [path for path in (target, named_path(d["prompt"], "TargetStandard")) if path]
        if stage == "8":
            required.append("zoom_out_report.md")
        reads = [r for r in run["records"] if r["kind"] == "tool" and r["sessionId"] == d["child"]
                 and r["name"] == "read" and not r["result"]["isError"]
                 and "".join(b.get("text", "") for b in r["result"].get("content", [])).strip()]
        read_paths = {resolve(run, r["arguments"]["file_path"]) for r in reads}
        for path in required:
            assert resolve(run, path) in read_paths, f"no successful read of {path}"
    return {stage: sorted(names) for stage, names in personas.items()}


def status_only_difference(workspace):
    draft, final = (Path(workspace) / "design_draft.md", Path(workspace) / "docs/designs/line-count.md")
    if not (draft.is_file() and final.is_file()) or draft.read_bytes() == final.read_bytes():
        return False
    strip = lambda path: [l for l in path.read_text(encoding="utf-8").split("\n") if not STATUS_LINE.match(l)]
    return strip(draft) == strip(final)


def run_checks(run, out=None):
    """Run every check, record each result, and write checks.json; never stop early."""
    results, extra = {}, {"stages": {}, "remediation": [], "personas": {}}

    def check(key, function):
        try:
            value = function()
        except AssertionError as error:
            results[key] = f"{key}: {error}" if str(error) else f"{key}: AssertionError"
            return None
        except Exception as error:  # A broken record is a failed check, not a crash.
            results[key] = f"{key}: {type(error).__name__}: {error}"
            return None
        results[key] = "unverifiable" if value == "unverifiable" else "pass"
        return value

    check("reviewers", lambda: assert_upstream_child_count(child_traces(run)))
    order = check("stage_order", lambda: assert_stage_order(run))
    if order:
        extra["stages"], extra["remediation"] = order
    personas = check("required_reads", lambda: assert_required_reads(run, extra["stages"]))
    if personas:
        extra["personas"] = personas
    check("skill_delivery", lambda: "unverifiable" if run["plugin"] is None else assert_skill_delivery(run))
    check("upstream_artifacts", lambda: assert_upstream_artifacts(run["workspace"]))
    summary = {"checks": results,
               "deviations": ["status-line-only"] if status_only_difference(run["workspace"]) else [],
               "remediation": extra["remediation"], "personas": extra["personas"]}
    write_json(out or Path(run["root"]) / "checks.json", summary)
    return summary


def failures(summary):
    return [value for value in summary["checks"].values() if value not in ("pass", "unverifiable")]


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
    summary = run_checks(run)
    assert not failures(summary), f"{failures(summary)}; see {tmp_path / 'checks.json'}"


def profile(directory, tarball, source, model):
    """Prepare a terminal UI run with the same logs, observer and identity record."""
    directory = Path(directory).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "workspace").mkdir(exist_ok=True)
    os.environ["DSH_EGM_SOURCE_SHA"] = source
    home, plugin = install(directory, Path(tarball).resolve(strict=True), "tui")
    patch_path = directory / "profile.patch.json"
    write_json(patch_path, profile_rows(directory, live_provider(model)))
    write_json(directory / "run.json", {"parent": None, "workspace": str(directory / "workspace"),
                                        "plugin": str(plugin), "dsh_home": str(home)})
    write_identity(directory, plugin, tarball, model, "tui")
    print(f"cd {directory / 'workspace'} && EGM_TEST_RECORD={directory / 'records.jsonl'} DSH_HOME={home} "
          f"{RUNTIME / 'node_modules/.bin/dsh'} tui --patch {patch_path}")


def main(argv):
    parser = argparse.ArgumentParser(description="Check retained evidence or prepare a terminal UI run.")
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check")
    check.add_argument("evidence", type=Path)
    check.add_argument("--out", type=Path, help="write checks.json here; use it for retained evidence")
    prep = commands.add_parser("profile")
    prep.add_argument("directory", type=Path)
    prep.add_argument("--tarball", required=True)
    prep.add_argument("--source-sha", required=True)
    prep.add_argument("--model", required=True)
    args = parser.parse_args(argv)
    if args.command == "profile":
        profile(args.directory, args.tarball, args.source_sha, args.model)
        return 0
    summary = run_checks(load_run(args.evidence), args.out)
    print(json.dumps(summary, indent=2))
    return 1 if failures(summary) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
