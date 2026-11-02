# Verification

`dsh-egm` claims that Goldfish reviewers are read-only because the harness enforces it, not because a
prompt asks the model to behave. This page collects the evidence for that claim, the commands that
reproduce it, and the checks that back the package's guarantees. The page is written for
`dsh-egm` 0.2.3.

## Upstream pin and provenance

- Upstream: [`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model),
  pinned at commit `a119668d7dc5d558664ba711d4671d11fb7270a8` on `main` in
  [upstream.lock.json](upstream.lock.json).
- The lock records a SHA-256 for **26 adapted files** (seven `skills/*/SKILL.md` files, nine
  `agents/*.md` personas, the `resources/**` shared documents, and the draft/bootstrap reference
  files) and for **16 vendored test fixtures**. The adapter modules (`skills-host.js`,
  `reviewer-host.js`, `reviewer-tools.js`, `cordis.patch.yml`) are authored for DeepSeek Harness and
  are not part of the vendored tree; [ADAPTATIONS.md](ADAPTATIONS.md) describes the split.
- The 0.2.3 refresh moved the pin from `403d8881d62022490637d740657b33f01e321ea8` to
  `a119668...` and changed no hash. The range contained two upstream commits, and none of the 26
  adapted files or 16 fixtures changed: 0.2.3 is a lock-pin refresh, not a re-adaptation, and the
  vendored bytes are identical to 0.2.2.
- `scripts/check-upstream.mjs` hashes the upstream file list from GitHub (or a local upstream
  checkout) and normalizes CRLF to LF before hashing, so a Windows checkout records the same hash as
  GitHub's bytes. The hash tests hash the local vendored tree against the lock.

Run from the package root:

| Command | Expected result |
|---|---|
| `node scripts/check-upstream.mjs` | Prints `Up to date: upstream has not moved since the pinned commit.` and exits 0 at the pinned commit. Exit 1 means drift; exit 2 means the check itself failed. |
| `node --test` | Runs the full suite, including the per-file hash parity in [test/upstream-sync.test.js](test/upstream-sync.test.js) and the content-parity checks in [test/upstream-parity.test.js](test/upstream-parity.test.js). |

`node scripts/check-upstream.mjs --update-lock` is the only path that rewrites the lock, and it is a
deliberate maintainer step (see [scripts/README.md](scripts/README.md)).

## How reviewer isolation is enforced

The reviewer persona in [cordis.patch.yml](cordis.patch.yml) says it is read-only. That sentence is a
courtesy to the model, not the guarantee. The guarantee is host-side and has four independent parts,
all in this repository:

1. **Preset composition is static and minimal.** The `egm-reviewer` agent preset in
   [cordis.patch.yml](cordis.patch.yml) composes only a persona prefix, `@deepseek-ai/dsh-tool-fs`
   with `read: true`, `readImage: true`, `write: false`, `edit: false`, file search, basic
   compaction, and this package's guard. No shell, terminal, command, job, schedule, goal, todo,
   user-question, presentation, session-reading, or subagent/delegation plugin is composed into it.
2. **The tool surface is default-deny.** [reviewer-tools.js](reviewer-tools.js) defines
   `ALLOWED_TOOLS` — `read`, `read_image`, `glob`, `grep`, and the `ops_*` readers
   (`ops_read_files`, `ops_read_pdf`, `ops_read_docx`, `ops_read_table`, `ops_glob`, `ops_grep`,
   `ops_inspect_local_file`, `ops_result`). `hideNonReviewerTools()` computes every tool visible in
   the reviewer scope that is not on that list and hides it with `tools.restrict({ deny })`. Global
   tools registered later by another plugin are hidden too, unless they are on the allowlist; a tool
   that a plugin publishes in the reviewer's own scope can stay visible, and the call-time guard then
   rejects any call to it.
3. **Tools are denied again at call time.** The same file registers `ctx.tools.guard`, which rejects
   any invocation whose name is not allowlisted with a read-only error. The schema deny list and the
   call guard are independent layers, and [test/reviewer.test.js](test/reviewer.test.js) asserts
   that the guard denies non-allowlisted calls.
4. **The spawn path is fixed and depth-limited.** [reviewer-host.js](reviewer-host.js) registers the
   only supported way to start a reviewer, `egm_reviewer`. It hard-codes the preset `egm-reviewer`,
   starts a `spawn` activation (never `subagent` or `subagent_fork`, so the child does not inherit
   the parent conversation), sets `maxDepth: 1` so the reviewer cannot delegate further, and
   re-applies the agent-scope deny list to every reviewer child through the `agent/created` listener.
   It fails closed when the agent-presets service is missing, no `spawn` provider is composed, the
   preset is not installed, or the prompt is empty.

The unit tests for these layers are in [test/reviewer.test.js](test/reviewer.test.js): preset
selection, the `spawn` provider, `agentPreset: 'egm-reviewer'`, `maxDepth: 1`, the three fail-closed
support-error configurations, the agent-scope deny list, and the guard's allow/deny decisions.

The human gate is also part of the design: the package adds no implementation tool and no
auto-implement path, and the EGM workflow ends at a human-approved specification before any code is
written. Nothing in `dsh-egm` starts implementation on its own.

`engines.dsh` in [package.json](package.json) is `>=0.2.1-rc.5 <0.3.0`. The enforcement above uses the
tool and agent-preset API of the DSH 0.2.x line; a different DSH version is untested, and the
guarantee inherits that version's implementation of `tools.restrict`, `tools.guard` and `spawn`
depth limits.

## What is verified

| Check | Evidence | Reproduce with |
|---|---|---|
| Upstream pin and hash parity | [upstream.lock.json](upstream.lock.json) pins `a119668...`; every recorded file matches its hash; the drift check reports up to date | `node --test`; `node scripts/check-upstream.mjs` |
| Reviewer isolation tests | [test/reviewer.test.js](test/reviewer.test.js) covers §1–§4: preset selection, the `spawn` path and `maxDepth: 1`, fail-closed support errors, the deny list and the call-time guard | `node --test test/reviewer.test.js` |
| Preset shape audit | The `egm-reviewer` preset matches §1 (read, read-image, search, compaction and the guard only) | read [cordis.patch.yml](cordis.patch.yml) and [reviewer-tools.js](reviewer-tools.js) |
| Recorded end-to-end run | [E2E-VERIFICATION.md](E2E-VERIFICATION.md): 17 read-only reviewer activations across `/egm-brainstorm`, `/egm-draft` and `/egm-review`, DSH `0.2.1-rc.5` desktop profile, 2026-10-31 (plugin 0.2.0) | the record and its artifact hashes in [examples/e2e-verification/](examples/e2e-verification/) |
| CI | Three jobs in [.github/workflows/ci.yml](.github/workflows/ci.yml): Ubuntu Node 22, Ubuntu Node 24, Windows Node 24. Each runs `node --test`; the pack check runs on every job | [.github/workflows/ci.yml](.github/workflows/ci.yml) |
| npm tarball contents | The CI pack check parses `npm pack --dry-run --json` and asserts required runtime and documentation files are present while `test/`, `examples/` and `.github/` are absent | `npm pack --dry-run --json` |
| Test suite | `node --test` runs the full suite covering the manifest, engines, resources, skills, reviewer isolation, upstream parity and hashes, hygiene, UI metadata, and extra-file integrity ([test/integrity.test.js](test/integrity.test.js)); the count lives in [test/README.md](test/README.md) | `node --test` |
| Upstream drift workflow | [.github/workflows/upstream-sync.yml](.github/workflows/upstream-sync.yml) runs daily and on demand; opens or refreshes a re-vendor issue on drift, and a second failure issue if the check errors; report-only | Actions tab, or `node scripts/check-upstream.mjs` locally |

