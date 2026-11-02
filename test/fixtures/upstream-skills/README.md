# Vendored upstream skill baselines

These are **verbatim copies** (byte-for-byte) of the upstream EGM skill files used
as the baseline for content parity, so `test/upstream-parity.test.js` runs offline
and deterministically (CI has no upstream checkout):

- Source: [`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model), Apache-2.0, Copyright Google LLC
- Source commit: `a119668d7dc5d558664ba711d4671d11fb7270a8`
- Source paths: `skills/<skill>/SKILL.md` → `<skill>/SKILL.md`

Each upstream `test_scenarios.yaml` assertion is checked against its skill's
baseline here; when upstream's text satisfies a required pattern, the adapted
`skills/<skill>/SKILL.md` must satisfy it too (and mirror-image for forbidden
patterns).

**Do not edit these files.** Refresh them from the upstream commit pinned in
[`upstream.lock.json`](../../../upstream.lock.json); the SHA-256 recorded there is
verified byte-for-byte by `test/upstream-sync.test.js`.

The Apache-2.0 licence text is in the package root ([`LICENSE`](../../../LICENSE));
attribution is in [`NOTICE`](../../../NOTICE).
