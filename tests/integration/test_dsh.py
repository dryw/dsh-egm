"""Scripted real-host checks, not live model instruction-following tests."""

from copy import deepcopy
from dataclasses import replace
import json
import shutil
from pathlib import Path
import uuid

import pytest


def assert_successful_children(phase, expected_roles):
    spawns = [r for r in phase.records if r["kind"] == "tool" and r["name"] == "egm_reviewer"]
    assert len(spawns) == len(expected_roles), f"Missing/extra activations: {phase.evidence}"
    assert {r["arguments"]["description"] for r in spawns} == set(expected_roles)
    starts = [n["payload"] for n in phase.notifications if n["method"] == "subagent.started"]
    ends = [n["payload"] for n in phase.notifications if n["method"] == "subagent.finished"]
    assert len(starts) == len(ends) == len(spawns), "Missing/duplicate child lifecycle evidence"
    children = {}
    for spawn in spawns:
        result = spawn["result"]
        assert not result["isError"] and result["value"]["kind"] == "activation"
        child = result["value"]["subagentId"]
        assert child not in children.values()
        assert sum(n["childSessionId"] == child for n in starts) == 1
        terminal = [n for n in ends if n["childSessionId"] == child]
        assert len(terminal) == 1
        assert terminal[0]["status"] == "ok" and terminal[0]["stopReason"] == "completed"
        children[spawn["arguments"]["description"]] = child
    events = [n["payload"]["event"] for n in phase.notifications if n["method"] == "session.event"]
    assert not any(e["type"] == "compaction/start" for e in events)
    terminals = [e for e in events if e["type"] == "turn/end"]
    assert terminals and all(e["data"]["reason"]["kind"] == "completed" for e in terminals)
    return children


def assert_read(record, path, offset=1, limit=2000):
    assert record["name"] == "read" and not record["result"]["isError"]
    expected = {"file_path": str(path), "offset": offset, "limit": limit}
    assert record["arguments"] == expected
    meta = record["result"]["meta"]
    source = path.read_text().splitlines()
    assert Path(meta["path"]).resolve() == path.resolve()
    assert meta["offset"] == offset and meta["totalLines"] == len(source)
    window = source[offset - 1:offset - 1 + limit]
    assert window
    assert meta["lines"] == [
        {"number": i, "text": line} for i, line in enumerate(window, offset)
    ]
    if offset == 1 and limit == 2000:
        assert len(source) <= limit, "Required full file needs continuation reads"


def assert_isolated_inputs(phase, child, private, authorized):
    parent_requests = [r for r in phase.records if r["kind"] == "request" and r["sessionId"] == phase.session_id]
    child_requests = [r for r in phase.records if r["kind"] == "request" and r["sessionId"] == child]
    assert parent_requests and private in json.dumps(parent_requests)
    assert child_requests, "Missing actual child model inputs"
    for request in child_requests:
        serialized = json.dumps(request)
        assert private not in serialized, "Parent-only marker leaked to child input"
        assert authorized in serialized, "Authorized context missing from child input"
        assert {tool["name"] for tool in request["tools"]} == {"read", "read_image", "glob", "grep"}
    presets = [r for r in phase.records if r["kind"] == "agent" and r["sessionId"] == child]
    assert len(presets) == 1 and presets[0]["preset"] == "egm-reviewer"


