# Upstream 113a3af follow-up assessment

Assessed 2026-11-03. Source: google/elephant-goldfish-model,
`464db031e7dd1b9a79803ac8ea45f55c7c20c5bc` → `113a3afc44e8f4f54722d7150d5701f65cc8ef7f`.
One commit / eight changed files; two adapted runtime files. Tracking:
https://github.com/dryw/dsh-egm/issues/3 . The 0.2.4 release
branch re-vendors directly to `113a3af`, which already contains the `464db031`
content, so the `a119668` → `464db031` tracking issue is superseded rather than
implemented as a separate step.

## Change

`113a3af` — "fix(review): save GoldfishContext URLs as files (#289)". Before the
first context-consuming review stage, the Elephant now saves the raw page of each
approved `GoldfishContext` URL as a new file and passes its absolute path instead
of the URL. If a page cannot be saved it asks for a local copy; in a headless run
it omits the page, says so, and keeps going. The review-loop skill carries the
same rule before its first round.

| Upstream file | Effect in this package |
|---|---|
| `skills/egm-review/SKILL.md` | Review intake and reviewer prompts carry saved file paths instead of URLs. Vendored verbatim into `skills/egm-review/SKILL.md` and its skill baseline fixture. |
| `skills/egm-review-loop/SKILL.md` | The review loop saves `GoldfishContext` URL pages before its first round. Vendored verbatim into `skills/egm-review-loop/SKILL.md` and its skill baseline fixture. |
| `skills/egm-review/test_scenarios.yaml`, `skills/egm-review-loop/test_scenarios.yaml` | New upstream scenario assertions; refreshed as verbatim fixtures. |
| `distributions/claude/**`, `skills/*/TEST.md` | Not adapted or vendored here; no action. |

## Verification scope

- All 42 mapped artifacts were compared with the target Git objects
  (`EGM_SOURCE=<checkout> node --test`); the lock records the new SHA-256 values.
- `node --test` and `node scripts/check-upstream.mjs` pass locally.
- The hosted CI gate runs the same suite plus the Linux Node 24 / Python 3.12
  keyless native replay integration on this release.
- No new live-model run. The change is model instruction text, and the native
  replay scenarios script model responses. The local 464db evaluation in
  [RESULTS-464DB.md](RESULTS-464DB.md) remains historical evidence for the
  integration layer.
