# Stage 5 — Initial Zoom Out Review

* Reviewed: `docs/designs/low-stock-alerts/DESIGN.md` (full file)
* Standard: `resources/document_standards/zoom-out-standard.md`
* Reviewer: fresh read-only Goldfish (`egm_reviewer`, `egm-reviewer` preset), 2026-10-31
* Verdict: no blockers; five findings.

## Findings

1. **Major — lock interface missing (design §Technical Plan, §Detailed Implementation Plan).**
   The sweep needs `Inventory`'s private lock to span snapshot → claim → emit, but no interface is
   designed for cross-module lock access. The inventory should expose a locked snapshot or a context
   manager that the sweep uses, instead of reaching into the store's lock.
2. **Major — implementation altitude.** Module-level `threading.RLock`, `BEGIN IMMEDIATE`,
   `INSERT OR IGNORE` and exact signatures are statements, not contracts. State the guarantee and
   the observable boundary; let the implementation choose the statements.
3. **Major — duplicate fact store.** `alerts.jsonl` already records `(sku, alert_date)` durably, so
   the SQLite ledger duplicates the same fact and adds a second open-failure path. Either justify the
   ledger as the authority and the sink as best-effort output, or dedupe from the sink.
4. **Nit — signature contradiction.** The CUJ call `run_low_stock_alerts(inventory, ledger, sink,
   today)` contradicts the plan's `(…, threshold=…, today_provider=None)`.
5. **Nit — speculative branch.** “Unknown or removed SKUs are ignored” is unreachable under the
   sweep's own lock.
6. **Nit — lock scope.** Holding the inventory lock across SQLite I/O plus the file append couples
   alert latency into the domain store's critical section.

## Resolution

Addressed in the revised design: a locked snapshot context manager on `Inventory`; contracts stated
in terms of guarantees and injected ports; the SQLite ledger named as the authority with the JSONL
sink explicitly best-effort; one canonical sweep signature; the snapshot under lock taken as a value;
the sweep holds the lock across claim and emit (accepted scalability limit, recorded in Risks); the atomic-claim contract comes first and the SQL statements are illustrative; speculative branches removed.
