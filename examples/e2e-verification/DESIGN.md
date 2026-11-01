# Low-stock alerts

*   **Author:** Dryw (recorded by the DeepSeek Harness E2E verification run)
*   **Status:** Draft
*   **Date:** 2026-10-31

--------------------------------------------------------------------------------

## Overview

The inventory service can report items at or below a stock threshold, but the report is produced
only when someone asks for it. This design adds a low-stock alert sweep that tells operators about
at-risk items once per day, durably and without duplicate alerts, using only the Python standard
library.

Context: the decisions came from the brainstorm brief at
[concepts_brief.md](../../../.dev/docs/concepts_brief.md); the fixture service is
[inventory.py](../../../src/inventory.py) with two unit tests.

## Problem Statement

Stockouts are discovered when orders fail. The service already has `low_stock(threshold)`, so the
missing piece is not detection: it is a durable claim that a human has been told about an at-risk
item for the day, plus a safe way to emit and observe that notification. The in-memory store has no
locking and no persistence, so naive list-then-emit code duplicates alerts on restart and races
`set_stock`.

## Goals

*   Alert once per item per UTC day when the item is at or below the threshold at sweep time.
*   Survive process restarts without re-alerting the same item on the same day.
*   Make "low at sweep time" a point-in-time fact by covering snapshot, claim and emit with one lock.
*   Expose counters for scanned items, emitted alerts, duplicate suppressions and emit failures.
*   Keep the implementation dependency-free on Python 3.10+.

## Non-Goals

*   Per-item or per-category thresholds.
*   In-process scheduling; a cron/ops trigger calls the sweep.
*   Multi-process or multi-host inventory.
*   Delivery channels beyond an append-only JSONL sink.
*   Alert hysteresis or debounce; the sweep-time threshold comparison is the contract.

## Open Questions

