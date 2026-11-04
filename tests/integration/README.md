# Keyless Harness integration tests

Two pytest cases exercise the packed local plugin in a real, disposable Harness. Native replay
supplies fixed model responses; no inference keys or live model recording are required. The tests
inspect actual requests, tool results and native child completions. Existing JavaScript unit/content
checks remain in [`test/`](../../test/README.md) and need no dependency installation.

## Setup and run

The initial integration target is Linux, Node 24 and Python 3.12. From the repository root, create a
private virtual environment outside the checkout and install the committed dependency locks:

```sh
EGM_TEST_ENV=$(mktemp -d)
python3.12 -m venv "$EGM_TEST_ENV/venv"
"$EGM_TEST_ENV/venv/bin/python" -m pip install -r tests/integration/requirements.txt
"$EGM_TEST_ENV/venv/bin/python" -m pip check
npm ci --prefix tests/integration/runtime

# Both real-host cases
"$EGM_TEST_ENV/venv/bin/python" -m pytest tests/integration/test_dsh.py -q

# One case while working
"$EGM_TEST_ENV/venv/bin/python" -m pytest tests/integration/test_dsh.py -q -k isolation
"$EGM_TEST_ENV/venv/bin/python" -m pytest tests/integration/test_dsh.py -q -k workflow
```

Keep the environment path until finished; remove that private directory when it is no longer needed.
The nested Node installation is test-only and ignored by Git. The npm package allowlist excludes
`tests/` and its dependencies. Root `npm test` remains the existing dependency-free JavaScript suite.

The four direct `@deepseek-ai` packages (`dsh`, `dsh-llm-replay`,
`dsh-agent-preset-registry`, `dsh-agent-preset`) are pinned at 0.2.1-rc.5, plus pnpm 11.25.0. The Python client is
`deepseek-harness-sdk==0.2.1rc2`, with pytest 8.3.5 and exact transitive pins in `requirements.txt`.
The SDK's rc2 runtime-bin dependency is installed but unused: the fixture explicitly selects
`runtime/node_modules/.bin/dsh` from the locked rc.5 install. It composes the documented registry,
standard parent preset, the installed plugin, native replay and a small public Cordis observer.

## What passes

- `isolation`: actual parent-private marker is present in parent input and absent from every child
  request; authorized context is present; the actual reviewer preset and tools are read-only.
  Native parent read/write/bash controls succeed against two sentinels, then both files are reset.
  The real reviewer attempts identical write/bash payloads and receives exactly the EGM read-only
  guard errors. Both files stay unchanged and the child completes successfully.
- `workflow`: the unchanged inventory sample supplies inputs for a design-only low-stock feature.
  Fourteen fixed SDK phases resume one parent session, with fifteen real reviewer activations and
  all six brainstorm activations overlapping. Each role must make its required full/scoped reads
  with exact native paths, arguments, line numbers and text. Stage6 has document-only context;
  Stage8 reads the earlier report. Native parent tools write the brief, draft and five ordered
  reports, then copy the reviewed draft to the final design. Exactly eight new files are allowed;
  all original input/source/test bytes must stay unchanged.

Missing evidence, replay errors, failed native outcomes, automatic compaction or a runtime process
remaining after SDK close fail the tests. Native completion identity is checked per reviewer; counts
or model claims alone do not pass. Small synthetic contaminated-request and missing-completion/write
controls check these central assertions without additional real-host fault scenarios.

Synthetic approvals and scripted answers test host behavior and artifact transport. They do not prove
live model instruction following, reviewer insight or interactive approval handling. Read the
[historical manual verification](../../E2E-VERIFICATION.md) for separate live-model evidence.
Cleanup proves absence of the owned SDK runtime PID, not graceful protocol shutdown or a general
process-tree audit. No normal Harness profile is selected or modified.

## Bounds and failure evidence

Initial bounds are 180 seconds for isolation and 600 for workflow, with a monotonic scenario deadline,
30-second initialization, at most 60 seconds per request/wait or plugin install, and 3 seconds for SDK
close. The synthetic replay model advertises a large context window to avoid extra compaction calls;
compaction is excluded from this fixed fixture and fails explicitly. These are operational limits,
not performance benchmarks.

Pytest retains each run under its temporary directory and prints the scenario evidence path. To pick
a stable location outside the checkout, pass `--basetemp /absolute/private/path`; pytest owns and
clears that directory at the next run. It contains the package tarball, private home/workspace,
version/upstream identity, installation log, generated replay/patch/child inputs, actual observer
`records.jsonl`, SDK `notifications.json`, native Session logs and workflow outputs. On failure, read
the failed assertion and the corresponding numbered phase directory. Markers are checked before
any normalization. The fixture strips inference credentials from its launch environment while
preserving required proxy/TLS settings; it does not print credentials.

CI runs both cases unconditionally in one 20-minute Linux job with the same locks and commands.
Failures upload the synthetic evidence (including hidden `.dev` outputs) for 7 days. Missing runtime
or Python dependencies fail with installation instructions rather than skipping.

## Fixture provenance and maintenance

`isolation.override.json` and `workflow.override.json` contain only their fixed named phases, each a
native ReplayEntry array. Python selects a phase and expands explicit workspace/plugin path tokens;
native replay owns script parsing and model-call assignment. Native `fromRequest` placeholders take
read/reviewer arguments from each actual prompt. Child scripts in a concurrent group are exchangeable;
role identity and reads are checked independently of assignment order. Unused acknowledgment suffixes
are valid when native child handbacks coalesce; no unsupported `assertConsumed` guarantee is claimed.

The two committed child Session seeds came from complete logs emitted by the native Session writer
in keyless replay-only probes. The generic seed has a four-read model response and final role text;
the read-only seed has read, write, bash and final responses. Both are checked with the native
`parseSessionLog` and `deriveReplayScript` APIs before use. Python changes only run-local header identity.
Stored seed paths were sanitized to synthetic locations; the seeds contain no live model recording.

When a pinned runtime or necessary tool recipe changes, create a new seed through the native writer
in a disposable replay-only run, fully decode compressed logs if needed, preserve complete event
relationships, and validate through the native APIs. Update the explicit scripts and semantic
assertions deliberately, then run both selectors and the full suite. Tests never regenerate their
fixtures or expectations. Do not fabricate Session lifecycle events or broaden the denial oracle to
accept arbitrary tool/filesystem errors. Upstream re-vendoring remains a separate maintainer action.
