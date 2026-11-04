# Upstream test reuse

The live test follows the two scenarios in upstream `test_codex.py` at
`113a3afc44e8f4f54722d7150d5701f65cc8ef7f`. DSH supplies startup, native skill
invocation and trace decoding; `upstream_contract.py` retains the artifact and
reviewer-count assertions. Replay tests exercise host mechanics, not model behavior.

Check extraction using raw Git bytes in a Linux shell:

```sh
git -C .dev/upstream-clone show 113a3afc44e8f4f54722d7150d5701f65cc8ef7f:tests/integration/test_codex.py > .dev/acceptance/upstream-test-codex-lf.py
python tests/integration/extract_upstream_contract.py .dev/acceptance/upstream-test-codex-lf.py --check
```

`tests/integration/fixtures/live-prompts/verify_prompt.py` verifies the canonical
prompt against pinned upstream source over the network. Neither check invokes a model.
