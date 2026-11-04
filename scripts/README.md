# scripts

Repository-only tooling for the DeepSeek Harness adapter. Node >= 22, zero dependencies.

The npm package does **not** ship this directory or the manual checker. `package.json` `files`
enumerates the shipped paths explicitly (it no longer lists `scripts/`), and the CI pack check
rejects both `adapters/dsh/check_upstream.mjs` and `adapters/dsh/render_diagrams.mjs` if they leak
into a tarball. The diagram renderer is documented in
[`docs/assets/README.md`](../docs/assets/README.md).

## `adapters/dsh/check_upstream.mjs` — semi-automatic upstream tracking

The package is the DeepSeek Harness adapter for
[`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model)
(Apache-2.0). `upstream.lock.json` pins the upstream commit and, for every vendored upstream file
this package ships, the SHA-256 of its repository text with LF line endings. The Node test compares
the shipped files as LF-normalized text; the Python archive check hashes each packed member's raw
bytes and compares that digest with the recorded value. This script compares that pin with the
upstream default branch and reports which vendored files a re-adaptation must touch.

```sh
# Check the upstream default branch against the lock (exit 0 clean, 1 drift, 2 error)
node adapters/dsh/check_upstream.mjs

# Check a specific branch, tag or commit; print the machine-readable report
node adapters/dsh/check_upstream.mjs --ref <sha-or-branch> --json

# Refresh upstream.lock.json for the checked commit (uses GitHub raw file contents)
node adapters/dsh/check_upstream.mjs --update-lock

# Offline: refresh the lock from a local upstream clone at its current HEAD
node adapters/dsh/check_upstream.mjs --update-lock --source ../egm-source
```

- `GITHUB_TOKEN` (or `GH_TOKEN`) authenticates the GitHub API calls; the anonymous
  limit is 60 requests/hour and the drift report needs two or three calls.
- `--update-lock` is a human step: the daily workflow only reports drift, it never
  rewrites the lock or re-adapts content automatically. It also never moves the pin
  silently — you run it against the `--ref` you checked.
- When upstream changed but none of the mapped files changed, the script still exits
  1 (upstream moved) but says no re-adaptation is required; refresh the lock.

### Semi-automatic workflow

`.github/workflows/upstream-sync.yml` runs daily (and on demand). It executes the script; on drift
it opens — or comments on — the issue **"Upstream EGM changed: re-vendor bundled skills"** with the
affected files and a checklist. A human then re-adapts, refreshes the vendored files, runs
`npm test`, refreshes the lock, and releases.

If the check itself cannot complete (GitHub API or network error, script exit 2), the workflow opens
— or comments on — a separate issue **"Upstream sync check failed"** with the captured
stderr/stdout and the workflow run link, then still ends red so the error is visible.

### Adding a newly adapted upstream file

1. Add `[upstreamPath, adaptedPath]` to `ADAPTED_FILES` in
   [`adapters/dsh/check_upstream.mjs`](../adapters/dsh/check_upstream.mjs).
2. Run `node adapters/dsh/check_upstream.mjs --update-lock --source <checkout>` and commit both the
   script change and `upstream.lock.json`; `tests/unit/dsh_upstream.test.js` fails if the two drift
   apart.
