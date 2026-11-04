# Verification

Upstream pin: `113a3afc44e8f4f54722d7150d5701f65cc8ef7f` in
[upstream.lock.json](upstream.lock.json). This page maps each upstream support
requirement to the dsh-egm check that answers it, and states each limit.

Sources at that commit: A = [`docs/designs/additional-harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/designs/additional-harnesses.md)
("Architecture and data flow", "Validation and release gates");
H = [`docs/harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/harnesses.md);
T = [`TESTING.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/TESTING.md).

## Commands

| Layer | Command | Cost |
| --- | --- | --- |
| Node suite | `npm test` (CI: Linux and Windows) | Free |
| Keyless DSH tests | `pytest tests/integration -q` (CI: Linux) | Free |
| Paid DSH tests | `DSH_EGM_LIVE=1 pytest tests/integration -q`, see [LIVE-README](tests/integration/LIVE-README.md) | API credit |
| Manual interactive run | steps in [LIVE-README](tests/integration/LIVE-README.md) | API credit |

## Requirement map

| # | Upstream requirement | Check, record or limit | Status |
| --- | --- | --- | --- |
| 1 | Manifest parsing, identity, version (A) | `manifest`, `engines`, `ui-meta` tests; CI pack check | Pass |
| 2 | Persona, standard, guide paths in the installed layout (A) | `test_install`: every packed file equals the installed file, and every locked vendored member's literal bytes hash to its recorded lock SHA-256 (no newline normalization) | Pass (keyless) |
| 3 | Adapter tool restrictions (A) | `reviewer` test; `test_adapter` real denials | Pass |
| 4 | No copies of shared behavior; no fork of skill text (A, H) | `upstream-lock`: the bundled copy matches the LF-normalized `113a3af` bytes recorded in the lock, a pinned copy, not a fork; the raw archive bytes are checked by row 2. The preamble restates some upstream rules in DSH terms. Whether an external package counts is row 19 | Pass; packaging open |
| 5 | Negative fixtures for each evidence parser (A) | Synthetic cases in `test_live_checks.py` | Pass (keyless) |
| 6 | Clean host profile, fixed candidate (A) | Disposable `DSH_HOME`; `DSH_EGM_TARBALL`. Limit: the replay fixtures add the `agentPresets` registry and a `standard` default preset that the bundle does not yet supply, so a bare SDK profile's `egm_reviewer` refuses until package-supplied setup exists | Paid run |
| 7 | Candidate SHA, checksum, host version and surface, model, date (A) | `identity.json`; the upstream pin comes from the installed package's own `upstream.lock.json` | Paid run |
| 8 | Install, workflow, isolation recorded separately (A) | `test_install`; `test_brainstorm_draft_review`; `test_adapter` and `test_fresh_context_isolation` | Paid run |
| 9 | Brainstorm, draft, review end to end through the install (H) | `test_brainstorm_draft_review` | Paid run |
| 10 | A real human approval pause (A) | Manual run record, quoting the native question and answer rows | Manual run |
| 11 | Reviewer starts and completions from host records (A) | `child_traces` | Paid run |
| 12 | A missing reviewer is not a passing review; no inline simulation (A) | `child_traces`; parent-receipt case | Pass (keyless) |
| 13 | Sequential stages (T) | `assert_stage_order` | Paid run |
| 14 | Random parent-only marker (A) | `test_fresh_context_isolation`; `test_adapter` | Pass (keyless) |
| 15 | Reviewer reads persona, target and standard (A, T) | `assert_required_reads`. Limit: `GoldfishContext` entries are a reading list, not checked | Paid run |
| 16 | Inspect host-injected context; memory and MCP (A) | `AGENTS.md` probe in `test_adapter` (`host-context.json`); exact reviewer tool set `{read, read_image, glob, grep}` | Seen: DSH 0.2.1-rc.5 puts project `AGENTS.md` into the reviewer request. User-level instruction files and memory not probed |
| 17 | Read-only enforcement on a disposable fixture (A) | `test_adapter` sentinels and exact guard errors | Pass (keyless) |
| 18 | Missing delegation stops with a clear message (A) | `reviewer` fail-closed errors | Pass. Limit: the skill stopping is model behavior |
| 19 | Manifest in the upstream repo, `docs/harnesses.md` entry, transcripts in the PR (H) | Upstream decides: external package, or a manifest and adapter moved upstream ([#240](https://github.com/google/elephant-goldfish-model/issues/240)) | Open |
| 20 | A successful read is non-error, non-empty text and does not prove the whole file was read (T) | Rule in `assert_required_reads` | Limit stated |
| 21 | Reviewers cannot reach unrelated reports through the filesystem (A) | None: DSH guards tool names, not paths | Limit |

## Host prerequisites and current limits

`egm_reviewer` needs a profile that composes an `agentPresets` registry resolving a
valid default preset, plus an in-process `spawn` subagent provider. The bundle
declares the read-only `egm-reviewer` preset but does not create the registry or
its default. Harness `web` profiles compose a registry with a `standard` default;
a bare SDK profile does not, and the tool fails closed with an actionable error.
The keyless replay fixtures add those two rows themselves, so they are disclosed
prerequisite assistance, not observation. Owner decision D3/D3a selects
package-supplied setup when the registry is genuinely absent; that is not
implemented in this tree yet, so bare SDK and arbitrary-profile workflow remains
pending.

The test `identity.json` reads the upstream pin from the installed package's own
lock. A hand-selected tarball therefore records its own pin instead of this
checkout's.

## Live results

`test_brainstorm_draft_review` runs every check and writes `checks.json` before
it fails on any of them, so one failure never hides the rest. To check retained
or manual evidence without changing it:

```sh
python tests/integration/test_dsh_live.py check <evidence-dir> --out <checks.json>
```

A Status-only difference between `design_draft.md` and the final design is listed
under `deviations` as `status-line-only`, and the upstream assertion still fails.
The record row then follows upstream's Antigravity row: Review "Pass (fixture)"
only when `upstream_artifacts` is the sole failing check and `deviations` is
exactly `["status-line-only"]`, with Notes "The final design differs from the
draft in one `Status` line"; otherwise Fail.

## Record row template

Columns as in upstream `TESTING.md`, "Harness Test Record". Fill one row for the
automated run and one for the manual run, because upstream records surfaces
separately.

```text
| DeepSeek Harness (<surface>) | <dsh_version> | <date_utc> | <test_install> | <Brainstorm> | <Draft> | <Review> | dsh-egm <package_version> from <source_sha>, tarball SHA-256 <tarball_sha256>; model <model>. <reviewers>, <stage_order>, <required_reads>. <deviations>. <limits> |
```

## Latest results

- Retained 0.2.4 evidence (2026-11-04, `deepseek-flash`, checked read-only with
  the command above): reviewers pass (15), stage order pass, required reads fail
  (`missing Persona line`, fixed since by persona-by-path), skill delivery
  unverifiable (install directory not recorded), upstream artifacts fail with
  deviation `status-line-only`. This remains a failed acceptance attempt.
- First paid run on these tests (2026-11-04, `deepseek-flash`, tarball from
  `5f552aa`): install, both isolation tests, reviewers (15), required reads and
  skill delivery pass. Stage order fails: stages 5 to 7 were dispatched together
  and 8 to 9 before any report, so the preamble now states upstream's sequencing
  rule. Upstream artifacts fail: the final design rewrote one relative link when
  copied to `docs/designs/` (no listed deviation). Failed acceptance attempt.
- Run with the sequencing rule, first attempt (2026-11-04, tarball from
  `6fe3a21`): the parent ended its turn after brainstorm, so draft and review
  never ran. Failed attempt.
- Second attempt (2026-11-04, `deepseek-flash`, tarball SHA-256 `dcc0f511…`
  from `6fe3a21`): reviewers (15), stage order, required reads and skill
  delivery pass. Upstream artifacts fail only on `status-line-only`
  (`Draft` to `Proposed`). By the rule above, Review is Pass (fixture) with that
  Status note. Note: every stage reviewer targeted the final copy
  `docs/designs/line-count.md` rather than `design_draft.md` as the prompt asks;
  the parent applied each stage's fixes to both. Upstream's assertions do not
  check the review target. Isolation was not rerun in this attempt (`-k brainstorm`);
  it passed on the same tarball's earlier full run.
- Same tarball run without reasoning, third attempt: the parent wrote the
  brainstorm brief itself and started no brainstorm reviewers (9 of 15). Failed.
- **Full suite with reasoning enabled** (2026-11-04, `deepseek-flash`,
  `reasoningEffort: high`, tarball from `de5a022`): 25 of 25 passed. Install,
  both isolation tests, reviewers (15), stage order, required reads, skill
  delivery and upstream's unchanged assertions all pass; the final design is
  byte-identical to `design_draft.md`, which every stage reviewed. Two notes
  from that run are now failures: the parent used `send_message` to make a
  brainstorm reviewer run a second turn, and it edited `design_draft.md` while
  the stage 5 reviewer was running. The adapter now refuses follow-up messages
  to reviewers (proven in keyless replay), the preamble forbids editing the
  document during a stage, and the checks fail both cases, so this run no longer
  counts.
- **Full suite on `1d208c2`** (2026-11-04, `deepseek-flash`, `reasoningEffort:
  high`, tarball SHA-256 `c350453c…`): install, both isolation tests, reviewers
  (15, each one turn, no follow-up messages), stage order with no edits during a
  stage, required reads, skill delivery and upstream's unchanged assertions pass;
  the final design is byte-identical to the reviewed draft. The run first failed
  `required_reads` because brainstorm prompts had no `TargetFile` line, which
  ADAPTER-NOTES.md lists as REVIEW-only; the check and the preamble wording now
  agree (`a77194d`), and rechecking the retained evidence passes every check.
  The preamble changed after this candidate, so a final run on the release
  candidate and the manual interactive run are pending. [Historical results](E2E-VERIFICATION.md)
  do not establish acceptance of the current package.

## Current free checks (not acceptance)

The uncommitted in-place repairs were checked on 2026-11-04:

- Node suite with `EGM_SOURCE`: 43 passed, 0 skipped (LF-normalized pinned-object
  comparisons included).
- WSL `DSH_EGM_LIVE=0 pytest tests/integration -q`: 29 passed, 2 paid tests
  skipped, including the new installed-pin identity and literal archive-byte
  regressions.
- Offline raw-Git provenance: pass. Source blob
  `6ae169192f6817b2f9b33ebb495c4432866c0caa`, prompt SHA-256
  `9e7a49cefaeb618fcf8aede675af825cc2c3ee7aab51a441c7689da45747630f`, all 26
  lock hashes equal to pinned Git objects.
- Candidate archive from this tree: 53 files, no `EGM.md` map. All 26 vendored
  members equal the lock's raw SHA-256 and the pinned Git objects; installing it
  in a disposable profile produced 53 identical files, no maps, and the expected
  version and pin.

These are keyless gates. They do not establish the workflow, the human pause or
upstream acceptance; those remain pending.
