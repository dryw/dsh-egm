# Integration tests

Requires Linux, Node 24 and Python 3.12. Run from the repository root:

```sh
python3.12 -m venv /path/to/venv
/path/to/venv/bin/pip install -r tests/integration/requirements.txt
npm ci --prefix tests/integration/runtime
/path/to/venv/bin/python -m pytest tests/integration -q
```

Set `EGM_TEST_RUNTIME` to use another installation of the locked Node runtime
(use a Linux-local directory under WSL). `npm test` runs the separate Node suite.

- `test_dsh.py`: one native adapter scenario checks skill delivery, parent controls,
  fresh-context isolation, reads, write/shell guard denials and child completion.
- `test_live_checks.py`: keyless native skill delivery and rejection of parent-only
  reviewer claims.
- `test_dsh_live.py`: two paid tests, skipped unless explicitly enabled.
  See [LIVE-README.md](LIVE-README.md).

Evidence is retained under pytest's temporary directory: requests/tool results,
notifications, native Sessions and artifacts. Use a fresh `--basetemp` path to keep
it; pytest clears an existing basetemp. CI runs the suite with paid tests disabled.

Fixtures use native replay entries and native-writer Session seeds. Do not invent
lifecycle events. Regenerate seeds with the pinned runtime and validate through
its `parseSessionLog` and `deriveReplayScript` APIs before replacing them.
