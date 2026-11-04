# Changelog

## 0.2.4 — 2026-11-03

- Sync upstream EGM to `113a3af`, including context, identity and review-rule updates
  plus the review `GoldfishContext` URL-file handling fix.
- Fail closed on reviewer isolation setup errors and broken presets.
- Add keyless replay tests for isolation, read-only enforcement and brainstorm/draft/review workflows.
- Update CI actions and add Linux Node 24/Python 3.12 integration coverage.
- Rewrite README for clearer onboarding and refresh verification docs.

## 0.2.3 — 2026-11-02

- Upstream pin refresh (`403d888…` → `a119668…`); no content changes.
- Docs and CI only: Chinese README, diagrams, [VERIFICATION.md](VERIFICATION.md); no runtime
  changes.

## 0.2.2 — 2026-11-01

- `engines.node` bounded to the CI-tested range `>=22 <25`.

## 0.2.1 — 2026-11-01

- Docs and packaging: npm and DSH Plugin Market badges, install example, `EGM.md` contracts.

## 0.2.0 — 2026-10-31

- First release: seven `/egm-*` skills, nine personas and shared `resources/**`, vendored verbatim
  from `google/elephant-goldfish-model` at `403d888…`.
- `egm_reviewer` and the read-only `egm-reviewer` preset: fresh spawn child, read/search tools
  only, depth 1.
- DSH integration layer, upstream hash pinning, CI, and the recorded end-to-end run
  ([E2E-VERIFICATION.md](E2E-VERIFICATION.md)).
- Apache-2.0 attribution in [NOTICE](NOTICE) and [ADAPTATIONS.md](ADAPTATIONS.md).