None. The two questions from the brief are resolved: the ledger keeps rows indefinitely for now and
a follow-up maintenance task prunes rows older than 90 days (today's rows must never be pruned), and
the ledger lives in its own `alerts.sqlite3` file beside the JSONL sink, not in a future SQLite
inventory store.

## Critical User Journeys (CUJs)

### CUJ 1: Daily sweep alerts an operator

*   **Given**: the inventory contains item `a` at quantity 2, threshold 5, and today's ledger is empty.
*   **When**: the trigger calls `run_low_stock_alerts()`.
*   **Then**: one JSON line is appended to the sink for `a`, the ledger holds `(a, today)`, and the
    counters report one emitted alert.

### CUJ 2: Second sweep on the same day

*   **Given**: CUJ 1 already ran today and item `a` is still low.
*   **When**: the sweep runs again.
*   **Then**: no new line is appended, the duplicate counter increments, and the ledger is unchanged.

### CUJ 3: Restart before the next sweep

*   **Given**: item `a` was alerted today and the process restarted.
*   **When**: the sweep runs with the same ledger file and the same injected date.
*   **Then**: the durable ledger suppresses the alert; no in-memory state is involved.

## Proposed Architecture

```text
trigger ──▶ run_low_stock_alerts(inventory, ledger, sink, *,
                                  threshold, today_provider, logger)
             │
             ├─ with inventory.locked_snapshot() as snapshot:      ← RLock held
             │      for item in snapshot.low_stock(threshold):
             │          if ledger.claim(today, item.sku):
             │              try: sink.append(record); emitted += 1
             │              except AlertSinkError: failures += 1; log
             │          else: duplicates += 1
             │
             └─ counters returned; one summary log line
```

Component contracts:

*   `Inventory.locked_snapshot()` — the only lock interface. It is a context manager that holds the
    store's re-entrant lock and yields an immutable `StockSnapshot`. `StockSnapshot` is a frozen
    dataclass in `src/inventory.py` holding `items: tuple[Item, ...]`, sorted by SKU; its
    `low_stock(threshold=DEFAULT_LOW_STOCK)` delegates to one module function,
    `select_low_stock(items, threshold)`, which `Inventory.low_stock()` also uses, so threshold
    semantics have one home. All existing public methods keep their signatures and also take the
    lock, so a concurrent `set_stock` cannot change stock between the threshold check and the claim.
*   `AlertLedger(path, busy_timeout=5.0)` — durable authority for "already alerted".
    `claim(alert_date: date, sku: str) -> bool` returns true only for the caller that atomically
    inserted `(alert_date, sku)`; false means another run already claimed it. The schema contract is
    a single table `alert_claims` with `alert_date TEXT NOT NULL` holding the UTC date as
    `YYYY-MM-DD`, `sku TEXT NOT NULL`, and primary key `(alert_date, sku)`, created with
    `CREATE TABLE IF NOT EXISTS`. The atomic claim must be one write transaction whose
    insert-or-ignore outcome is reported; those are contract requirements, and the SQL statements are
    an implementation choice. The constructor opens one connection and creates the schema; `close()`
    closes it idempotently; `with AlertLedger(...) as ledger:` is supported; reopening means
    constructing a new instance against the same path. Ledger failures raise
    `AlertLedgerError(message, *, counters: AlertCounters | None = None)`, whose `.counters`
    attribute carries the counters the sweep had reached (the ledger itself passes `None`).
*   `AlertSink` — best-effort output. `append(record: dict) -> None` appends exactly one UTF-8 line
    of compact JSON with fields `sku` (string), `alert_date` (`YYYY-MM-DD` string), `quantity`
    (integer) and `threshold` (integer), followed by a newline, in append mode. A raised
    `AlertSinkError` is counted in `emit_failures` and logged; it is not retried. `src/alerts.py`
    defines three errors: `AlertsError(Exception)`, `AlertLedgerError(AlertsError)` and
    `AlertSinkError(AlertsError)`. `JsonlAlertSink.append` wraps `OSError` (disk full, permissions)
    in `AlertSinkError` so it can be counted. When `logger=None` the sweep uses
    `logging.getLogger("inventory.alerts")` and writes one INFO line:
    `sweep items_scanned=%d alerts_emitted=%d duplicates=%d emit_failures=%d`.
*   `AlertCounters` — frozen dataclass with exactly `items_scanned` (number of items in the
    snapshot, not only low ones), `alerts_emitted`, `duplicates_suppressed`, `emit_failures`.
*   `run_low_stock_alerts(inventory, ledger, sink, *, threshold=DEFAULT_LOW_STOCK,
    today_provider=None, logger=None) -> AlertCounters` — the single canonical sweep signature. The
    default `today_provider` is the UTC date.

Idempotency contract: **at-most-once per `(sku, alert_date)`**. The ledger claim commits before the
append. A failed append is counted and logged, not retried. A crash between the commit and the
append loses that alert permanently; that is the documented cost of never duplicating, and the
ledger row makes the gap inspectable. A ledger abort carries the counters reached so far. Duplicate daily alerts are treated as the worse failure
because they train operators to ignore the channel; the rationale is recorded here rather than
asserted. `AlertCounters` is defined in Phase 1 because `AlertLedgerError` references it.

Concurrency contract: the sweep holds the inventory lock for the snapshot, the claims and the
appends. This keeps the guarantee simple and testable; it also means ledger and sink latency sits
inside the store's critical section. The fixture is a single-process service with tens of items, so
the latency coupling is accepted and recorded as a scalability limit, not a hidden property.

## Alternatives Considered

### Alternative A: Log line via the `logging` module

*   **Pros**: no new file; structured log fields possible.
*   **Cons**: consuming it as data needs a log-shipping side channel; asserting it in tests needs a
    handler harness.
*   **Reason for Rejection**: the JSONL file is directly consumable and testable.

### Alternative B: Email or HTTP webhook sink

*   **Pros**: reaches people directly.
*   **Cons**: credentials, network failure modes and a configuration format enter this change.
*   **Reason for Rejection**: out of scope; a JSONL consumer can ship the file.

### Alternative C: In-memory dedupe set

*   **Pros**: no file; minimal code.
*   **Cons**: forgets on restart; duplicates after every deployment.
*   **Reason for Rejection**: violates the restart goal.

### Alternative D: Dedupe inside the inventory dictionary

*   **Pros**: one store.
*   **Cons**: mixes alert state into domain records and still forgets on restart.
*   **Reason for Rejection**: no durability, wrong boundary.

### Alternative E: SQLite ledger

*   **Pros**: stdlib, durable, transactional, atomic insert-or-ignore claim, restart-safe.
*   **Cons**: one more file and a small schema to maintain.
*   **Reason for Selection**: it is the only stdlib option that gives an atomic, durable claim.

### Alternative F: `date.today()` inside the sweep

*   **Pros**: no parameter.
*   **Cons**: untestable day boundaries and timezone ambiguity.
*   **Reason for Rejection**: a key bug class is invisible without an injected date.

### Alternative G: In-process timer

*   **Pros**: no external trigger.
*   **Cons**: duplicates the scheduler the deployment already has; makes process lifetime decide
    whether alerts run.
*   **Reason for Rejection**: an explicit sweep call keeps scheduling outside the service.

### Alternative H: Persist the whole inventory in SQLite and alert from SQL

*   **Pros**: one storage engine; stock and ledger share transactions.
*   **Cons**: rewrites the existing store and its tests; the alerting change would be much larger
    than the feature.
*   **Reason for Rejection**: storage refactoring is staged out of scope by the brief.

### Alternative I: Alert from a periodic read of `low_stock()` without a ledger

*   **Pros**: no schema.
*   **Cons**: every run re-alerts every low item for the whole day.
*   **Reason for Rejection**: violates the once-per-day goal.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Security & privacy**: alert records contain SKUs and quantities only; no personal data and no
    credentials. The ledger and sink are local files with default permissions.
*   **Performance**: one sweep is O(items) plus one SQLite transaction per claimed item. The fixture
    has tens of items; batching is unnecessary at that scale.
*   **Rollout & rollback**: inert until a trigger calls the sweep. Removing the trigger stops
    alerting; the ledger may be kept or deleted. Deleting the ledger re-allows alerts for the
    current day, which is the documented recovery step.
*   **Scalability limit**: the sweep holds the inventory lock across ledger and sink I/O, so
    concurrent stock operations wait during a sweep. Acceptable for a single-process service at
    fixture scale; a larger service would batch claims outside the domain lock.

## Risks & Mitigations

*   **Crash between ledger commit and sink append loses one alert.** Mitigation: documented
    at-most-once contract, ledger rows and counters make the gap inspectable; a future
    reconciliation task may compare ledger rows to sink lines.
*   **`SQLITE_BUSY` under a second writer.** Mitigation: connection `busy_timeout` plus single-writer
    contract; a persistent busy condition raises `AlertLedgerError` after the sweep logs counters.
*   **Disk-full or permission failure on the sink.** Mitigation: counted as `emit_failures`, logged,
    never retried; the sweep continues with remaining items.
*   **Ledger failure mid-sweep.** Mitigation: claims already committed remain valid; the sweep raises
    `AlertLedgerError` with the counters reached so far, and the next run re-claims only unclaimed
    items.
*   **Lock contention with stock updates.** Mitigation: accepted scalability limit above; the lock is
    re-entrant and held only for one sweep pass.
*   **Clock/timezone errors.** Mitigation: injected `today_provider`, default UTC; tests pin the
    date.
*   **Two consumers tail the same sink.** Mitigation: out of scope; the sink is append-only and the
    deployment owns its consumers.
*   **Malformed ledger file or schema drift.** Mitigation: schema creation with `IF NOT EXISTS`; a
    migration error raises at sweep start instead of silently dropping claims.

## Additional Resources

*   [concepts_brief.md](../../../.dev/docs/concepts_brief.md) — brainstorm brief.
*   [README.md](../../../README.md) — fixture service overview.
*   [inventory.py](../../../src/inventory.py), [test_inventory.py](../../../tests/test_inventory.py) —
    existing store and tests.

## Future Improvements

*   **Per-item thresholds**: today the threshold is a sweep parameter.
*   **Ledger retention**: prune rows older than 90 days.
*   **Sink reconciliation**: compare ledger rows with sink lines to surface lost appends.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Work proceeds in four phases. Each phase ends with a checkpoint; a failing checkpoint stops the
work before the next phase.

### Phase 1 — ledger and error API (`src/alerts.py`, `tests/test_alerts.py`)

*   Add `AlertCounters` (the frozen dataclass described above) and the errors
    `AlertsError(Exception)`, `AlertLedgerError(AlertsError)` with
    `(message, *, counters: AlertCounters | None = None)` and a `.counters` attribute, and
    `AlertSinkError(AlertsError)`.
*   Add `AlertLedger(path, busy_timeout=5.0)` with the schema contract above: one SQLite file, table
    `alert_claims(alert_date TEXT NOT NULL, sku TEXT NOT NULL, PRIMARY KEY (alert_date, sku))`,
    created by the constructor with `CREATE TABLE IF NOT EXISTS`; `claim()` returns whether this call
    inserted the row; `close()` is idempotent and context-manager support is provided. Ledger
    failures raise `AlertLedgerError` (with `counters=None` at the ledger layer).
*   Tests: construct a ledger, claim once true, claim the same tuple again false; construct a second
    ledger on the same path and claim the same tuple false (durability); with two threads each owning
    its own `AlertLedger` to the same path and a barrier before `claim()`, exactly one claim returns
    true; construct the ledger first (schema and connection ready), then hold a write transaction on
    a second connection and call `claim()` with a short `busy_timeout` to force
    `AlertLedgerError`; `close()` twice is safe; `with AlertLedger(path) as ledger:` closes on exit.
*   **Checkpoint:** `python -m pytest tests/test_alerts.py -q` and `python -m compileall src tests`.

### Phase 2 — JSONL sink (`src/alerts.py`, `tests/test_alerts.py`)

*   Add `JsonlAlertSink(path)`; `append(record)` writes exactly one line as specified above.
*   Tests: two appends produce two lines that each parse as JSON with the four fields; appending
    to a path whose parent directory is missing raises `AlertSinkError` (an `OSError` was wrapped).
*   **Checkpoint:** the Phase 1 command with the sink tests included.

### Phase 3 — snapshot lock and sweep (`src/inventory.py`, `src/alerts.py`, `tests/test_alerts.py`)

*   `src/inventory.py`: add the re-entrant lock, `StockSnapshot`, `select_low_stock(items, threshold)`
    and `locked_snapshot()`; route `Inventory.low_stock()` through `select_low_stock` so threshold
    semantics have one home. Public signatures unchanged.
*   `src/alerts.py`: `AlertCounters` and `run_low_stock_alerts(...)` as specified in Proposed
    Architecture. The function takes `inventory.locked_snapshot()`, counts
    `items_scanned = len(snapshot.items)`, filters with `snapshot.low_stock(threshold)`, claims then
    appends per item, counts outcomes, logs one summary line, and returns the counters.
*   Tests: first sweep emits one line; second sweep suppresses; a fresh ledger and inventory after a
    restart still suppress; a `set_stock` immediately before the sweep never alerts an item that is
    above threshold at claim time; a pinned `today_provider` advances a day and re-alerts; a fake sink
    whose `append` raises `AlertSinkError` increments `emit_failures` and the claim stays consumed;
    an empty `Inventory()` sweeps to `items_scanned == 0` and no sink lines; `items_scanned` counts
    every snapshot item, including items above the threshold.
*   **Checkpoint:** full `python -m pytest tests -q`.

### Phase 4 — integration check (`tests/test_alerts.py`)

*   Use a temporary directory with a real `alerts.sqlite3` and `alerts.jsonl`: run the sweep inside
    `with AlertLedger(path) as ledger:`, reopen by constructing a new `AlertLedger` on the same path,
    run the sweep again, then assert exactly one line, the counters, and suppression after restart.
*   **Checkpoint:** the full suite plus `python -m compileall src tests`; the design is implementation
    ready only when both are green.

### Target Files to Create/Modify

#### 1. `src/inventory.py` (Modify)

*   **Type / Scope**: Python service.
*   **Proposed Changes**: re-entrant lock; `StockSnapshot`; `select_low_stock`; `locked_snapshot()`;
    existing methods take the lock. No public signature change.

#### 2. `src/alerts.py` (Create)

*   **Type / Scope**: Python module.
*   **Proposed Changes**: errors, `AlertLedger`, `JsonlAlertSink`, `AlertCounters`,
    `run_low_stock_alerts`, module logger. Details in Phases 1-3.

#### 3. `tests/test_alerts.py` (Create)

*   **Type / Scope**: Unit and integration tests.
*   **Proposed Changes**: the cases enumerated per phase above.

### Verification Plan

*   **Build**: none; importing the modules on Python 3.10+ is the build check.
*   **Unit tests**: `python -m pytest tests -q` from the fixture root.
*   **Syntax gate**: `python -m compileall src tests`.
*   **Coverage requirement**: the enumerated cases above, not a percentage threshold.
*   **Integration**: the Phase 4 temporary-directory run with a real ledger and JSONL sink.

--------------------------------------------------------------------------------
