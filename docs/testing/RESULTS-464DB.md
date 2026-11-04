# Upstream 464db local candidate results

Observed on 2026-11-03, first in an isolated candidate worktree and then on the
primary integrated checkout, based on local harness
checkpoint `24d245f84b6496ee278c3b671aa07e1cd653e171`. The upstream refresh and adapter
hardening were applied before these checks. This is a local evaluation, not a
release record or hosted Actions result.

| Check | Result |
| --- | --- |
| `EGM_SOURCE=/home/agent/.codex/.tmp/marketplaces/egm npm test` | 62 passed, zero failures/skips; 60 named tests and two helper entries |
| `python -m pytest tests/integration/test_dsh.py -q` | Candidate: 2 passed in 34.30s; final primary checkout: 2 passed in 37.85s |
| Native evidence and cleanup | 16 successful reviewer completions; all 16 owned SDK runtime PIDs absent after close |
| `npm pack --dry-run --json` | 55 files, with development trees and nested dependencies excluded |
| Independent provenance check | All 42 mapped artifacts match target Git objects and lock hashes |
| Staged and unstaged whitespace checks | Passed |

The tuple was Linux, Node 24.19.0, Python 3.12.14, Python SDK 0.2.1rc2, pytest 8.3.5,
explicit locked npm Harness/replay/preset 0.2.1-rc.5 and pnpm 11.25.0. Each case
installed the candidate tarball into a fresh private home. The Python SDK's bundled
rc2 runtime dependency was unused.

The unchanged [two-case harness](../../tests/integration/README.md) verifies actual
parent/child inputs, native guard errors, successful child outcomes, workflow
reads/artifacts and bounded runtime cleanup. See [VERIFICATION.md](../../VERIFICATION.md)
for the detailed boundary and limits and [the semantic assessment](UPSTREAM-464DB-ASSESSMENT.md)
for instruction changes. Tests script model responses; they do not prove live-model
compliance. Hosted Actions, Windows, Agent Team, outside-workspace reads and a new
live-model workflow were not run here. The retained [manual E2E record](../../E2E-VERIFICATION.md)
is historical evidence for plugin 0.2.0.

Evaluation evidence was retained at `/tmp/egm-upstream-eval.fompkkx0/`: `summary.json`,
`pack.json`, `merge-notes.json` and the pytest scenario directories. These are local
transient paths, not distributed artifacts or an archive identity for the final integration.

The final primary-checkout rerun also passed all 62 Node entries and all 42 exact
upstream comparisons. Its replay evidence is under the same evaluation root in
`integrated-pytest/`; all 16 owned runtime PIDs were absent after successful
completion. The Windows probe launcher/provider/verifier and its acceptance guide
are omitted. The maintained Python/native replay harness is unchanged.