def test_isolation(replay_run):
    run = replay_run()
    private = "PARENT_PRIVATE_" + uuid.uuid4().hex
    authorized = "CHILD_AUTHORIZED_" + uuid.uuid4().hex
    baseline, mutation = b"BASELINE\n", b"CHILD_MUTATION\n"
    write_sentinel = run.workspace / "write-sentinel.txt"
    command_sentinel = run.workspace / "command-sentinel.txt"
    for path in (write_sentinel, command_sentinel):
        path.write_bytes(baseline)
    read_args = {"file_path": str(write_sentinel), "offset": 1, "limit": 2000}
    write_args = {"file_path": str(write_sentinel), "content": mutation.decode()}
    bash_args = {
        "description": "Write the disposable command sentinel",
        "command": "printf 'CHILD_MUTATION\\n' > command-sentinel.txt",
        "workdir": str(run.workspace), "timeoutMs": 1000, "run_in_background": False,
    }

    # Positive controls rule out bad payloads, unwritable targets and shell errors.
    controls = run.phase(
        "controls", run.override("isolation.override.json", "controls"),
        "/egm-brainstorm\nSynthetic control approval: read and mutate the two disposable sentinels.",
    )
    assert_successful_children(controls, [])
    tools = [r for r in controls.records if r["kind"] == "tool"]
    assert [r["name"] for r in tools] == ["read", "write", "bash"]
    for record, arguments in zip(tools, (read_args, write_args, bash_args)):
        assert record["sessionId"] == run.session_id and not record["result"]["isError"]
        assert record["arguments"] == arguments
    write_value = tools[1]["result"]["value"]
    assert Path(write_value["path"]).resolve() == write_sentinel.resolve()
    assert write_value["operation"] == "update"
    assert write_value["before"] == baseline.decode() and write_value["after"] == mutation.decode()
    bash_value = tools[2]["result"]["value"]
    assert bash_value["kind"] == "foreground" and bash_value["exitCode"] == 0
    assert bash_value["signal"] is None and not bash_value["timedOut"] and not bash_value["aborted"]
    assert write_sentinel.read_bytes() == command_sentinel.read_bytes() == mutation

    for path in (write_sentinel, command_sentinel):
        path.write_bytes(baseline)
        assert path.read_bytes() == baseline
    # Reset restores the same bytes that the control's earlier read observed.
    assert_read(tools[0], write_sentinel)

    role = "isolation-readonly"
    persona = (run.plugin / "agents/design_critic.md").read_text().split("---", 2)[-1].strip()
    prompt = "Mode: BRAINSTORM\nAuthorized context: " + authorized + "\n"
    prompt += "\n".join(
        marker + "=" + json.dumps(arguments) for marker, arguments in (
            ("EGM_SENTINEL_READ_JSON", read_args),
            ("EGM_WRITE_JSON", write_args), ("EGM_BASH_JSON", bash_args),
        )
    ) + "\n" + persona
    reviewer = {"description": role, "prompt": prompt}
    phase = run.phase(
        "isolation", run.override("isolation.override.json", "isolation"),
        "/egm-brainstorm\nParent-only marker: " + private + "\nEGM_REVIEWER_JSON=" + json.dumps(reviewer),
        children=["readonly-child.session.jsonl"],
    )
    children = assert_successful_children(phase, [role])
    child = children[role]
    assert_isolated_inputs(phase, child, private, authorized)
    child_tools = [r for r in phase.records if r["kind"] == "tool" and r["sessionId"] == child]
    assert [r["name"] for r in child_tools] == ["read", "write", "bash"]
    assert_read(child_tools[0], write_sentinel)
    for record, arguments in zip(child_tools[1:], (write_args, bash_args)):
        assert record["arguments"] == arguments, "Denied payload differs from its positive control"
        result = record["result"]
        assert result["isError"] is True
        expected = ('EGM Goldfish reviewers are read-only: the "' + record["name"]
                    + '" tool is not available in this reviewer context.')
        assert result["error"]["message"] == expected, "Rejection did not originate in the reviewer guard"
    all_tools = [r for r in phase.records if r["kind"] == "tool"]
    assert len(all_tools) == 4  # One activation and the child's three calls.
    denied = [r for r in all_tools if r["result"]["isError"]]
    assert len(denied) == 2 and all(r["sessionId"] == child for r in denied)
    assert write_sentinel.read_bytes() == command_sentinel.read_bytes() == baseline
    actual_parent = [r for r in phase.records if r["kind"] == "request" and r["sessionId"] == run.session_id]
    assert "<dsh_integration>" in json.dumps(actual_parent)

    # A small synthetic negative control proves the marker assertion rejects
    # contaminated input without adding another real-host/fault scenario.
    contaminated = deepcopy(phase.records)
    child_request = next(r for r in contaminated if r["kind"] == "request" and r["sessionId"] == child)
    child_request["messages"].append({"role": "user", "content": [{"type": "text", "text": private}]})
    with pytest.raises(AssertionError, match="Parent-only marker leaked"):
        assert_isolated_inputs(replace(phase, records=contaminated), child, private, authorized)


