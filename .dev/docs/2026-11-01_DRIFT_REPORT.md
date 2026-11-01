# Drift report — 2026-11-01

Scope: the six EGM contract files created by the 2026-11-01 `egm-bootstrap` run —
`EGM.md`, `scripts/EGM.md`, `examples/EGM.md`, `examples/e2e-verification/EGM.md`,
`examples/e2e-verification/fixture/EGM.md`, `examples/e2e-verification/fixture/src/EGM.md`.

Method: every claim in each contract was compared with the current working tree. Exported symbols
were imported and inspected; all 168 inline `file:line` citations were range-checked against their
targets; every relative link was resolved; the seven artifact hashes recorded in
`E2E-VERIFICATION.md` were recomputed; `node --test` and `npm pack --dry-run` were run. Per the
drift-report contract, matching content is omitted below.

## EGM.md

- Missing coverage — the `egm_reviewer` tool's model-facing contract is not documented: its inputs
  `description` and `prompt` (`reviewer-host.js:23-37`), its output `{ kind: 'activation', subagentId }`
  (`reviewer-host.js:39-47`, `reviewer-host.js:116`), and its fresh `spawn` child in the
  `egm-reviewer` preset with `maxDepth: 1` (`reviewer-host.js:103-116`) are only summarized as
  "registers the tool".
- Missing coverage — `package.json`'s public `exports` map (`package.json:11-19`) and the
  `dsh.bundle.patch` manifest linkage (`package.json:71-74`) are not described, although they are
  the package's consumer-facing entry-point contract.
- Missing coverage — exported `parseSkillDocument` is listed by signature only; its accepted
  frontmatter subset (single-line keys, quoted values, folded/literal block scalars, rejection of
  unsupported lines) is not described (`skills-host.js:40-69`; covered by `test/plugin.test.js`).

## scripts/EGM.md

- Missing coverage — `checkForDrift`'s result object is not enumerated even though the `--json`
  output and the weekly workflow consume its fields: `repository`, `branch`, `pinnedCommit`,
  `targetRef`, `targetCommit`, `drift`, `commitCount`, `comparedFiles`, `affected`, `otherChanged`,
  `compareUrl`, `targetBehind`, `targetStatus`, `compareLimited` (`check-upstream.mjs:235-276`;
  consumer `.github/workflows/upstream-sync.yml:61-91`).
- Missing coverage — lock-shape invariants enforced only by the test suite are not stated in the
  contract: the lock must contain exactly the 26 `ADAPTED_FILES` entries and 16 `VENDORED_FIXTURES`
  entries, with no duplicate mappings (`test/upstream-sync.test.js:41-46`,
  `test/upstream-sync.test.js:50-69`, `test/upstream-sync.test.js:90-117`).
- No doc-to-code hallucination found: all cited symbols, flags, exit codes and cited line ranges
  match `scripts/check-upstream.mjs`.

## examples/EGM.md

No drift detected.

## examples/e2e-verification/EGM.md

No drift detected.

## examples/e2e-verification/fixture/EGM.md

No drift detected.

## examples/e2e-verification/fixture/src/EGM.md

No drift detected. One precision fix was applied during this review before the report: the
"contains only `inventory.py`" wording was corrected to "`inventory.py` is the only source file",
because this contract file is now also present in `src/`.

## Related findings outside the generated contracts (for triage)

These existing documents disagree with the current code; they were intentionally not modified by the
bootstrap, to preserve existing documentation.

- `README.md:179` says `node --test` is "49 checks"; the suite defines 50 tests
  (`test/README.md:33`), and the 2026-11-01 run reported 50/50 pass on Node 24.16.0.
- `README.md:207` names the upstream-tracking issue "Upstream EGM changed: re-adapt bundled skills";
  the workflow creates or comments with "Upstream EGM changed: re-vendor bundled skills"
  (`.github/workflows/upstream-sync.yml:62`, `.github/workflows/upstream-sync.yml:93`).
- `scripts/README.md:3-4` says `files` excludes `scripts/`; `package.json` lists `scripts` in `files`
  and the CI pack check requires `scripts/check-upstream.mjs` (`.github/workflows/ci.yml:72`), so the
  directory ships. `scripts/EGM.md` already records the verified packaging fact.
- `resources/README.md:15` links `../docs/index.md`; this package intentionally does not ship
  upstream's `docs/` tree, so that link is dead here. It is a verbatim upstream file, not drift in
  the generated contracts.

Verification evidence for this report: 168/168 inline line citations in range, all relative links
resolved, 7/7 recorded artifact hashes matched `E2E-VERIFICATION.md`, `node --test` reported 50/50
pass (in-process isolation; the agent sandbox blocks the runner's child-process spawn), and
`npm pack --dry-run` packed 46 files with no `test/`, `examples/` or `.github/` leaks.

## Resolution update — 2026-11-01 (documentation cleanup pass)

All five missing-coverage findings above were addressed in the working tree after this report was
written; the historical findings are retained unchanged for audit.

- `EGM.md`: added the `egm_reviewer` tool contract (required `{ description, prompt }` inputs,
  `{ kind: 'activation', subagentId }` output, one fresh `spawn` child in `egm-reviewer` with
  `maxDepth: 1`), documented the `package.json` `exports` map and `dsh.bundle.patch` linkage, and
  described `parseSkillDocument`'s accepted frontmatter subset.
- `scripts/EGM.md`: enumerated the `checkForDrift` result fields and added the lock/test agreement
  invariant (exact 26-file / 16-fixture mappings in order, schema and identity fields, no duplicate
  `files` mapping; `readLock` itself does not enforce the cross-file counts).
- Related pre-existing drift: corrected `README.md`'s "49 checks" to 50 and the upstream-tracking
  issue title to "re-vendor bundled skills"; corrected `scripts/README.md` to state that `scripts/`
  ships. `resources/README.md` was intentionally left untouched as vendored upstream content.
  `scripts/README.md` still repeats the stale "re-adapt bundled skills" issue title at lines 39-41;
  it was outside the requested narrow scope and remains for owner triage.

Re-verification after the cleanup: 245/245 relative links resolved across the six contracts,
181/181 inline `file:line` citations in range, 7/7 recorded artifact hashes still matched,
`node --test` 50/50 pass, and `npm pack --dry-run` packed 46 files with no `test/`, `examples/`,
`.github/` or `.dev/` leaks. No vendored upstream file, application code, test, dependency or
lockfile was modified.

## Final resolution — 2026-11-01 (commit pass)

- `scripts/README.md` line 41: corrected the remaining stale issue title "re-adapt bundled skills"
  to "re-vendor bundled skills"; the open item recorded in the previous resolution note is closed.
- No open documentation-drift item remains from the findings recorded above. The only dead link left
  in the repository is `resources/README.md`'s reference to upstream's unshipped `docs/index.md`,
  which is vendored upstream content and intentionally unchanged.
- Final pre-commit verification: the complete `node --test` suite passed 50/50 (in-process
  isolation, because the local sandbox blocks the runner's child-process spawn), and no vendored EGM
  content, application code, test, dependency or lockfile was modified.
