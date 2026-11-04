"""Shared installation lives with the SDK runner; no custom workflow engine."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "integration"))
from test_dsh_live import installed_plugin