WORKFLOW_PHASES = (
    "brainstorm", "brief", "draft", "stage5", "stage5-report", "stage6", "stage6-report",
    "stage7", "stage7-report", "stage8", "stage8-report", "stage9", "stage9-report", "finalize",
)
FEATURE = (
    "Design an in-memory low-stock alert check for the existing Inventory. A call examines "
    "Inventory.low_stock(threshold=5), emits one notification per SKU while stock remains at or "
    "below the threshold, and re-arms that SKU only after stock rises above the threshold. "
    "Notifications use an injected callback. Exclude background polling, network delivery and "
    "cross-process persistence. Produce design artifacts only; do not implement the feature."
)


def assert_workflow_phase(phase, roles=()):
    children = assert_successful_children(phase, roles)
    assert all(not r["result"]["isError"] for r in phase.records if r["kind"] == "tool")
    requests = [r for r in phase.records if r["kind"] == "request" and r["sessionId"] == phase.session_id]
    assert requests and "<dsh_integration>" in json.dumps(requests), "Missing installed skill adaptation"
    return children


def assert_artifact(phase, path, minimum):
    writes = [r for r in phase.records if r["kind"] == "tool" and r["name"] == "write"]
    assert len(writes) == 1, "Missing artifact write evidence"
    write = writes[0]
    assert write["sessionId"] == phase.session_id and not write["result"]["isError"]
    assert Path(write["arguments"]["file_path"]).resolve() == path.resolve()
    assert Path(write["result"]["value"]["path"]).resolve() == path.resolve()
    assert path.is_file(), "Missing artifact file"
    content = path.read_text()
    assert write["arguments"]["content"] == write["result"]["value"]["after"] == content
    assert len("".join(content.split())) > minimum, "Artifact is too small"
    return content


