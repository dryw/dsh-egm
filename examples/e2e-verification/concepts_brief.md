# Low-stock alerts for the inventory service

* **Author:** Dryw (recorded by the DeepSeek Harness E2E verification run)
* **Date:** 2026-10-31

## Overview

The fixture inventory service can list items at or below a stock threshold, but nobody is told
about them. Operators find out that an item ran out only when an order fails. This concept adds a
low-stock alert sweep that reports each at-risk item once per day, with no new dependencies.

This brief is an end-to-end verification artifact. The owner decisions below were taken
synthetically for the run and are recorded so the draft can proceed without a live interview.

## Analysis

All six Goldfish lenses converged on the same shape of risk:

- **Idempotency has no home.** The service is an in-memory dictionary; "one alert per item per day"
  needs durable dedupe state, otherwise a restart re-alerts. The stdlib offers `sqlite3` as the
  natural ledger.
- **The concurrency claim is currently unprovable.** `set_stock` is a non-atomic
  read-modify-write, and there is no shared lock between a stock change and the alert sweep, so "no
  false positives from concurrent updates" is a slogan unless a single lock covers snapshot, claim
  and emit.
- **"Emit one alert" names no sink.** Log line, JSONL file, SMTP or callback are all possible under
  stdlib-only; the choice decides retry semantics and observability.
- **Day boundary and clock are implicit.** Wall-clock date bucketing is untestable and
  DST/timezone-brittle; an injected date source is required.
- **Delivery failure is undefined.** Retrying can duplicate an alert; dropping loses the signal.
  The design must pick one guarantee and measure it.
- **Half the feature already exists.** `low_stock(threshold)` already returns the at-risk set; the
  new work is the ledger, the notifier and the sweep, not a second threshold query.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  * one alert per item per UTC day when the item is at or below the threshold at sweep time;
  * durable dedupe across process restarts;
  * a single lock covering the snapshot, the ledger claim and the emit, so concurrent stock updates
    cannot produce an alert for an item that is no longer low at sweep time;
  * counters for scanned items, emitted alerts, duplicate suppressions and emit failures;
  * stdlib only (Python 3.10+): no new dependencies.
* **Out-of-Scope Non-Goals:**
  * per-item or per-category thresholds;
  * scheduling inside the process (a cron/ops trigger calls the sweep);
  * multi-process or multi-host inventory (in-memory store is single-process by construction);
  * alert delivery channels beyond the chosen sink;
  * hysteresis or debounce rules; the threshold check at sweep time is the contract.

## Alternatives Weighed

* **Log line via `logging`**: simplest, but hard to consume as data and hard to test deterministically.
  Rejected for the primary sink; kept as the failure/observability log.
* **JSONL append file**: durable, line-oriented, easy to consume and assert in tests; stdlib only.
  Chosen.
* **Email/HTTP webhook**: needs configuration, credentials and a network dependency. Rejected as
  out of scope for the fixture service.
* **In-memory dedupe set**: cannot survive a restart. Rejected.
* **Dedupe in the inventory dictionary**: mixes alert state into the domain store and does not
  survive restart. Rejected.
* **SQLite ledger**: stdlib, durable, transactional, supports an atomic insert-or-ignore claim and
  restart-safe duplicate suppression. Chosen.
* **Wall-clock `date.today()` inside the sweep**: untestable and timezone-brittle. Rejected in favour
  of an injected `today_provider` defaulting to UTC.
* **Timer inside the service**: duplicates the scheduler the service already has outside the process.
  Rejected; the sweep is an explicit call.

## Key Decisions & Staging for Next Steps

1. **Dedupe store:** a SQLite ledger file with primary key `(sku, alert_date)`; claim with
   `INSERT OR IGNORE` inside one `BEGIN IMMEDIATE` transaction.
2. **Sink:** append-only JSONL file (`alerts.jsonl`), one JSON object per line:
   `{"sku", "alert_date", "quantity", "threshold"}`; append is the emit step.
3. **Idempotency contract:** at-most-once per `(sku, alert_date)`. The ledger claim happens before
   the append; a failed append is counted and logged and is not retried (a lost alert is preferable
   to a duplicate, and the counters make the loss visible). Rationale: duplicate daily alerts train
   operators to ignore them.
4. **Concurrency:** one `threading.RLock` in `Inventory` protects `add`, `get`, `set_stock` and
   `low_stock`; the sweep takes the same lock for the whole snapshot → claim → emit sequence. This
   makes "low at sweep time" a point-in-time fact rather than a claim.
5. **Clock:** `today_provider: Callable[[], date]` injected into the sweep, defaulting to
   `datetime.now(timezone.utc).date()`. Tests pin the date.
6. **Trigger:** an explicit `run_low_stock_alerts(...)` call; scheduling stays outside the service.
7. **Observability:** the sweep returns counters and writes one summary log line per run.
8. **Staging:** one implementation slice: ledger + notifier + sweep + tests. The in-memory inventory
   store itself is not refactored.
