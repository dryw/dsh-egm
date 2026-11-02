# scripts

Repository tooling. Node >= 22, zero dependencies. The npm package ships
`scripts/check-upstream.mjs`: `files` lists `scripts`, and the CI pack check requires it.

## `check-upstream.mjs` — semi-automatic upstream tracking

The package is a port of
[`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model)
(Apache-2.0). `upstream.lock.json` pins the upstream commit and the SHA-256 of every
upstream file this package adapted (and of every file vendored as a test fixture).
This script compares that pin with the upstream default branch and reports which
adapted files a re-adaptation must touch.

```sh
# Check the upstream default branch against the lock (exit 0 clean, 1 drift, 2 error)
node scripts/check-upstream.mjs

# Check a specific branch, tag or commit; print the machine-readable report
node scripts/check-upstream.mjs --ref <sha-or-branch> --json

# Refresh upstream.lock.json for the checked commit (uses GitHub raw file contents)
node scripts/check-upstream.mjs --update-lock

# Offline: refresh the lock from a local upstream clone at its current HEAD
node scripts/check-upstream.mjs --update-lock --source ../egm-source
```

- `GITHUB_TOKEN` (or `GH_TOKEN`) authenticates the GitHub API calls; the anonymous
  limit is 60 requests/hour and the drift report needs two or three calls.
- `--update-lock` is a human step: the daily workflow only reports drift, it never
  rewrites the lock or re-adapts content automatically. It also never moves the pin
  silently — you run it against the `--ref` you checked.
- When upstream changed but none of the mapped files changed, the script still exits
  1 (upstream moved) but says no re-adaptation is required; refresh the lock.

### Semi-automatic workflow

`.github/workflows/upstream-sync.yml` runs daily (and on demand). It executes the
script; on drift it opens — or comments on — the issue **"Upstream EGM changed:
re-vendor bundled skills"** with the affected files and a checklist. A human then
re-adapts, refreshes the vendored fixtures, runs `node --test`, refreshes the lock,
and releases.

If the check itself cannot complete (GitHub API or network error, script exit 2), the
workflow opens — or comments on — a separate issue **"Upstream sync check failed"**
with the captured stderr/stdout and the workflow run link, then still ends red so the
error is visible.

### Adding a newly adapted upstream file

1. Add `[upstreamPath, adaptedPath]` to `ADAPTED_FILES` in `check-upstream.mjs`.
2. If it is vendored as a test fixture, add it to `VENDORED_FIXTURES` too.
3. Run `node scripts/check-upstream.mjs --update-lock --source <checkout>` and commit
   both the script change and `upstream.lock.json`; `test/upstream-sync.test.js`
   fails if the two drift apart.

### Vendored fixtures

`test/fixtures/upstream-scenarios/`, `test/fixtures/upstream-skills/` and
`test/fixtures/upstream-designs/` hold verbatim upstream files. Refresh them from
the new upstream commit, then run `node scripts/check-upstream.mjs --update-lock`
so the recorded SHA-256 values match; `test/upstream-sync.test.js` verifies the
vendored bytes against the lock.
