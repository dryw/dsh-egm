"""Keyless checks for the small live harness; never selects a real provider."""
import json

import pytest

from test_dsh_live import (RUNTIME, INVOCATIONS, installed_plugin, run_dsh,
                           assert_skill_delivery, child_traces)


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


def test_native_user_skill_invocation(installed_plugin, tmp_path):
    # Check delivered instructions rather than asking a model whether it saw them.
    seed_root = tmp_path / "seed"; seed_root.mkdir()
    seed = run_dsh(installed_plugin, seed_root,
                   [{"type": "text", "text": INVOCATIONS}, {"type": "text", "text": "Return UNKNOWN"}],
                   provider="egm-replay", model="fixed", provider_rows=replay(seed_root, [response("UNKNOWN")]))
    assert_skill_delivery(seed)


def test_parent_receipt_does_not_count_as_a_reviewer():
    run = {"records": [{"kind": "receipt", "text": "15 reviewers completed"}], "notifications": [], "sessions": {}}
    with pytest.raises(AssertionError, match="No native reviewer"):
        child_traces(run)
