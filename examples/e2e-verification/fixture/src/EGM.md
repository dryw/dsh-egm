# Inventory store (`fixture/src`)

## Overview

`src/` holds the fixture project's only source module, `inventory.py`: an in-memory store of immutable item records with insert, lookup, stock update and threshold query. It is part of the recorded EGM end-to-end verification fixture — a scratch project used for one verification run, not production code ([examples/README.md](../../../README.md), [E2E-VERIFICATION.md](../../../../E2E-VERIFICATION.md)). The module's only imports are `__future__.annotations` and `dataclasses` ([inventory.py:3-5](./inventory.py)).

## Interface

- `DEFAULT_LOW_STOCK` — module constant `5`; the default threshold of `low_stock()` ([inventory.py:7](./inventory.py)).
- `Item` — frozen dataclass with fields `sku: str`, `name: str`, `quantity: int`; its attributes cannot be assigned after construction ([inventory.py:10-16](./inventory.py)).
- `Inventory()` — constructor; starts with an empty record map ([inventory.py:22-23](./inventory.py)).
- `Inventory.add(item: Item) -> None` — stores `item` at key `item.sku`, replacing any record already stored under that SKU ([inventory.py:25-27](./inventory.py)).
- `Inventory.get(sku: str) -> Item | None` — returns the stored record for `sku`, or `None` when the SKU is absent ([inventory.py:29-31](./inventory.py)).
- `Inventory.set_stock(sku: str, quantity: int) -> Item` — replaces the stored record with a copy whose `quantity` is set, and returns that new record ([inventory.py:33-38](./inventory.py)).
- `Inventory.low_stock(threshold: int = DEFAULT_LOW_STOCK) -> list[Item]` — returns every record whose `quantity` is at or below `threshold`, sorted by `sku` ascending ([inventory.py:40-45](./inventory.py)).
- Subdirectories: none. `inventory.py` is the only source file in `src/`.

## Invariants

- Records are keyed by `Item.sku`; one record per SKU is stored, and `add`/`set_stock` overwrite the slot they target ([inventory.py:27](./inventory.py), [inventory.py:37](./inventory.py)).
- `Item` is immutable (`frozen=True`); updates replace records instead of mutating them, so an `Item` returned earlier keeps its old `quantity` ([inventory.py:10](./inventory.py), [inventory.py:36](./inventory.py)).
- `set_stock` requires an existing SKU: it indexes `self._items[sku]` directly and therefore raises `KeyError` for an unknown SKU; the module catches no exceptions ([inventory.py:35](./inventory.py)).
- The `low_stock()` threshold comparison is inclusive (`<=`), and the result is ordered by `sku` ([inventory.py:43-44](./inventory.py)).
- No field or range validation is performed: `quantity` may be negative and is stored as given ([inventory.py:27](./inventory.py), [inventory.py:36-37](./inventory.py)).
- State is process-local and unsynchronised: `Inventory` keeps a plain `dict`, and the module imports no locking or persistence support ([inventory.py:3-5](./inventory.py), [inventory.py:23](./inventory.py)).

## Side Effects

- `add()` mutates the store in place by writing to `self._items` ([inventory.py:27](./inventory.py)).
- `set_stock()` mutates the store in place by writing the replacement record ([inventory.py:37](./inventory.py)); for an unknown SKU it raises `KeyError` before any write ([inventory.py:35](./inventory.py)).
- `get()` and `low_stock()` do not mutate the store; `low_stock()` builds and returns a new sorted list ([inventory.py:31](./inventory.py), [inventory.py:42-45](./inventory.py)).
- No disk, network, environment, logging or module-level mutable state access: the only imports are `__future__.annotations` and `dataclasses` ([inventory.py:3-5](./inventory.py)).

## Verification

- Run: `node --test` from the repository root.
- This package is Python fixture material and ships in no npm tarball: `node --test` does not treat `examples/` as package content ([examples/README.md](../../../README.md)). The fixture's unit tests ([../tests/test_inventory.py](../tests/test_inventory.py)) are test-only code outside this contract.