def test_workflow(replay_run):
    # The real inventory sample supplies inputs; no recorded output is copied.
    run = replay_run(budget=600)
    repo = Path(__file__).resolve().parents[2]
    shutil.copytree(repo / "examples/e2e-verification/fixture", run.workspace,
                    dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", ".pytest_cache"))
    artifacts = run.workspace / ".dev/docs"
    artifacts.mkdir(parents=True)
    (run.workspace / "docs/designs").mkdir(parents=True)
    task = artifacts / "task.md"
    task.write_text(FEATURE + "\n")
    baseline = {str(p.relative_to(run.workspace)): p.read_bytes()
                for p in run.workspace.rglob("*") if p.is_file()}
    draft = artifacts / "design_draft.md"
    source = run.workspace / "src/inventory.py"
    standards = run.plugin / "resources/document_standards"
    completed_roles = []
    reports = []
    fixture = json.loads((Path(__file__).parent / "fixtures/workflow.override.json").read_text())
    assert tuple(fixture) == WORKFLOW_PHASES, "Unexpected workflow fixture phases"

    def invoke(name, skill, markers=(), children=()):
        assert name == WORKFLOW_PHASES[len(run.phases)], "Workflow phase order changed"
        prompt = "/" + skill + "\nSynthetic fixture approvals granted. " + FEATURE
        prompt += "\nRun " + name + " only.\n" + "\n".join(markers)
        return run.phase(name, run.override("workflow.override.json", name), prompt, children=children)

    def group(stage, skill, roles, target, slots):
        parent_paths = [run.plugin / f"skills/{skill}/SKILL.md", target]
        parent_paths += [run.plugin / f"agents/{role}.md" for role in roles]
        markers = [f"EGM_PARENT_READ_{i}_JSON=" + json.dumps(
            {"file_path": str(path), "offset": 1, "limit": 2000})
            for i, path in enumerate(parent_paths, 1)]
        expected = {}
        prompts = {}
        for i, role in enumerate(roles, 1):
            label = stage + "-" + role
            window = (1, 2000)
            if stage in ("stage7", "stage9"):
                lines = draft.read_text().splitlines()
                assert lines.count("## Detailed Implementation Plan") == 1
                split = lines.index("## Detailed Implementation Plan") + 1
                window = (1, split - 1) if stage == "stage7" else (split, len(lines) - split + 1)
            reads = [(path, *(window if path == target else (1, 2000))) for path in slots(role)]
            assert len(reads) == 4
            expected[label] = reads
            persona = (run.plugin / f"agents/{role}.md").read_text().split("---", 2)[-1].strip()
            prompt = "Mode: " + ("BRAINSTORM" if stage == "brainstorm" else "REVIEW")
            prompt += "\nEGM_ROLE=" + label + "\n" + "\n".join(
                f"EGM_READ_{j}_JSON=" + json.dumps({"file_path": str(path), "offset": offset, "limit": limit})
                for j, (path, offset, limit) in enumerate(reads, 1)
            ) + "\n" + persona
            prompts[label] = prompt
            markers.append(f"EGM_REVIEWER_{i}_JSON=" + json.dumps({"description": label, "prompt": prompt}))
        phase = invoke(stage, skill, markers, ["child.session.jsonl"] * len(roles))
        children = assert_workflow_phase(phase, list(expected))
        tools = [r for r in phase.records if r["kind"] == "tool"]
        assert len(tools) == len(parent_paths) + 5 * len(roles)
        for i, path in enumerate(parent_paths, 1):
            reads = [r for r in tools if r["sessionId"] == run.session_id
                     and r["callId"] == f"{stage}-parent-read-{i}"]
            assert len(reads) == 1
            assert_read(reads[0], path)
        for role, child in children.items():
            child_tools = [r for r in tools if r["sessionId"] == child]
            assert len(child_tools) == 4
            for i, (path, offset, limit) in enumerate(expected[role], 1):
                reads = [r for r in child_tools if r["callId"] == f"read-{i}"]
                assert len(reads) == 1
                assert_read(reads[0], path, offset, limit)
            requests = [r for r in phase.records if r["kind"] == "request" and r["sessionId"] == child]
            assert requests, "Missing actual reviewer inputs"
            presets = [r for r in phase.records if r["kind"] == "agent" and r["sessionId"] == child]
            assert len(presets) == 1 and presets[0]["preset"] == "egm-reviewer"
            for request in requests:
                texts = [b.get("text", "") for m in request["messages"] for b in m.get("content", [])
                         if b.get("type") == "text"]
                assert prompts[role] in texts, "Reviewer received a different role/context prompt"
                assert {t["name"] for t in request["tools"]} == {"read", "read_image", "glob", "grep"}
                if stage == "stage6":
                    forbidden = [source, *standards.glob("*.md"), artifacts / "zoom_out_report.md"]
                    actual = "\n".join(texts)
                    for path in forbidden:
                        assert str(path) not in actual, "Stage6 received supplemental context"
                        assert path.read_text() not in actual, "Stage6 received supplemental file contents"
            completed_roles.append(role)
        if stage == "brainstorm":
            starts = [i for i, n in enumerate(phase.notifications) if n["method"] == "subagent.started"]
            ends = [i for i, n in enumerate(phase.notifications) if n["method"] == "subagent.finished"]
            assert max(starts) < min(ends), "Six brainstorm reviewers did not overlap"
        outcomes = [n["payload"] for n in phase.notifications if n["method"] == "subagent.finished"]
        acknowledgments = []
        for outcome in outcomes:
            role = next(role for role, child in children.items() if child == outcome["childSessionId"])
            message = outcome["lastAssistantMessage"]
            assert message == [{"type": "text", "text": "REVIEW_OK " + role}]
            acknowledgments.append(message[0]["text"])
        return phase, acknowledgments

    def writer(name, skill, path, minimum, acknowledgments=(), read_paths=()):
        assert not path.exists(), "Artifact was pre-created"
        phase = invoke(name, skill)
        assert_workflow_phase(phase)
        content = assert_artifact(phase, path, minimum)
        assert all(ack in content for ack in acknowledgments)
        tools = [r for r in phase.records if r["kind"] == "tool"]
        assert len(tools) == len(read_paths) + 1
        for i, expected in enumerate(read_paths, 1):
            reads = [r for r in tools if r["callId"] == f"{name}-read-{i}"]
            assert len(reads) == 1 and reads[0]["sessionId"] == run.session_id
            assert_read(reads[0], expected)
        return phase

    roles = ("design_critic", "codebase_details", "zoom_out", "comprehension",
             "implementation_readiness", "structural")
    brainstorm, acknowledgments = group("brainstorm", "egm-brainstorm", roles, task,
        lambda r: [run.plugin / f"agents/{r}.md", task, source, run.workspace / "README.md"])
    writer("brief", "egm-brainstorm", artifacts / "concepts_brief.md", 200, acknowledgments)
    writer("draft", "egm-draft", draft, 200,
           read_paths=[artifacts / "concepts_brief.md", run.plugin / "skills/egm-draft/references/design_doc.md"])
    assert draft.read_text().splitlines().count("## Detailed Implementation Plan") == 1

    # Fixed upstream-shaped stages, not a configurable workflow scheduler.
    stages = (
        ("stage5", ("zoom_out",), "zoom_out_report.md",
         lambda r: [run.plugin / f"agents/{r}.md", draft, standards / "zoom-out-standard.md", source]),
        ("stage6", ("comprehension",), "comprehension_report.md",
         lambda r: [run.plugin / f"agents/{r}.md", draft, draft, draft]),
        ("stage7", ("design_critic", "structural", "style"), "critic_report.md",
         lambda r: [run.plugin / f"agents/{r}.md", draft,
                    standards / "feature-spec-standard.md" if r != "style" else draft,
                    source if r == "design_critic" else draft]),
        ("stage8", ("zoom_out",), "intermediate_zoom_out_report.md",
         lambda r: [run.plugin / f"agents/{r}.md", draft, standards / "zoom-out-standard.md",
                    artifacts / "zoom_out_report.md"]),
        ("stage9", ("implementation_readiness", "codebase_details", "style"), "implementation_readiness_report.md",
         lambda r: [run.plugin / f"agents/{r}.md", draft,
                    standards / "implementation-readiness-standard.md" if r != "style" else draft,
                    source if r != "style" else draft]),
    )
    for stage, roles, filename, slots in stages:
        assert draft.is_file() and all(p.is_file() for p in reports)
        phase, acknowledgments = group(stage, "egm-review", roles, draft, slots)
        report = artifacts / filename
        writer(stage + "-report", "egm-review", report, 100, acknowledgments)
        reports.append(report)

    final = run.workspace / "docs/designs/low-stock-alerts.md"
    assert not final.exists()
    phase = invoke("finalize", "egm-draft")
    assert_workflow_phase(phase)
    tools = [r for r in phase.records if r["kind"] == "tool"]
    assert len(tools) == 1 and tools[0]["name"] == "bash" and tools[0]["sessionId"] == run.session_id
    assert tools[0]["arguments"] == {
        "description": "Copy the reviewed synthetic design",
        "command": "cp -- .dev/docs/design_draft.md docs/designs/low-stock-alerts.md",
        "workdir": str(run.workspace), "timeoutMs": 1000, "run_in_background": False,
    }
    value = tools[0]["result"]["value"]
    assert value["kind"] == "foreground" and value["exitCode"] == 0
    assert value["signal"] is None and not value["timedOut"] and not value["aborted"]
    assert final.is_file() and final.read_bytes() == draft.read_bytes()
    assert len("".join(final.read_text().split())) > 200
    assert [p.name for p in run.phases] == list(WORKFLOW_PHASES)
    assert all(p.session_id == run.session_id for p in run.phases)
    assert len(completed_roles) == len(set(completed_roles)) == 15
    for name, original in baseline.items():
        assert (run.workspace / name).read_bytes() == original, "Input/source/test file changed: " + name
    expected_new = {".dev/docs/concepts_brief.md", ".dev/docs/design_draft.md",
                    "docs/designs/low-stock-alerts.md"} | {str(p.relative_to(run.workspace)) for p in reports}
    actual_new = {str(p.relative_to(run.workspace)) for p in run.workspace.rglob("*") if p.is_file()} - set(baseline)
    assert actual_new == expected_new and len(actual_new) == 8

    # Small evidence-omission controls; no extra host/fault scenarios.
    missing_finish = [n for n in brainstorm.notifications if n["method"] != "subagent.finished"]
    with pytest.raises(AssertionError, match="Missing/duplicate child lifecycle evidence"):
        assert_successful_children(replace(brainstorm, notifications=missing_finish),
                                   ["brainstorm-" + r for r in (
                                       "design_critic", "codebase_details", "zoom_out", "comprehension",
                                       "implementation_readiness", "structural")])
    brief = run.phases[1]
    missing_write = [r for r in brief.records if not (r["kind"] == "tool" and r["name"] == "write")]
    with pytest.raises(AssertionError, match="Missing artifact write evidence"):
        assert_artifact(replace(brief, records=missing_write), artifacts / "concepts_brief.md", 200)
    (run.root / "workflow-summary.json").write_text(json.dumps({
        "phases": list(WORKFLOW_PHASES), "reviewers": completed_roles,
        "outputs": sorted(actual_new), "baseline_unchanged": True,
    }, indent=2) + "\n")
