"""Fixture tests for the inventory store."""

from src.inventory import Inventory, Item


def test_low_stock_lists_threshold_items() -> None:
    inventory = Inventory()
    inventory.add(Item("a", "Anvil", 2))
    inventory.add(Item("b", "Bolt", 20))
    assert [item.sku for item in inventory.low_stock()] == ["a"]


def test_set_stock_returns_updated_record() -> None:
    inventory = Inventory()
    inventory.add(Item("a", "Anvil", 2))
    assert inventory.set_stock("a", 7).quantity == 7
