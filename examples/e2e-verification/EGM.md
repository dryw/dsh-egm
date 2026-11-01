# End-to-end EGM verification run (`e2e-verification`)

## Overview

Recorded evidence from one end-to-end run of the vendored EGM workflow: a brainstorm brief, a draft design document, and the output of a five-stage review, produced on 2026-10-31 by `dsh-egm` 0.2.0 on DeepSeek Harness 0.2.1-rc.5 (desktop profile) against the fixture project in `fixture/` ([examples/README.md](../README.md), [E2E-VERIFICATION.md](../../E2E-VERIFICATION.md)). Everything in this directory is verification material, not production code, and the recorded documents are evidence rather than component contracts. The copies are byte-identical to the recorded run; their SHA-256 values are listed in [E2E-VERIFICATION.md](../../E2E-VERIFICATION.md).

## Subdirectories & Boundaries

- fixture: [./fixture/EGM.md](./fixture/EGM.md) — the scratch project the run worked on: an in-memory Python inventory service with its source contract in [src/EGM.md](./fixture/src/EGM.md); its `tests/` directory is excluded test-only code.
- DESIGN.md: [./DESIGN.md](./DESIGN.md) — non-contract draft output: the low-stock alerts design document (`Status: Draft`, dated 2026-10-31) from `/egm-draft`.
- concepts_brief.md: [./concepts_brief.md](./concepts_brief.md) — non-contract brainstorm output: six Goldfish lenses merged into a decision-ready brief from `/egm-brainstorm`.
- reviews: non-contract recorded review reports (stages 5–9 of `/egm-review`), linked directly:
  - [zoom_out_report.md](./reviews/zoom_out_report.md) — Stage 5, initial zoom out.
  - [comprehension_report.md](./reviews/comprehension_report.md) — Stage 6, comprehension.
  - [critic_report.md](./reviews/critic_report.md) — Stage 7, critic.
  - [intermediate_zoom_out_report.md](./reviews/intermediate_zoom_out_report.md) — Stage 8, intermediate zoom out.
  - [implementation_readiness_report.md](./reviews/implementation_readiness_report.md) — Stage 9, implementation readiness; records the re-audit cap and the terminal NO-GO with post-cap fixes.
