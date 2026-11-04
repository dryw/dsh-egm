"""Regenerate/check the host-neutral upstream assertions without running Codex.

Use a raw LF copy of the pinned test_codex.py (or git show output). No network,
plugin installation, inference, or execution of upstream test-module imports.
"""
import argparse
import ast
import hashlib
from pathlib import Path

BLOB = "6ae169192f6817b2f9b33ebb495c4432866c0caa"


def extract(source):
    blob = hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
    if blob != BLOB:
        raise ValueError("Pinned upstream Git blob mismatch: " + blob)
    fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef)
              and n.name == "test_brainstorm_draft_review")
    loops = [n for n in fn.body if isinstance(n, ast.For)]
    if len(loops) != 2:
        raise ValueError("Upstream artifact assertion layout changed")
    assertions = [n for n in fn.body if isinstance(n, ast.Assert)]
    select = lambda message: next(n for n in assertions if message in ast.unparse(n))
    body = loops[:1] + [select("Final design differs")] + loops[1:] + [select("Design workflow wrote")]
    count = select("Expected six brainstorm")
    header = ("# Copyright 2026 Google LLC.\n# SPDX-License-Identifier: Apache-2.0\n\n"
              "# Mechanically extracted upstream assertions; regenerate with extract_upstream_contract.py.\n"
              "# Source Git blob: " + blob + "\n\n")
    indent = lambda nodes: "".join("    " + line + "\n" for n in nodes for line in ast.unparse(n).split("\n"))
    return (header + "def assert_upstream_artifacts(tmp_path):\n" + indent(body)
            + "\n\ndef assert_upstream_child_count(children):\n" + indent([count]))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).with_name("upstream_contract.py")
    expected = extract(args.source.read_bytes())
    if args.check:
        assert output.read_text(encoding="utf-8") == expected, "Extracted upstream assertions drifted"
        print("PASS: pinned host-neutral upstream assertions match")
    else:
        output.write_text(expected, encoding="utf-8")
