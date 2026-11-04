# EGM end-to-end verification record — dsh-egm 0.2.0

This is historical evidence. It was not rerun as a live-model workflow for the
unreleased upstream 464db candidate. See [VERIFICATION.md](VERIFICATION.md) for the current keyless native-replay gate
and its evidence limits.

Verification for upstream EGM's support criterion: `/egm-brainstorm`, `/egm-draft` and `/egm-review`
run end to end through the DeepSeek Harness plugin install, with evidence.

* Date: 2026-10-31
* Harness: DeepSeek Harness `0.2.1-rc.5` (desktop profile)
* Plugin: `dsh-egm` `0.2.0`, installed from `<plugin checkout>` (linked checkout)
* Plugin state: rows `include:egm` (`dsh-egm/skills-host`), `include:egm-reviewer-tool`
  (`dsh-egm/reviewer-host`) and `include:preset-egm-reviewer` all `active`
* Fixture project: `<fixture project>` (outside the plugin and outside any real
  repository); `AGENTS.md` sets `EGM artifact directory: .dev/docs`
* Reviewers: 17 fresh read-only child agents, all started with the plugin's `egm_reviewer` tool in
  the enforced `egm-reviewer` preset; never `subagent`, never `subagent_fork`

## Commands exercised

### 1. `/egm-brainstorm` — concept for low-stock alerts

* Skill: vendored upstream `skills/egm-brainstorm/SKILL.md` plus the plugin's rendered
  `<dsh_integration>` preamble.
* Step 1 problem drilling: synthetic owner answers recorded (manual spreadsheet checks today;
  stockouts found when orders fail; stdlib-only; idempotent alerts; no false positives under
  concurrent updates; Python 3.10+). Readiness gate answered “Review with Goldfishes”.
* Step 2 direct dispatch (the skill's documented fallback when the harness cannot nest subagents):
  six lenses launched in parallel with `egm_reviewer`:

| Lens | Persona | Activation |
|---|---|---|
| design | `agents/design_critic.md` | `activation 1` |
| codebase details | `agents/codebase_details.md` | `activation 2` |
| zoom out | `agents/zoom_out.md` | `activation 3` |
| comprehension | `agents/comprehension.md` | `activation 4` |
| implementation readiness | `agents/implementation_readiness.md` | `activation 5` |
| structural | `agents/structural.md` | `activation 6` |

* Findings (all six agreed): no durable dedupe state; the concurrency claim is unprovable without a
  lock shared by stock mutation and the sweep; no alert sink named; implicit day boundary/clock;
  delivery-failure policy undefined; half the feature already exists.
* Artifact: `.dev/docs/concepts_brief.md` (sha256 `aeff9ee8…a53e8e`), written to the configured
  artifact directory rather than the repository root.

### 2. `/egm-draft` — design document

* Skill: vendored upstream `skills/egm-draft/SKILL.md`; document follows
  `skills/egm-draft/references/design_doc.md`.
* Implemented the brainstorm decisions (SQLite ledger as durable authority, JSONL sink,
  at-most-once per item per UTC day, injected clock, explicit sweep trigger, lock-covered sweep).
* Section approval gates auto-approved for this autonomous verification run (recorded concession).
* Artifact: `docs/designs/low-stock-alerts/DESIGN.md` (sha256 `1f09cef8…597fa0`), with
  `Author`, `Status: Draft`, `Date`, all template sections, a Risks & Mitigations section, and the
  `## Detailed Implementation Plan` semantic-split heading.

### 3. `/egm-review` — five stages across two supported presets

Feature-spec preset (stages 5-8):

| Stage | Reviewers (activation) | Report |
|---|---|---|
| 5 Initial Zoom Out | zoom out (`activation 7`) | `reviews/zoom_out_report.md` |
| 6 Comprehension | comprehension (`activation 8`) | `reviews/comprehension_report.md` |
| 7 Critic | design (`activation 9`), structural (`activation 10`), style (`activation 11`) | `reviews/critic_report.md` |
| 8 Intermediate Zoom Out | zoom out (`activation 12`, reviewed pre-resolution content and said so; re-audit `activation 13` confirmed revised content) | `reviews/intermediate_zoom_out_report.md` |

Implementation-plan preset (stage 9):

| Stage | Reviewers (activation) | Report |
|---|---|---|
| 9 Implementation Readiness | implementation readiness (`activation 14`; re-audit `activation 16`), codebase details (`activation 15`; re-audit `activation 17`) | `reviews/implementation_readiness_report.md` |

* Findings were resolved in the design between stages (lock interface, canonical sweep signature,
  ledger/sink authority split, risks, restored alternatives, resolved open questions; then ledger
  DDL, error API, snapshot type, phases and enumerated tests for readiness).
* Stage 9's single permitted re-audit still returned NO-GO on residual precision items (ledger
  lifecycle, error counters field, `OSError` translation, test-harness wording). Per EGM's re-audit
  cap those are recorded in the readiness report, resolved in the design after the cap, and the
  review round is closed.

## Result

| Check | Result |
|---|---|
| Three commands ran end to end through the installed plugin | pass |
| Skills loaded from the vendored upstream text with the DSH preamble | pass |
| Reviewers started only through the enforced read-only `egm_reviewer` path | pass (17 activations) |
| Brainstorm produced a brief; draft produced a design; review produced stage reports | pass |
| Findings resolved and terminal state documented | pass (readiness residuals recorded + fixed post-cap) |
| Artifacts outside the source repository / configured artifact dir | pass |

## Concessions recorded

* Synthetic owner decisions replaced a live interview (autonomous verification run).
* Draft section-approval gates were auto-approved.
* Review used supported presets (“Feature spec only” then “Implementation plan only”) rather than one
  interactive five-stage session; all five stages ran.
* No implementation code was written; this verifies the design workflow, not the fixture feature.
* Stage 9's terminal verdict is NO-GO at the re-audit cap with post-cap fixes, which is a recorded
  review outcome rather than a pass.

## Artifacts and hashes

| Artifact | SHA-256 |
|---|---|
| `examples/e2e-verification/concepts_brief.md` | `aeff9ee811a5d2e75b08c5c4ee473d0ffa4f9f7e793a2760f754391c26a53e8e` |
| `examples/e2e-verification/DESIGN.md` | `1f09cef88460df9d88e3dacd91bf191093ece08b0c0455252d4c6e8844597fa0` |
| `examples/e2e-verification/reviews/zoom_out_report.md` | `ffc708d1a002d2e59f51acd92af9e0f31be10f94122f1aad4258f3f26b6265ca` |
| `examples/e2e-verification/reviews/comprehension_report.md` | `ba2bc0ea87c7ecb0746922675788a350b5dbe445d68bce54b31f55d3e6fe84b3` |
| `examples/e2e-verification/reviews/critic_report.md` | `9a969c43223265e808b931043baa6d98865f12912314f59967b07467c32111ab` |
| `examples/e2e-verification/reviews/intermediate_zoom_out_report.md` | `bb5e6c0ac0194628682fde16842bdab7f114b2e71e06cb44b280e8123346575c` |
| `examples/e2e-verification/reviews/implementation_readiness_report.md` | `a80edb908b9f7812dd0767441cd3ebc95599ee0d10cb5f2d1f61ee0a7df4697e` |

Hashes describe the LF-normalized copies committed under `examples/`: the Git repository
normalizes line endings to LF, while the original Windows run produced CRLF files in the fixture.
