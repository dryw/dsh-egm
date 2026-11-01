# Examples

Repository-only material: none of this directory is shipped in the npm tarball, and `node --test`
does not treat it as package content.

## `e2e-verification/` — a recorded end-to-end EGM run

A real verification run of `dsh-egm` 0.2.0 on **2026-10-31**, using DeepSeek Harness `0.2.1-rc.5`
in the `desktop` profile. It exercises the three commands the upstream EGM support criteria name:
`/egm-brainstorm`, `/egm-draft`, `/egm-review`.

The fixture project is tiny (an in-memory Python inventory service) so the artifacts stay readable:

| Path | What it is |
|---|---|
| `fixture/` | The scratch project the run worked on (`src/inventory.py`, tests, README, `AGENTS.md` with `EGM artifact directory`). |
| `concepts_brief.md` | Brainstorm output: six Goldfish lenses, merged into a decision-ready brief. |
| `DESIGN.md` | Draft output: a design document in the vendored EGM template shape. |
| `reviews/` | Review output: zoom-out, comprehension, critic, intermediate zoom-out, implementation readiness. |

What it demonstrates:

* the skills load from the **verbatim upstream text** plus the plugin's DeepSeek Harness preamble;
* each reviewer was a **fresh read-only child** started with `egm_reviewer` in the enforced
  `egm-reviewer` preset — 17 activations, never `subagent`, never `subagent_fork`;
* findings were resolved between stages, and the review protocol's one-re-audit cap was honoured
  (the terminal readiness state is recorded honestly in `reviews/implementation_readiness_report.md`);
* artifacts were written to the configured `EGM artifact directory` (`.dev/docs`), not the
  repository root.

Recorded concessions: owner decisions were taken synthetically, draft section gates were
auto-approved, and the review used the supported “Feature spec only” then “Implementation plan only”
presets rather than one interactive five-stage session. No implementation code was written; this
verifies the design workflow, not the fixture feature.

The full evidence record (commands, reviewer activation ids, environment, SHA-256 hashes) is
[`E2E-VERIFICATION.md`](../E2E-VERIFICATION.md) in the repository root. The copied artifacts here are
byte-identical to the recorded run; `concepts_brief.md` is
`aeff9ee811a5d2e75b08c5c4ee473d0ffa4f9f7e793a2760f754391c26a53e8e` and `DESIGN.md` is
`1f09cef88460df9d88e3dacd91bf191093ece08b0c0455252d4c6e8844597fa0`.

### Reproduce it

1. Copy `fixture/` to a scratch directory outside any real repository.
2. Install the plugin: `dsh plugin --profile web add dsh-egm` (or the GitHub/local form in the
   README).
3. In that directory, run `/egm-brainstorm Add low-stock alerts to this inventory service.`, follow
   the brainstorm gates, then `/egm-draft`, then `/egm-review docs/designs/low-stock-alerts/DESIGN.md`.
