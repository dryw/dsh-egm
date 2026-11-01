# Stage 6 — Comprehension Test

* Reviewed: `docs/designs/low-stock-alerts/DESIGN.md` (full file)
* Reviewer: fresh read-only Goldfish (`egm_reviewer`), comprehension persona, 2026-10-31
* Verdict: comprehensible, but the public call shape is ambiguous.

## Paraphrase — architecture

The existing in-memory inventory store gains a lock. A new alerts module owns a durable SQLite
ledger and a JSONL sink. An external trigger calls one sweep function that, under the inventory
lock, lists items at or below the threshold, claims each SKU for the current UTC day in the ledger,
and appends one JSON line per newly claimed SKU. Duplicate claims are counted and suppressed, emit
failures are counted and never retried (at-most-once), and the sweep returns counters plus one log
line.

## Paraphrase — intent

Give operators a once-a-day signal for at-risk stock without duplicate noise, without new
dependencies, and with restart-safe deduplication. Detection already exists; the new work is the
durable claim, the sink, and the safe sweep.

## Findings

1. **Major — the sweep call is unrecoverable.** The CUJs and diagram call
   `run_low_stock_alerts(inventory, ledger, sink, today)`, while the plan's fourth positional is
   `threshold` and the date is `today_provider`. What the trigger passes is unclear.
2. **Major — lock acquisition is unexplained.** The plan says the sweep uses the inventory's lock and
   re-enters `low_stock`; nothing states how another module takes a private lock or why re-entrancy
   is safe, and “the same lock” could mean inventory or ledger.
3. **Major — the `AlertSink` protocol is never defined.** Members, constructor and path are missing.
4. **Major — “integrity check on the row”** is the whole duplicate-suppression mechanism and is
   unexplained.
5. **Nit — counter naming drift** (`counters.suppressed` vs `duplicates_suppressed`); `AlertCounters`
   fields are never listed together.
6. **Nit — `DEFAULT_LOW_STOCK`** is used but its import from `inventory.py` is unstated.
7. **Nit — the ledger filename** is never given, and `JsonlAlertSink` has no constructor/path.

## Resolution

Addressed in the revised design: one canonical sweep signature with keyword-only configuration
(`run_low_stock_alerts(inventory, ledger, sink, *, threshold, today_provider)`); a
`locked_snapshot()` context manager that is the only lock interface; explicit `AlertLedger`,
`AlertSink` and `low_stock` snapshot contracts; named ledger path parameter and sink path; a single
`AlertCounters` field list; `DEFAULT_LOW_STOCK` import stated.
