"""Keyless checks for the small live harness; never selects a real provider."""
import copy
import json

import pytest

from test_dsh_live import (RUNTIME, REPORTS, assert_required_reads, assert_stage_order,
                           child_traces, jsonl, status_only_difference)


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


def test_resumed_reviewer_fails(tmp_path):
    # Seen in a live run: the parent messaged a finished reviewer, which ran a second turn.
    run = synthetic_run(tmp_path)
    run["sessions"]["C5"].append(dict(run["sessions"]["C5"][-1]))
    with pytest.raises(AssertionError, match="reviewer resumed for a second turn"):
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
    with pytest.raises(AssertionError, match="stage 6 has no reviewer dispatched after report 5"):
        assert_stage_order(run)


def test_all_stages_dispatched_at_once_fails(tmp_path):
    # Seen in a live run: every review stage dispatched before any report was written.
    run = synthetic_run(tmp_path)
    for row in run["sessions"]["P"]:
        if row.get("type") == "tool/call" and row["data"]["callId"].startswith("spawn"):
            row["time"] = 1
    for stage in range(5, 10):
        run["sessions"][f"C{stage}"][-1]["time"] = 2
    with pytest.raises(AssertionError, match="stage 6 has no reviewer dispatched after report 5"):
        assert_stage_order(run)


def test_brainstorm_prompt_may_name_no_target(tmp_path):
    run = synthetic_run(tmp_path)
    spawn = next(r for r in run["records"] if r.get("callId") == "spawn5")
    spawn["arguments"]["prompt"] = (f"Persona: {PERSONA}\nMode: BRAINSTORM\n"
                                    "TargetFile: none (BRAINSTORM). No design document exists yet.\n"
                                    "TargetStandard: none (BRAINSTORM uses the persona's own lens)\n")
    stages = {"5": [], **{str(n): [f"C{n}"] for n in range(6, 10)}}
    assert_required_reads(run, stages)


def test_reviewer_finishing_after_its_report_fails(tmp_path):
    run = synthetic_run(tmp_path)
    run["sessions"]["C5"][-1]["time"] = 5
    with pytest.raises(AssertionError, match="stage 5 reviewer finished after its report"):
        assert_stage_order(run)


def test_redispatch_after_a_report_counts_toward_the_next_stage(tmp_path):
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
    assert remediation == [] and stages["8"] == ["C8", "C7b"]


def test_rewriting_a_report_after_the_next_stage_starts_passes(tmp_path):
    # Seen in a live run: zoom_out_report.md was edited again after stage 6 began.
    run = synthetic_run(tmp_path)
    rewrite = copy.deepcopy([r for r in run["records"] if r.get("callId") == "write5"][0])
    rewrite["callId"] = "write5b"
    run["records"].append(rewrite)
    run["sessions"]["P"].append({"type": "tool/result", "time": 15, "data": {"message": {"toolCallId": "write5b"}}})
    stages, _ = assert_stage_order(run)
    assert stages["6"] == ["C6"]


def test_standard_line_may_name_several_files_in_prose(tmp_path):
    # Seen in a live run: "TargetStandard: <standard> and the design template at <path>".
    run = synthetic_run(tmp_path)
    spawn = next(r for r in run["records"] if r.get("callId") == "spawn7")
    spawn["arguments"]["prompt"] = spawn["arguments"]["prompt"].replace(
        "TargetStandard: none", "TargetStandard: /pkg/feature-spec-standard.md and the design template at /pkg/design_doc.md")
    stages, _ = assert_stage_order(run)
    with pytest.raises(AssertionError, match="no successful read of /pkg/feature-spec-standard.md"):
        assert_required_reads(run, stages)
    for path in ("/pkg/feature-spec-standard.md", "/pkg/design_doc.md"):
        run["records"].append({"kind": "tool", "sessionId": "C7", "callId": path, "name": "read",
                               "arguments": {"file_path": path},
                               "result": {"isError": False, "content": [{"type": "text", "text": "x"}]}})
    assert_required_reads(run, stages)


def test_status_only_difference_ignores_template_spacing(tmp_path):
    (tmp_path / "docs/designs").mkdir(parents=True)
    (tmp_path / "design_draft.md").write_text("# T\n\n*   **Status:** Draft\n\nBody\n", encoding="utf-8")
    (tmp_path / "docs/designs/line-count.md").write_text("# T\n\n*   **Status:** Proposed\n\nBody\n", encoding="utf-8")
    assert status_only_difference(tmp_path)
    (tmp_path / "docs/designs/line-count.md").write_text("# T\n\n*   **Status:** Proposed\n\nOther\n", encoding="utf-8")
    assert not status_only_difference(tmp_path)


def test_editing_the_target_during_a_stage_fails(tmp_path):
    # Seen in a live run: design_draft.md was edited after the stage 5 reviewer started.
    run = synthetic_run(tmp_path)
    run["records"].append({"kind": "tool", "sessionId": "P", "callId": "edit-draft", "name": "edit",
                           "arguments": {"file_path": "design_draft.md"}, "result": {"isError": False}})
    run["sessions"]["P"].append({"type": "tool/result", "time": 0.5, "data": {"message": {"toolCallId": "edit-draft"}}})
    with pytest.raises(AssertionError, match="design_draft.md edited while stage 5 reviewers were running"):
        assert_stage_order(run)
    run["sessions"]["P"][-1]["time"] = 3  # after report 5, before stage 6: remediation, allowed
    assert_stage_order(run)


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


def test_progress_reports_reviewers_and_writes(capsys):
    from test_dsh_live import progress
    labels = {}
    event = lambda kind, data: {"sessionId": "P", "event": {"type": kind, "data": data}}
    progress("session.event", event("subagent/catalog", {"childId": "C", "label": "Stage 5 zoom-out"}), "P", labels, 0)
    progress("session.event", event("tool/call", {"name": "write", "arguments": '{"file_path": "/w/zoom_out_report.md"}'}), "P", labels, 0)
    progress("session.event", event("tool/call", {"name": "write", "arguments": "not json"}), "P", labels, 0)
    progress("subagent.finished", {"childSessionId": "C", "status": "ok"}, "P", labels, 0)
    lines = capsys.readouterr().out.splitlines()
    assert [line.split("] ", 1)[1] for line in lines] == [
        "reviewer started: Stage 5 zoom-out", "write: zoom_out_report.md", "reviewer finished (ok): Stage 5 zoom-out"]
