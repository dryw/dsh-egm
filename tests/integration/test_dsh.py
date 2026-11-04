"""One keyless adapter scenario; replay supplies responses, not EGM decisions."""
import json
from pathlib import Path
import subprocess
import tarfile
import uuid

from test_dsh_live import RUNTIME, INVOCATIONS, run_dsh, child_traces, assert_skill_delivery
from test_live_checks import replay

FIXTURES = Path(__file__).parent / "fixtures"


def test_install(installed_plugin):
    """Every packed file reaches the installed layout unchanged, like upstream's ZIP check."""
    _, plugin, tarball = installed_plugin
    with tarfile.open(tarball) as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            relative = member.name.removeprefix("package/")
            installed = plugin / relative
            assert installed.is_file(), f"Packed file missing from installation: {relative}"
            assert installed.read_bytes() == archive.extractfile(member).read(), f"Installed file differs: {relative}"


def test_adapter(installed_plugin, tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    sentinels = [workspace / name for name in ("write-sentinel.txt", "command-sentinel.txt")]
    baseline, mutation = b"BASELINE\n", b"CHILD_MUTATION\n"
    for path in sentinels:
        path.write_bytes(baseline)
    # Upstream asks hosts to show what instruction files reach a fresh reviewer.
    probe = "EGM instruction-file probe: " + uuid.uuid4().hex
    (workspace / "AGENTS.md").write_text(probe + "\n", encoding="utf-8")
    entries = json.loads((FIXTURES / "isolation.override.json").read_text().replace("__WORKSPACE__", str(workspace)))
    seed = FIXTURES / "readonly-child.session.jsonl"
    # Validate the native-writer seed with DSH itself, not a fabricated event parser.
    parser = (RUNTIME / "node_modules/@deepseek-ai/dsh-llm-replay/lib/index.js").as_uri()
    subprocess.run(["node", "--input-type=module", "-e",
        "import {readFileSync} from 'node:fs'; const m=await import(process.argv[1]);"
        "if(m.deriveReplayScript(m.parseSessionLog(readFileSync(process.argv[2],'utf8'))).length!==4) throw Error('Invalid seed');",
        parser, str(seed)], check=True, timeout=30)

    def run(name, script, prompt, children=()):
        root = tmp_path / name
        root.mkdir()
        return run_dsh(installed_plugin, root, [{"type": "text", "text": prompt}],
                       provider="egm-replay", model="fixed", provider_rows=replay(root, script, children),
                       workspace=workspace)

    # Prove the same operations work in the parent before testing child denials.
    control = run("controls", entries["controls"], INVOCATIONS)
    assert_skill_delivery(control)
    tools = [r for r in control["records"] if r["kind"] == "tool"]
    assert [r["name"] for r in tools] == ["read", "write", "bash"]
    assert all(r["sessionId"] == control["parent"] and not r["result"]["isError"] for r in tools)
    assert tools[2]["result"]["value"]["exitCode"] == 0
    assert all(path.read_bytes() == mutation for path in sentinels)
    read_args, write_args, bash_args = [r["arguments"] for r in tools]
    for path in sentinels:
        path.write_bytes(baseline)

    private, authorized = uuid.uuid4().hex, uuid.uuid4().hex
    prompt = f"Mode: BRAINSTORM\nAuthorized context: {authorized}\n"
    prompt += "\n".join(key + "=" + json.dumps(value) for key, value in (
        ("EGM_SENTINEL_READ_JSON", read_args), ("EGM_WRITE_JSON", write_args), ("EGM_BASH_JSON", bash_args)))
    reviewer = {"description": "isolation-readonly", "prompt": prompt}
    run_result = run("reviewer", entries["isolation"],
                     f"Parent-only marker: {private}\nEGM_REVIEWER_JSON=" + json.dumps(reviewer), [seed])
    children = child_traces(run_result)
    assert len(children) == 1
    child, trace = next(iter(children.items()))
    requests = [r for r in run_result["records"] if r["kind"] == "request"]
    assert private in json.dumps([r for r in requests if r["sessionId"] == run_result["parent"]])
    child_requests = [r for r in requests if r["sessionId"] == child]
    assert private not in json.dumps(child_requests) and private not in json.dumps(trace)
    for request in child_requests:
        assert authorized in json.dumps(request)
        assert {t["name"] for t in request["tools"]} == {"read", "read_image", "glob", "grep"}

    # Exact payload/error checks rule out denial caused by a bad request or path.
    child_tools = [r for r in run_result["records"] if r["kind"] == "tool" and r["sessionId"] == child]
    assert [r["name"] for r in child_tools] == ["read", "write", "bash"]
    assert [r["arguments"] for r in child_tools] == [read_args, write_args, bash_args]
    read = child_tools[0]["result"]
    assert not read["isError"]
    assert read["meta"]["lines"] == [{"number": 1, "text": "BASELINE"}]
    for record in child_tools[1:]:
        result = record["result"]
        assert result["isError"]
        assert result["error"]["message"] == (
            'EGM Goldfish reviewers are read-only: the "' + record["name"]
            + '" tool is not available in this reviewer context.')
    assert all(path.read_bytes() == baseline for path in sentinels)

    # The parent's scripted follow-up to the reviewer is refused, so the child keeps one turn.
    reuse = [r for r in run_result["records"] if r["kind"] == "tool" and r["name"] == "send_message"]
    assert len(reuse) == 1 and reuse[0]["sessionId"] == run_result["parent"]
    assert reuse[0]["result"]["isError"]
    assert reuse[0]["result"]["error"]["message"] == (
        "EGM Goldfish reviewers are single-use: do not message or resume a reviewer. "
        "Start a fresh egm_reviewer with the full prompt instead.")
    assert len([r for r in trace if r.get("type") == "turn/end"]) == 1

    seen = lambda run, session: probe in json.dumps(
        [r for r in run["records"] if r["kind"] == "request" and r["sessionId"] == session])
    parent_seen = seen(control, control["parent"]) or seen(run_result, run_result["parent"])
    context = {"parent": "seen" if parent_seen else "absent",
               "child": ("seen" if seen(run_result, child) else "absent") if parent_seen else "inconclusive"}
    (tmp_path / "controls" / "host-context.json").write_text(json.dumps(context), encoding="utf-8")
    print(f"Host-injected AGENTS.md: {context}")
