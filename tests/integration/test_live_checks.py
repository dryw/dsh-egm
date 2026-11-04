"""Keyless checks for the small live harness; never selects a real provider."""
import copy
import json

import pytest

from test_dsh_live import (RUNTIME, REPORTS, assert_required_reads, assert_stage_order,
                           child_traces, jsonl)


def response(text):
    # Native replay consumes the same block stream as a model provider.
    return {"kind": "chunks", "chunks": [{"type": "block-start", "index": 0, "blockType": "text"},
            {"type": "text-delta", "index": 0, "text": text},
            {"type": "block-end", "index": 0, "block": {"type": "text", "text": text}},
            {"type": "finish", "reason": {"kind": "stop"}}]}


def replay(root, entries, children=()):
    path = root / "replay.json"
    path.write_text(json.dumps(entries), encoding="utf-8")
    return [{"id": "keyless-provider", "name": str(RUNTIME / "node_modules/@deepseek-ai/dsh-llm-replay/lib/index.js"),
             "config": {"file": str(path), "overrideFile": str(path), "childFiles": [str(p) for p in children],
                        "providers": [{"id": "egm-replay", "models": [{"id": "fixed", "contextWindow": 1048576}]}]}}]


PERSONA = "/pkg/node_modules/dsh-egm/agents/zoom_out.md"


def synthetic_run(tmp_path):
    """Smallest native-shaped run that passes: one reviewer per stage, in order."""
    run = {"root": tmp_path, "parent": "P", "workspace": tmp_path, "plugin": None,
           "records": [], "notifications": [], "sessions": {"P": [{"type": "session", "id": "P", "delegationDepth": 0}]}}
    clock = 0

    def tool(session, call, name, arguments, result, start, end):
        run["records"].append({"kind": "tool", "sessionId": session, "callId": call, "name": name,
                               "arguments": arguments, "result": result})
        if session == "P":
            run["sessions"]["P"] += [{"type": "tool/call", "time": start, "data": {"callId": call, "name": name}},
                                     {"type": "tool/result", "time": end, "data": {"message": {"toolCallId": call}}}]

    def read(child, path, text="text"):
        tool(child, child + path, "read", {"file_path": path},
             {"isError": False, "content": [{"type": "text", "text": text}]}, 0, 0)

    for stage, report in enumerate(REPORTS, 5):
        child = f"C{stage}"
        prompt = f"Persona: {PERSONA}\nMode: REVIEW\nTargetFile: design_draft.md\nTargetStandard: none\n"
        tool("P", f"spawn{stage}", "egm_reviewer", {"prompt": prompt},
             {"isError": False, "value": {"kind": "activation", "subagentId": child}}, clock, clock)
        run["sessions"][child] = [{"type": "session", "id": child, "isSeeded": False, "delegationDepth": 1},
                                  {"type": "subagent/descriptor", "data": {"provider": "spawn"}},
                                  {"type": "turn/end", "time": clock + 1, "data": {"reason": {"kind": "completed"}}}]
        run["sessions"]["P"].append({"type": "subagent/catalog", "data": {"childId": child}})
        run["records"] += [{"kind": "agent", "sessionId": child, "preset": "egm-reviewer"},
                           {"kind": "request", "sessionId": child}]
        run["notifications"] += [{"method": "subagent.started", "payload": {"childSessionId": child}},
                                 {"method": "subagent.finished",
                                  "payload": {"childSessionId": child, "status": "ok", "stopReason": "completed"}}]
        read(child, PERSONA)
        read(child, "design_draft.md")
        if stage == 8:
            read(child, "zoom_out_report.md")
        tool("P", f"write{stage}", "write", {"file_path": report}, {"isError": False}, clock + 2, clock + 2)
        clock += 10
    return run


def checks(run):
    stages, remediation = assert_stage_order(run)
    assert_required_reads(run, stages)
    return stages, remediation


def test_synthetic_run_passes(tmp_path):
    run = synthetic_run(tmp_path)
    assert len(child_traces(run)) == 5
    stages, remediation = checks(run)
    assert {stage: len(children) for stage, children in stages.items()} == dict.fromkeys("56789", 1)
    assert remediation == []


@pytest.mark.parametrize("method", ["subagent.started", "subagent.finished"])
def test_missing_lifecycle_event_fails(tmp_path, method):
    run = synthetic_run(tmp_path)
    run["notifications"] = [n for n in run["notifications"]
                            if not (n["method"] == method and n["payload"]["childSessionId"] == "C7")]
    with pytest.raises(AssertionError, match="Missing/unattributed native lifecycle"):
        child_traces(run)


