# Stage 7 — Critic Review

* Reviewed: `docs/designs/low-stock-alerts/DESIGN.md` (feature range)
* Standard: `resources/document_standards/feature-spec-standard.md`
* Reviewers (fresh read-only Goldfish): `design_critic`, `structural`, `style`
* Verdict: two blockers, four majors; no nit is individually blocking.

## Blockers

1. **Blocker — lock-sharing contract (design_critic).** The plan adds a lock inside `Inventory`'s
   public methods only, while the sweep must hold it across snapshot → claim → emit. There is no
   accessor or context manager for `src/alerts.py` to acquire it, so the central concurrency
   guarantee is unimplementable as written. Define the lock-sharing interface explicitly.
2. **Blocker — missing Risks & Mitigations (design_critic, structural).** The standard mandates
   failure modes, security implications, scalability limits and their mitigations. The NFR bullets
   do not supply them, and the crash window between ledger commit and JSONL append loses an alert
   without being counted in `emit_failures` (only raised exceptions are), contradicting the
   “auditable loss” claim.

## Majors

1. **Major — ledger errors mid-sweep (design_critic).** `BEGIN IMMEDIATE` hitting `SQLITE_BUSY`
   (no `busy_timeout`) or a disk-full append raises inside the inventory lock, aborting the sweep
   with partial claims and no summary log. State busy handling and failure semantics.
2. **Major — open questions deferred (design_critic).** Ledger location and unbounded retention ship
   as follow-ups; constraints belong in the design.
3. **Major — alternatives were filtered (structural).** The brief weighed nine options; the design
   keeps three and drops the rejected logging sink, `date.today()` clock and in-dict dedupe with no
   note that the set was filtered.
4. **Major — section nesting (structural).** `Additional Resources` is nested under
   `Non-Functional Requirements`, breaking peer-section symmetry.
5. **Major — style filler (style).** “No LLM tokens are involved” in an NFR metric sentence; a
   duplicate-vs-loss value judgment asserted as fact; subjective craft adjectives; mismatched goal
   mood; `compileall` mislabelled as linting.
6. **Major — unverifiable claims (style).** “Merging later is a migration, not a rewrite” predicts
   an unknown migration; “far larger than the alerting feature” is an unmeasured comparison.

## Nits

Signature contradiction (`…, today)` vs `…, today_provider=None`); “integrity check on the row” is
vague (`INSERT OR IGNORE` result); counter naming drift; `DEFAULT_LOW_STOCK` import unstated; ledger
filename absent; bare code spans instead of Markdown links; two headings renamed away from the
standard; irregular horizontal rules and an orphaned `*Drafted with EGM*` footer.

## Resolution

The design was revised before Stage 8: `Inventory.locked_snapshot()` is the only lock interface;
one canonical keyword-only sweep signature; SQLite ledger named as the authority with a documented
best-effort JSONL sink and a counted crash window; `busy_timeout` and per-item failure semantics
added; all nine alternatives restored with rejection reasons; a Risks & Mitigations section added;
open questions resolved with decisions; headings aligned with the standard; style findings removed.
