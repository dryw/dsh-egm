# Testing

Upstream pin: `113a3afc44e8f4f54722d7150d5701f65cc8ef7f` in
[upstream.lock.json](upstream.lock.json). This page maps each upstream support
requirement to the dsh-egm check that answers it, states each limit, and is the
harness test record. Host mechanics, manifest mapping and the composed
isolation layers live in [docs/dsh.md](docs/dsh.md).

The current tree is the **uncommitted Phase C1b candidate** (branch
`restructure`, nothing committed): the C1a relocation plus the opt-in host
prerequisite patch. Acceptance is pending: no workflow, human-pause or
upstream-support result has been re-established for this candidate. The Phase M
and C1a figures below are kept as history; the keyless checks for this candidate
are under "Phase C1b checkpoint".

Sources at that commit: A = [`docs/designs/additional-harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/designs/additional-harnesses.md)
("Architecture and data flow", "Validation and release gates");
H = [`docs/harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/harnesses.md);
T = [`TESTING.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/TESTING.md).

## Commands

| Layer | Command | Cost |
| --- | --- | --- |
| Node suite | `npm test` (quoted `tests/unit/*.test.js`; CI: Linux and Windows) | Free |
| Keyless DSH tests | `DSH_EGM_LIVE=0 pytest tests/integration tests/unit/test_dsh_traces.py -q` (CI: Linux) | Free |
| Packed-file check | CI pack check: `npm pack --dry-run` compared with `package.json` `files` | Free |
| Paid DSH tests | `DSH_EGM_LIVE=1 pytest tests/integration -q`, see [LIVE-README](tests/integration/LIVE-README.md) | API credit |
| Manual interactive run | steps in [LIVE-README](tests/integration/LIVE-README.md) | API credit |

## Keyless suite setup

The keyless DSH suite needs Linux, Node 24 and Python 3.12. From the repository
root:

```sh
python3.12 -m venv /path/to/venv
/path/to/venv/bin/pip install -r tests/integration/dsh_requirements.txt
npm ci --prefix tests/integration/dsh-ci
/path/to/venv/bin/python -m pytest tests/integration tests/unit/test_dsh_traces.py -q
```

`tests/integration/dsh-ci/` holds the locked Node runtime package pins;
`tests/integration/dsh_requirements.txt` holds the Python pins. Set
`EGM_TEST_RUNTIME` to point at a different installation of the locked Node
runtime (a Linux-local directory under WSL). The paid tests stay skipped unless
`DSH_EGM_LIVE=1`. `npm test` runs the separate Node suite.

## Requirement map

| # | Upstream requirement | Check, record or limit | Status |
| --- | --- | --- | --- |
| 1 | Manifest parsing, identity, version (A) | `dsh_manifest`, `dsh_engines`, `dsh_metadata` tests; CI pack check | Pass |
| 2 | Persona, standard, guide paths in the installed layout (A) | `test_install`: every packed file equals the installed file, and every locked vendored member's literal bytes hash to its recorded lock SHA-256 (no newline normalization) | Pass (keyless) |
| 3 | Adapter tool restrictions (A) | `dsh_reviewer` test; `test_adapter` real denials | Pass |
| 4 | No copies of shared behavior; no fork of skill text (A, H) | `dsh_upstream`: the bundled copy matches the LF-normalized `113a3af` bytes recorded in the lock, a pinned copy, not a fork; the raw archive bytes are checked by row 2. The preamble restates some upstream rules in DSH terms. Whether an external package counts is row 19 | Pass; packaging open |
| 5 | Negative fixtures for each evidence parser (A) | Synthetic cases in [tests/unit/test_dsh_traces.py](tests/unit/test_dsh_traces.py) | Pass (keyless) |
| 6 | Clean host profile, fixed candidate (A) | Disposable `DSH_HOME`; `DSH_EGM_TARBALL`. The keyless and paid runs load the installed `adapters/dsh/agent-presets.patch.yml` (opt-in, D8); no fixture-injected prerequisite rows. Limit: the patch is applied with `--patch` and the package does not compose the registry automatically, so `headless` or `sdk` need it added | Paid run |
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
| 18 | Missing delegation stops with a clear message (A) | `dsh_reviewer` fail-closed errors | Pass. Limit: the skill stopping is model behavior |
| 19 | Manifest in the upstream repo, `docs/harnesses.md` entry, transcripts in the PR (H) | Upstream decides: external package, or a manifest and adapter moved upstream ([#240](https://github.com/google/elephant-goldfish-model/issues/240)) | Open |
| 20 | A successful read is non-error, non-empty text and does not prove the whole file was read (T) | Rule in `assert_required_reads` | Limit stated |
| 21 | Reviewers cannot reach unrelated reports through the filesystem (A) | None: DSH guards tool names, not paths | Limit |
| 22 | Host agent-preset prerequisites (D3/D3a, amended by D8) | Shipped opt-in `adapters/dsh/agent-presets.patch.yml`; `run_dsh` and the `profile` command load the installed file; `test_missing_agent_presets` asserts the exact fail-closed error without it. Limit: opt-in only; no automatic composition or repair | Pass (keyless); opt-in only |

## Host prerequisites and current limits

`egm_reviewer` needs a profile that composes an `agentPresets` registry resolving a
valid default preset, plus an in-process `spawn` subagent provider. The bundle
declares the read-only `egm-reviewer` preset but does not compose the registry or
its default. The shipped `web` template composes a registry (`default: standard`)
and `spawn`; the shipped `headless` and `sdk` templates compose `spawn` but no
registry. For those, the package ships an opt-in patch,
`adapters/dsh/agent-presets.patch.yml`, applied with the public launcher option
`--patch <installed package>/adapters/dsh/agent-presets.patch.yml`. Profiles that
already compose a registry need nothing; applying the patch to `web` with DSH
0.2.1-rc.5 exits 0 but yields a second registry/preset pair with the same ids in
the `--dump-config` composition, so it is not merged or refused.

The keyless replay runs (`run_dsh` and the `profile` command in
`tests/integration/test_dsh_live.py`) pass the **installed** copy of that file as
an additional patch, so they load what a user loads; they no longer inject the
registry or preset rows themselves. The observer, session-persistence and replay
provider rows remain instrumentation, not prerequisites. The negative test
`test_missing_agent_presets` omits the patch and asserts the exact fail-closed
error (see [docs/dsh.md](docs/dsh.md#host-prerequisites-and-current-limit)).

The package still does **not** compose the prerequisites automatically and does
not repair an existing registry whose default is missing or invalid. Supplying
the patch is a launcher step; bare SDK and arbitrary-profile workflow therefore
remains **pending** unless the patch is added. This candidate makes no support
claim for those surfaces.

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

## Free checks (not acceptance)

### Phase M checkpoint (historical)

These keyless results were recorded on the uncommitted Phase M tree on
2026-11-04. They are kept as history; they are not results for the current
Phase C1a tree. Since Phase M, the relocation changed which files ship, moved the
suites and tooling, and renamed this record.

- Node suite with `EGM_SOURCE`: 43 passed, 0 skipped (LF-normalized pinned-object
  comparisons included).
- WSL `DSH_EGM_LIVE=0 pytest tests/integration -q`: 29 passed, 2 paid tests
  skipped, including the new installed-pin identity and literal archive-byte
  regressions.
- Offline raw-Git provenance: pass. Source blob
  `6ae169192f6817b2f9b33ebb495c4432866c0caa`, prompt SHA-256
  `9e7a49cefaeb618fcf8aede675af825cc2c3ee7aab51a441c7689da45747630f`, all 26
  lock hashes equal to pinned Git objects.
- Candidate archive from that tree: 53 files, no `EGM.md` map. All 26 vendored
  members equal the lock's raw SHA-256 and the pinned Git objects; installing it
  in a disposable profile produced 53 identical files, no maps, and the expected
  version and pin.

### Phase C1a checkpoint (historical)

Recorded on the uncommitted Phase C1a tree on 2026-11-04. These are the keyless
free checks for the relocation and are kept as history for that tree. Workflow,
human-pause and upstream acceptance remain pending.

- Node suite with `EGM_SOURCE` (Windows Node 24): **43 passed, 0 failed, 0
  skipped**, including the LF-normalized pinned-Git-object comparisons. Plain
  `npm test` (no `EGM_SOURCE`): 43 tests, 42 passed, 1 optional comparison
  skipped.
- WSL `DSH_EGM_LIVE=0 pytest tests/integration tests/unit/test_dsh_traces.py -q`
  with the recorded Node 24 and locked runtime: **29 passed, 2 skipped** (the two
  opt-in `@LIVE` paid tests) in 5.5 s.
- Candidate archive from this tree: **47 files** (46 declared plus
  `package.json`); no `EGM.md` map, no D2 source, asset README, checker or
  renderer packed. Installed into a disposable `sdk` profile: 47/47 files
  identical, version `0.2.4`, pin `113a3af…`. The single candidate archive
  SHA-256 is kept with the private checkpoint evidence for this uncommitted
  candidate.
- Every public export key resolved from the installed package;
  `dsh.bundle.patch` loaded the three unchanged plugin names; the relocated
  package passed the keyless replay/install scenarios.
- Offline raw-Git provenance: pass; source blob `6ae1691…0caa`, prompt SHA-256
  `9e7a49ce…630f`, all 26 lock hashes equal to pinned Git objects; all 26 raw
  archive members equal both the lock SHA-256 and the pinned Git objects.
- Relative links in `docs/dsh.md` and this page resolve; `git diff --check`
  clean.

### Phase C1b checkpoint (current candidate)

Recorded on the uncommitted Phase C1b tree on 2026-11-04. C1b adds the opt-in
prerequisite patch (D8); the C1a relocation remains the baseline. These are
keyless free checks only. Workflow, human-pause and upstream acceptance remain
pending.

- Node suite with `EGM_SOURCE` (Windows Node 24): **43 passed, 0 failed, 0
  skipped**, including the LF-normalized pinned-Git-object comparisons.
- WSL `DSH_EGM_LIVE=0 pytest tests/integration tests/unit/test_dsh_traces.py -q`
  with the recorded Node 24 and locked runtime: **30 passed, 2 skipped** (the two
  opt-in `@LIVE` paid tests). The added pass is `test_missing_agent_presets`,
  which omits the shipped patch and asserts the exact fail-closed error.
- No test injects `agent-preset-registry` or `preset-standard` rows any more;
  `run_dsh` and the `profile` command pass the installed
  `adapters/dsh/agent-presets.patch.yml` as an additional patch instead.
- Candidate archive from this tree: **48 files** (47 declared plus
  `package.json`), with the new patch packed; no `EGM.md` map, no D2 source,
  asset README, checker or renderer packed. Installed into a disposable `sdk`
  profile: 48/48 files identical, version `0.2.4`, pin `113a3af…`.
- Offline raw-Git provenance: pass; all 26 lock hashes equal pinned Git objects,
  and all 26 raw archive members equal the lock SHA-256 and the pinned Git
  objects.
- `git diff --check` clean.

Private command logs and machine-readable results are retained with the
checkpoint evidence for this uncommitted candidate. Acceptance remains pending
for this candidate and for the workflow, human pause and upstream support.

These are keyless gates. They do not establish the workflow, the human pause or
upstream acceptance; those remain pending.
