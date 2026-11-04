# Verification

This account covers the integrated upstream 464db candidate, evaluated locally on
2026-11-03. The package version remains 0.2.3; this update has not been released.

## Provenance

`upstream.lock.json` pins `google/elephant-goldfish-model` at
`464db031e7dd1b9a79803ac8ea45f55c7c20c5bc`. All 26 runtime mappings and 16 fixture
mappings match the target Git objects and lock SHA-256 values under the documented
CRLF-to-LF normalization policy. Licensing and attribution remain unchanged.
The refresh changes eleven runtime documents and their corresponding fixtures;
[the semantic assessment](docs/testing/UPSTREAM-464DB-ASSESSMENT.md) explains their scope.

```sh
EGM_SOURCE=/path/to/local/upstream npm test
npm pack --dry-run --json
```

With `EGM_SOURCE` set, the tests independently compare all 42 mapped artifacts to
the pinned Git objects. Without it, that independent comparison skips; offline
lock/hash and content-parity checks still run. Scenario parity exercises 43 of 69
text-pattern assertions; the remaining 26 are excluded because upstream itself
does not satisfy them. These checks establish content contracts, not model behavior.

`node scripts/check-upstream.mjs --ref 464db031e7dd1b9a79803ac8ea45f55c7c20c5bc`
checks the selected revision remotely; omitting `--ref` checks live main, which
may have advanced. Exit 1 indicates drift and exit 2 a check error. Neither is a
substitute for the independent Git-object comparison. Refresh the lock only with
`node scripts/check-upstream.mjs --update-lock --source <target-checkout>`.

## Host security boundary

`egm_reviewer` selects provider `spawn`, the independent `egm-reviewer` preset,
maxDepth 1, parent delivery and the explicit reviewer prompt. The pinned native
spawn implementation creates a fresh session without a parent seed. The preset
composes persona, read-only tools, search, compaction and the reviewer guard.
An additional `agent/created` guard is installed before tool-schema hiding;
setup errors propagate and broken declared presets are rejected before spawn.
Unit tests exercise these setup paths. Source tracing of native rc.5 initialization
supports failure propagation; an injected native setup-failure scenario was not run.

The host guard denies non-allowlisted tool names at dispatch. Late or scope-local
forbidden tools can remain visible while calls are denied. Allowed readers,
including ops readers, are trusted implementations; replacing an allowed name
with unsafe code is outside this boundary.

Read paths are unconfined. Installed filesystem source describes cwd as a
resolution default and confines mutations without confining reads. This is source
evidence; no outside-workspace read experiment was run in this evaluation.
Absent automatic parent context and absent dedicated session-reading tools do not
establish secrecy for arbitrary parent/session files reachable by allowed readers.

Linked-file selection, realpath checks, outside/URL approval, Stage 6's design-only
rule, author identity, private scratch and implementation file boundaries are
model instructions. They are not filesystem allowlists or host enforcement of
stage semantics. Referenced text cannot authorize expanded access; scripted replay
does not establish live-model compliance with these instructions.

## Keyless real-host replay gate

The two [Python integration cases](tests/integration/test_dsh.py), documented in
[the integration README](tests/integration/README.md), install the local npm tarball
in a fresh private Harness `sdk` profile. Native replay supplies synthetic model
responses through the public Python SDK over stdio, without inference keys.

- **Isolation/read-only:** prove the private marker reached actual parent input,
  require its absence and the authorized marker's presence in every child request,
  inspect the reviewer preset/tool schema, prove parent write/bash controls succeed,
  reset sentinels, and require identical child operations to receive the exact native
  EGM reviewer-guard errors. The child must finish successfully with sentinels unchanged.
- **Workflow:** fifteen reviewer activations over fourteen ordered SDK phases, six
  overlapping brainstorm reviewers, exact required full/scoped reads, Stage 6 source
  exclusion, Stage 8 prior-report reading, five ordered reports, exactly eight new
  outputs, unchanged input/source/test bytes and final/draft byte equality.
- **Evidence and cleanup:** join activation/start/finish identities, require native
  successful outcomes and no compaction, retain synthetic evidence on failure, and
  require each owned SDK runtime PID to be absent after bounded close. Synthetic
  contaminated-input and missing-evidence controls check the central assertions.

The exercised tuple was Linux, Node 24.19.0, Python 3.12.14, native Harness/replay
and preset packages 0.2.1-rc.5, pnpm 11.25.0, Python SDK 0.2.1rc2 and pytest 8.3.5.
The SDK's bundled rc2 runtime dependency was installed but unused: the fixture
selected the locked npm rc.5 executable. Use the private-environment installation
and commands in the integration README to reproduce the gate.

| Local candidate check | Observed result |
| --- | --- |
| `EGM_SOURCE=<local upstream> npm test` | 62 runner entries passed, zero failures/skips: 60 named tests and two helper entries |
| `python -m pytest tests/integration/test_dsh.py -q` | 2 passed in 37.85s on the final primary checkout; 16 successful native reviewer completions; all 16 owned runtime PIDs absent after close |
| `npm pack --dry-run --json` | 55 files; no `test/`, `tests/`, `docs/testing/`, examples, workflows or nested dependencies |
| Independent upstream comparison | All 42 mapped artifacts match the pinned Git objects and hashes |
| `git diff --check` and staged equivalent | Passed on the final integrated checkout |

The unchanged CI runs the JavaScript suite and packaging checks on Ubuntu Node
22/24 and Windows Node 24, plus both replay cases in a Linux Node 24/Python 3.12
job. Actions are checkout v7.0.1, setup-node v7.1.0, setup-python v7.1.0 and
upload-artifact v7.0.2. Failure evidence is retained for seven days. Hosted GitHub
Actions has not been run for this update; configured matrix lanes are not new
local platform evidence.

## Evidence limits and history

Replay verifies host plumbing, adapter restrictions and artifact transport. It does
not establish reviewer insight, live-model instruction following, interactive
approval handling, graceful protocol shutdown, or platforms/versions outside the
exercised tuple. Cleanup checks owned SDK runtime PIDs, not a general process-tree
audit. Windows, Agent Team, outside-workspace reads and live-model acceptance were
not exercised in this candidate evaluation.

[E2E-VERIFICATION.md](E2E-VERIFICATION.md) retains the historical 2026-10-31 live-model
run of plugin 0.2.0, including 17 reviewers and brainstorm/draft/review artifacts.
Its results do not establish the refreshed candidate's live-model workflow behavior.
[The candidate result record](docs/testing/RESULTS-464DB.md) records the local
Linux evaluation; it does not certify an archive or a release.
