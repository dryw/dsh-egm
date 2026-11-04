# Verification

Upstream pin: `113a3afc44e8f4f54722d7150d5701f65cc8ef7f` in
[upstream.lock.json](upstream.lock.json). Content tests check vendored hashes;
`EGM_SOURCE=/path/to/upstream npm test` also compares pinned Git objects.
These are content checks, not model execution.

## Current tests

- `npm test`: adapter unit tests, content parity and package contracts.
- `python -m pytest tests/integration -q`: one native replay adapter scenario,
  skill-delivery and evidence checks; two paid cases skip by default.
- `npm pack --dry-run --json`: inspect the package payload.

The adapter scenario tests successful parent operations, fresh reviewer context,
read access, exact write/shell guard denials and native completion. It does not
script brainstorm/draft/review. That workflow is exercised by the opt-in live test.
See [setup](tests/integration/README.md) and [live commands](tests/integration/LIVE-README.md).

Reviewers have a tool-name allowlist, not a filesystem path sandbox. Reading-list
boundaries remain instructions. Replay does not prove review quality, interactive
approval handling, stage ordering or live-model instruction following.

## Latest local result

Linux/Node 24/Python 3.12 with the locked DSH runtime: three Python tests passed,
two paid tests skipped. CI is configured to run the keyless suite; configuration
is not evidence of a hosted CI run. No new paid run was performed for this change.

The simplified live attempt in `/home/dryw/.cache/dsh-egm-live-1793804340` passed
isolation and completed 15 workflow children, but failed upstream draft/final
equality: only the destination changed Status from Draft to In Review.
This remains a failed acceptance attempt.

Historical results: [0.2.0 manual run](E2E-VERIFICATION.md),
[464db evaluation](docs/testing/RESULTS-464DB.md). They do not establish acceptance
of the current package or testing changes.
