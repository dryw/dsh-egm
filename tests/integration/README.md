# Integration tests

Requires Linux, Node 24 and Python 3.12. Run from the repository root:

```sh
python3.12 -m venv /path/to/venv
/path/to/venv/bin/pip install -r tests/integration/dsh_requirements.txt
npm ci --prefix tests/integration/dsh-ci
/path/to/venv/bin/python -m pytest tests/integration tests/unit/test_dsh_traces.py -q
```

Set `EGM_TEST_RUNTIME` to use another installation of the locked Node runtime
(use a Linux-local directory under WSL). `npm test` runs the separate Node suite.

- `test_dsh.py`: `test_install` compares every packed file with the installed copy
  and hashes every locked vendored archive member's literal bytes, comparing the
  digest with the lock (no newline normalization); `test_adapter` checks skill
  delivery, parent controls, fresh-context isolation, reads, write/shell guard
  denials, child completion, and records whether a project `AGENTS.md` reaches
  the parent and the reviewer (`controls/host-context.json`).
- `tests/unit/test_dsh_traces.py`: synthetic negative cases showing each evidence
  check can fail, including malformed JSONL and rejection of parent-only reviewer
  claims. Keyless regressions also prove `write_identity` reads the installed
  package's own upstream pin and that the archive byte check rejects
  CRLF-rewritten bytes.
- `test_dsh_live.py`: two paid tests, skipped unless explicitly enabled, and the
  `check` and `profile` commands. See [LIVE-README.md](LIVE-README.md).

The replay profile in `test_dsh_live.py:profile_rows` composes an `agentPresets`
registry and a minimal `standard` default preset because the bundle does not yet
create them (owner decision D3 selects package-supplied setup; that setup is
deferred to C1b). That is disclosed functional prerequisite assistance, distinct
from the observer and provider instrumentation; a bare SDK or arbitrary profile
does not get those rows, so bare-SDK and arbitrary-profile workflow remains
pending. See
[TESTING.md](../../TESTING.md#host-prerequisites-and-current-limits) and
[docs/dsh.md](../../docs/dsh.md).

Evidence is retained under pytest's temporary directory: requests/tool results,
notifications, native Sessions and artifacts. Use a fresh `--basetemp` path to keep
it; pytest clears an existing basetemp. CI runs the suite with paid tests disabled.

Fixtures use native replay entries and native-writer Session seeds. Do not invent
lifecycle events. Regenerate seeds with the pinned runtime and validate through
its `parseSessionLog` and `deriveReplayScript` APIs before replacing them.
