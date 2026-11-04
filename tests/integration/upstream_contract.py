# Copyright 2026 Google LLC.
# SPDX-License-Identifier: Apache-2.0

# Mechanically extracted upstream assertions; regenerate with extract_upstream_contract.py.
# Source Git blob: 6ae169192f6817b2f9b33ebb495c4432866c0caa

def assert_upstream_artifacts(tmp_path):
    for name in ('concepts_brief.md', 'design_draft.md', 'docs/designs/line-count.md'):
        artifact = tmp_path / name
        assert artifact.is_file(), f'Missing workflow artifact: {name}'
        assert len(artifact.read_text().strip()) > 200, f'Trivial artifact: {name}'
    assert (tmp_path / 'docs/designs/line-count.md').read_bytes() == (tmp_path / 'design_draft.md').read_bytes(), 'Final design differs from the reviewed draft'
    for name in ('zoom_out_report.md', 'comprehension_report.md', 'critic_report.md', 'intermediate_zoom_out_report.md', 'implementation_readiness_report.md'):
        report = tmp_path / name
        assert report.is_file(), f'Missing stage report: {name}'
        assert len(report.read_text().strip()) > 100, f'Empty/trivial report: {name}'
    assert not list(tmp_path.rglob('*.py')), 'Design workflow wrote implementation code'


def assert_upstream_child_count(children):
    assert len(children) >= 15, 'Expected six brainstorm and nine stage reviewers'
