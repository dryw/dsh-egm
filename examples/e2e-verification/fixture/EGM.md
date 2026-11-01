# Fixture project (`fixture`)

## Overview

The scratch project that the recorded EGM end-to-end run worked on: a small in-memory Python inventory service ([README.md](./README.md)). It is verification material, not production code; the run and its evidence are recorded in [examples/README.md](../../README.md) and [E2E-VERIFICATION.md](../../../E2E-VERIFICATION.md). This directory contains no direct source files — `src/` holds the only module.

Non-contract human assets: [README.md](./README.md) describes the fixture, and [AGENTS.md](./AGENTS.md) is its agent-instruction file, which sets `EGM artifact directory: .dev/docs` ([AGENTS.md:3](./AGENTS.md)). Neither file is a component contract.

## Subdirectories & Boundaries

- src: [./src/EGM.md](./src/EGM.md) — contract for `inventory.py`: the frozen `Item` record (`sku`, `name`, `quantity`) and `Inventory` with `add`, `get`, `set_stock` and `low_stock`, plus the `DEFAULT_LOW_STOCK = 5` threshold.
- tests: test-only code, excluded from the contract set and not documented as a contract. [test_inventory.py](./tests/test_inventory.py) holds the fixture's two unit tests, `test_low_stock_lists_threshold_items` and `test_set_stock_returns_updated_record`.