def test_terminal_run_needs_native_completion(tmp_path):
    run = synthetic_run(tmp_path)
    run["notifications"] = []
    assert len(child_traces(run)) == 5
    run["sessions"]["C6"] = [r for r in run["sessions"]["C6"] if r["type"] != "turn/end"]
    with pytest.raises(AssertionError, match="Child has no successful native completion"):
        child_traces(run)


def test_next_stage_before_report_fails(tmp_path):
    run = synthetic_run(tmp_path)
    call = next(r for r in run["sessions"]["P"] if r.get("data", {}).get("callId") == "spawn6")
    call["time"] = 1  # dispatched, and finished, before report 5 exists
    run["sessions"]["C6"][-1]["time"] = 2
    with pytest.raises(AssertionError, match="stage 6 has no reviewer"):
        assert_stage_order(run)


def test_reviewer_finishing_after_its_report_fails(tmp_path):
    run = synthetic_run(tmp_path)
    run["sessions"]["C5"][-1]["time"] = 5
    with pytest.raises(AssertionError, match="stage 5 reviewer finished after its report"):
        assert_stage_order(run)


def test_redispatch_between_report_writes_is_remediation(tmp_path):
    run = synthetic_run(tmp_path)
    extra = copy.deepcopy([r for r in run["records"] if r.get("callId") == "spawn7"][0])
    extra["callId"], extra["result"]["value"]["subagentId"] = "spawn7b", "C7b"
    run["records"].append(extra)
    run["sessions"]["P"].append({"type": "tool/call", "time": 23, "data": {"callId": "spawn7b"}})
    run["sessions"]["C7b"] = copy.deepcopy(run["sessions"]["C7"])
    rewrite = copy.deepcopy([r for r in run["records"] if r.get("callId") == "write7"][0])
    rewrite["callId"] = "write7b"
    run["records"].append(rewrite)
    run["sessions"]["P"].append({"type": "tool/result", "time": 25, "data": {"message": {"toolCallId": "write7b"}}})
    stages, remediation = assert_stage_order(run)
    assert remediation == ["C7b"] and stages["8"] == ["C8"]


def test_missing_report_write_fails(tmp_path):
    run = synthetic_run(tmp_path)
    run["records"] = [r for r in run["records"] if r.get("callId") != "write9"]
    with pytest.raises(AssertionError, match="missing stage report: implementation_readiness_report.md"):
        assert_stage_order(run)


def test_review_child_without_mode_fails(tmp_path):
    run = synthetic_run(tmp_path)
    spawn = next(r for r in run["records"] if r.get("callId") == "spawn5")
    spawn["arguments"]["prompt"] = spawn["arguments"]["prompt"].replace("Mode: REVIEW", "Mode: Review")
    with pytest.raises(AssertionError, match="review child without Mode: REVIEW"):
        assert_stage_order(run)


def test_missing_persona_line_fails(tmp_path):
    run = synthetic_run(tmp_path)
    spawn = next(r for r in run["records"] if r.get("callId") == "spawn9")
    spawn["arguments"]["prompt"] = spawn["arguments"]["prompt"].replace(f"Persona: {PERSONA}\n", "")
    with pytest.raises(AssertionError, match="missing Persona line"):
        checks(run)


@pytest.mark.parametrize("result", [{"isError": True, "content": [{"type": "text", "text": "denied"}]},
                                    {"isError": False, "content": [{"type": "text", "text": "  \n"}]}])
def test_failed_or_empty_read_fails(tmp_path, result):
    run = synthetic_run(tmp_path)
    read = next(r for r in run["records"] if r["sessionId"] == "C8" and r.get("arguments", {}).get("file_path") == "zoom_out_report.md")
    read["result"] = result
    with pytest.raises(AssertionError, match="no successful read of zoom_out_report.md"):
        checks(run)


def test_malformed_jsonl_names_file_and_line(tmp_path):
    path = tmp_path / "records.jsonl"
    path.write_text('{"kind": "runtime"}\n{"kind": \n', encoding="utf-8")
    with pytest.raises(AssertionError, match=r"malformed JSONL: .*records\.jsonl:2"):
        jsonl(path)


def test_jsonl_keeps_unicode_line_separator_inside_a_string(tmp_path):
    path = tmp_path / "records.jsonl"
    path.write_text('{"text": "a b"}\n', encoding="utf-8")
    assert jsonl(path) == [{"text": "a b"}]


def test_parent_receipt_does_not_count_as_a_reviewer():
    run = {"records": [{"kind": "receipt", "text": "15 reviewers completed"}], "notifications": [], "sessions": {}}
    with pytest.raises(AssertionError, match="No native reviewer"):
        child_traces(run)
