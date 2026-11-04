# Changelog

## Unreleased

- Reviewer prompts now name the persona file with a `Persona:` path and the reviewer reads it
  itself, the documented approach for hosts without registered persona agents.
- Goldfish reviewers are single-use: the adapter refuses a follow-up message or resume, and a
  truncated or unusable answer is replaced by a fresh `egm_reviewer` with the full prompt.
- Review stages 5–9 stay sequential in every mode, and the document under review is not edited
  while a stage's reviewers run.
- Ship the opt-in `adapters/dsh/agent-presets.patch.yml` for profiles without an agent-preset
  registry: `web` needs nothing, while `headless` and `sdk` add the patch at launch. The package
  does not compose or repair a registry automatically.
- Move the DSH host layer into `adapters/dsh/` with the export keys, plugin names and patch names
  unchanged; `package.json` stays at the package root.
- Add [docs/dsh.md](docs/dsh.md) as the host guide and [TESTING.md](TESTING.md) as the requirement
  map, commands, harness test record and limits.
- Check every packed vendored member against the lock's raw SHA-256 bytes, in addition to the
  LF-normalized content gate.

## 0.2.4 — 2026-11-03

- Sync upstream EGM to `113a3af`, including context, identity and review-rule updates
  plus the review `GoldfishContext` URL-file handling fix.
- Fail closed on reviewer isolation setup errors and broken presets.
- Add keyless replay tests for isolation, read-only enforcement and brainstorm/draft/review workflows.
- Update CI actions and add Linux Node 24/Python 3.12 integration coverage.
- Rewrite README for clearer onboarding and refresh verification docs.
- The preamble maps next-step invocations to DSH `/egm-*` forms, keeps Stage 6 design-only, retains
  an empty supplemental `GoldfishContext` as provided input, and states the linked-resource approval
  and realpath rules. Review intake saves each approved `GoldfishContext` URL page as a file and
  passes its absolute path; a page that cannot be saved requires a local copy, or is omitted with a
  notice in an unattended run. These are model instructions: neither reading lists nor
  implementation file boundaries are host-enforced filesystem allowlists. Installed filesystem
  source preserves unconfined reads; the working directory is a resolution default, not containment.
  That is source evidence, not a new outside-read test.
- Reviewer creation installs the call guard before hiding tools and aborts on isolation setup
  errors; a broken declared preset is rejected. Plugins that publish late or scope-local tools can
  leave them visible, but non-allowlisted calls are denied. Names on the read allowlist are trusted
  capabilities: a malicious replacement of an allowed read tool is outside this boundary.
- The Python integration suite exercises the installed tarball through the public SDK with the
  locked Harness 0.2.1-rc.5 services; [TESTING.md](TESTING.md) maps each requirement to its check
  and records current results and limits.

## 0.2.3 — 2026-11-02

- Upstream pin refresh (`403d888…` → `a119668…`); no content changes.
- Docs and CI only: Chinese README, diagrams, [TESTING.md](TESTING.md) (then `VERIFICATION.md`); no
  runtime changes.

## 0.2.2 — 2026-11-01

- `engines.node` bounded to the CI-tested range `>=22 <25`.

## 0.2.1 — 2026-11-01

- Docs and packaging: npm and DSH Plugin Market badges, install example, `EGM.md` contracts.

## 0.2.0 — 2026-10-31

- First release: seven `/egm-*` skills, nine personas and shared `resources/**`, vendored verbatim
  from `google/elephant-goldfish-model` at `403d888…`.
- `egm_reviewer` and the read-only `egm-reviewer` preset: fresh spawn child, read/search tools
  only, depth 1.
- DSH integration layer, upstream hash pinning, CI, and the recorded end-to-end run (history
  summarized in [TESTING.md](TESTING.md)).
- Apache-2.0 attribution in [NOTICE](NOTICE) and [docs/dsh.md](docs/dsh.md).
