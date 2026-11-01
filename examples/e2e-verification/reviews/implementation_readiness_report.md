# Stage 9 — Implementation Readiness Test

* Reviewed: `docs/designs/low-stock-alerts/DESIGN.md`, Detailed Implementation Plan
* Standard: `resources/document_standards/implementation-readiness-standard.md`
* Reviewers (fresh read-only Goldfish): `implementation_readiness`, `codebase_details`
* Preset: EGM review "Implementation plan only" (stage 9), run after the Feature-spec preset
  (stages 5-8) on the same document.

## First readiness run — NO-GO

Blockers found: no ledger DDL/date serialization; `AlertLedgerError`/`AlertSinkError` appeared
nowhere; `StockSnapshot` had no home or fields; no implementation phases/checkpoints; JSONL
`alert_date` encoding unspecified; “removed SKUs are ignored” was unimplementable because the store
has no removal API; `items_scanned` semantics were ambiguous.

## Revision

The Detailed Implementation Plan was rewritten with: a four-phase work plan and per-phase
checkpoints; a ledger schema contract (table, key, `YYYY-MM-DD` storage, `CREATE TABLE IF NOT
EXISTS`); a three-class error API; a frozen `StockSnapshot` with `items` and a shared
`select_low_stock` helper; the exact JSONL line format; an explicit logger format; enumerated test
cases per phase, including the SQLite race and busy-timeout harnesses; and a temporary-directory
integration check.

## Re-audit — reviewed revised content, residual NO-GO (cap reached)

Both reviewers confirmed they reviewed the revised content. Residual blockers:

1. `AlertLedger` lifecycle was unspecified (no `close()`, no context manager, reopen undefined).
2. The flow diagram still named `AppOutputError` instead of `AlertSinkError`.
3. `AlertLedgerError` “carrying counters” had no attribute or constructor field.
4. Nothing required `JsonlAlertSink.append` to translate `OSError` into `AlertSinkError`.
5. Phase 2 asserted an emit-failure count even though counting lives in the Phase 3 sweep.
6. The busy-timeout test’s ordering relative to schema creation was unspecified.
7. The racing-connections and absent-SKU tests still needed invented harnesses.

## Protocol outcome and post-audit resolutions

The EGM review protocol permits one re-audit per stage; that re-audit has been used. The residual
findings are therefore recorded here as the terminal audit state, and the author resolved them in
the design after the cap (not re-audited):

* ledger lifecycle: constructor opens the connection and creates the schema; `close()` is idempotent;
  context-manager support; reopening means a new instance on the same path;
* diagram error class corrected to `AlertSinkError`;
* `AlertLedgerError(message, *, counters=None)` with a `.counters` attribute; `AlertCounters` moved
  to Phase 1 so the error can reference it;
* `JsonlAlertSink.append` wraps `OSError` in `AlertSinkError`;
* Phase 2 tests now cover only line formatting and `OSError` translation; emit-failure accounting
  moved to Phase 3 where the sweep counts it;
* busy-timeout test constructs the ledger first, then holds a write transaction on a second
  connection before calling `claim()`;
* racing test names two threads each with their own `AlertLedger` and a barrier; the absent-SKU test
  names an empty `Inventory()` and asserts `items_scanned == 0`.

## Verdict

**NO-GO at the re-audit cap; residual findings resolved in the design after the cap and recorded
here.** The review protocol is closed for this design. Implementation should re-run this stage once
when the code exists or when a new review round opens.
