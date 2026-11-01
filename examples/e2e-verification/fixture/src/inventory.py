"""Minimal inventory store used by the end-to-end fixture."""

from __future__ import annotations

from dataclasses import dataclass, replace

DEFAULT_LOW_STOCK = 5


@dataclass(frozen=True)
class Item:
    """One stocked item."""

    sku: str
    name: str
    quantity: int


class Inventory:
    """In-memory inventory with stock mutation."""

    def __init__(self) -> None:
        self._items: dict[str, Item] = {}

    def add(self, item: Item) -> None:
        """Insert or replace an item record."""
        self._items[item.sku] = item

    def get(self, sku: str) -> Item | None:
        """Return one item, or None when the SKU is unknown."""
        return self._items.get(sku)

    def set_stock(self, sku: str, quantity: int) -> Item:
        """Set the quantity of an existing item."""
        item = self._items[sku]
        updated = replace(item, quantity=quantity)
        self._items[sku] = updated
        return updated

    def low_stock(self, threshold: int = DEFAULT_LOW_STOCK) -> list[Item]:
        """Return items at or below the threshold, by SKU."""
        return sorted(
            (item for item in self._items.values() if item.quantity <= threshold),
            key=lambda item: item.sku,
        )
