# Vendored upstream scenario suites

These files are **copied verbatim** (byte-for-byte) from upstream
[`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model),
Apache-2.0, Copyright Google LLC:

- Source commit: `a119668d7dc5d558664ba711d4671d11fb7270a8`
- Source paths: `skills/<skill>/test_scenarios.yaml` → `<skill>.yaml`

Upstream uses these as behavioural evaluation scenarios (user turns plus
assertions about the model's response). The dsh-egm suite does not run a model:
`test/upstream-parity.test.js` turns each assertion pattern into a content-parity
invariant between the upstream skill text and the adapted DSH skill text.

**Do not edit these files.** Refresh them with the command in
[`../../README.md`](../../README.md) and `node scripts/check-upstream.mjs`.

The Apache-2.0 licence text is in the package root ([`LICENSE`](../../../LICENSE));
attribution is in [`NOTICE`](../../../NOTICE).
