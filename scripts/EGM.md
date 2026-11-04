# scripts

## Overview

`scripts/` contains exactly one source file, [`check-upstream.mjs`](check-upstream.mjs): a zero-dependency Node >= 22 program that is both a CLI and an importable ES module ([check-upstream.mjs:1-28](check-upstream.mjs)). Its job is upstream drift tracking for this package, a DeepSeek Harness port of `google/elephant-goldfish-model` (Apache-2.0). It compares the commit pinned in `upstream.lock.json` with a target upstream ref, reports which adapted files a re-adaptation must touch, and can regenerate the lock from a local checkout or from `raw.githubusercontent.com` ([check-upstream.mjs:2-21](check-upstream.mjs)).

Direct execution runs the CLI; importing the module only exposes the exports listed below and performs no I/O ([check-upstream.mjs:398-418](check-upstream.mjs)). The module imports Node built-ins only ([check-upstream.mjs:29-33](check-upstream.mjs)), and `package.json` declares `"type": "module"` and Node `>=22` ([package.json:5](../package.json), [package.json:71-74](../package.json)).

Packaging: `scripts/` **does** ship in the npm package. `package.json` `files` lists `scripts` ([package.json:20-44](../package.json)), and the CI pack check requires `scripts/check-upstream.mjs` in the tarball's file list ([ci.yml:38-121](../.github/workflows/ci.yml)).

## Interface

### Exported constants

- `PACKAGE_ROOT` — absolute package root derived from the module URL ([check-upstream.mjs:36](check-upstream.mjs)).
- `LOCK_PATH` — `PACKAGE_ROOT` joined with `upstream.lock.json` ([check-upstream.mjs:37](check-upstream.mjs)).
- `DEFAULT_REPOSITORY` — `'google/elephant-goldfish-model'` ([check-upstream.mjs:38](check-upstream.mjs)).
- `DEFAULT_BRANCH` — `'main'` ([check-upstream.mjs:39](check-upstream.mjs)).
- `ADAPTED_FILES` — frozen, ordered array of 26 `[upstreamPath, adaptedPath]` pairs that defines which upstream files this package adapted ([check-upstream.mjs:43-76](check-upstream.mjs)).

### Exported functions

- `sha256(value)` — lowercase hex SHA-256 of a buffer, string, or other `Hash.update`-compatible value ([check-upstream.mjs:100-103](check-upstream.mjs)).
- `parseArgs(argv)` — maps CLI arguments to `{ ref, json, updateLock, source, help }`; throws on an unknown argument and deliberately does not validate flag combinations ([check-upstream.mjs:105-124](check-upstream.mjs)).
- `readLock(lockPath = LOCK_PATH)` — reads and validates the lock, returning the parsed object or throwing a readable error ([check-upstream.mjs:126-152](check-upstream.mjs)).
- `buildLock({ repository, branch, commit, source, token })` — hashes every mapped file and returns a lock object with `schemaVersion: 1`, `updatedAt` and `files` ([check-upstream.mjs:154-174](check-upstream.mjs)).
- `checkForDrift({ ref, token, lock })` — resolves the target commit, compares it with the pinned
  commit, and returns the report object ([check-upstream.mjs:229-277](check-upstream.mjs)). The
  object always carries `repository`, `branch`, `pinnedCommit`, `targetRef`, `targetCommit` and
  `drift` ([check-upstream.mjs:235-247](check-upstream.mjs)); a drift run also sets `commitCount`,
  `comparedFiles`, `targetBehind`, `targetStatus` and `compareUrl`, fills `affected` with
  `{ upstream, adapted, status }` entries for mapped files, fills `otherChanged` with the remaining
  changed paths, and sets `compareLimited` when the API returns at least 300 changed files
  ([check-upstream.mjs:248-276](check-upstream.mjs)).
- `renderReport(result, { updateNote } = {})` — renders the plain-text report string ([check-upstream.mjs:279-327](check-upstream.mjs)).

Internal helpers, not exported: `upstreamHash`, `requestHeaders`, `githubJson`, `resolveCommit`, `resolveDefaultBranch`, `gitHead`, `main`, `isEntryPoint`, and the `HELP` string ([check-upstream.mjs:177-227](check-upstream.mjs), [check-upstream.mjs:329-406](check-upstream.mjs)).

Subdirectories: none.

### CLI

| Flag | Behaviour | Source |
| --- | --- | --- |
| `--ref <sha-or-branch>` | Check this upstream ref instead of the locked branch; the `--ref=<value>` form is also accepted. | [check-upstream.mjs:113-116](check-upstream.mjs), [check-upstream.mjs:232-234](check-upstream.mjs) |
| `--json` | Print the machine-readable result object instead of the text report. | [check-upstream.mjs:110](check-upstream.mjs), [check-upstream.mjs:379-391](check-upstream.mjs) |
| `--update-lock` | Rewrite `upstream.lock.json` for the checked ref and exit 0. | [check-upstream.mjs:111](check-upstream.mjs), [check-upstream.mjs:359-385](check-upstream.mjs) |
| `--source <checkout>` | With `--update-lock`, hash a local upstream checkout instead of GitHub raw; the `--source=<value>` form is also accepted. | [check-upstream.mjs:117-120](check-upstream.mjs), [check-upstream.mjs:359-368](check-upstream.mjs) |
| `-h`, `--help` | Print the usage block and exit 0. | [check-upstream.mjs:112](check-upstream.mjs), [check-upstream.mjs:329-352](check-upstream.mjs) |

### Exit codes

| Code | Meaning | Source |
| --- | --- | --- |
| `0` | Up to date; also `--update-lock` after a successful write, and `--help`. | [check-upstream.mjs:349-352](check-upstream.mjs), [check-upstream.mjs:385](check-upstream.mjs), [check-upstream.mjs:395](check-upstream.mjs) |
| `1` | Drift: the resolved target commit differs from the pinned commit. | [check-upstream.mjs:395](check-upstream.mjs) |
| `2` | Error: any failure thrown from `main` (argument, lock, network, filesystem, or git). | [check-upstream.mjs:408-417](check-upstream.mjs) |

### Environment

- `GITHUB_TOKEN`, falling back to `GH_TOKEN` — sent as a `Bearer` token on GitHub requests ([check-upstream.mjs:353](check-upstream.mjs), [check-upstream.mjs:192-195](check-upstream.mjs)).
- `GITHUB_API_URL` — GitHub API base override, read once at module load, defaulting to `https://api.github.com` with trailing slashes stripped ([check-upstream.mjs:40](check-upstream.mjs)).

## Invariants

- **Lock schema.** `readLock` rejects a missing lock with a `--update-lock` hint ([check-upstream.mjs:128](check-upstream.mjs)), invalid JSON ([check-upstream.mjs:130-134](check-upstream.mjs)), a `repository`, `branch`, or `commit` that is not a non-empty string ([check-upstream.mjs:135-139](check-upstream.mjs)), a missing or empty `files` array ([check-upstream.mjs:140](check-upstream.mjs)), `files[i].upstream` / `files[i].adapted` that are not non-empty strings, and any `sha256` that is not a lowercase 64-character hex digest ([check-upstream.mjs:141-150](check-upstream.mjs)). It validates `files` only; `schemaVersion` is written by `buildLock` but is not checked here ([check-upstream.mjs:164-172](check-upstream.mjs)). Because `main` calls `readLock()` before entering the update branch ([check-upstream.mjs:355](check-upstream.mjs)), `--update-lock` can bootstrap a missing lock but cannot repair an invalid one.
- **Mapping contract.** `ADAPTED_FILES` (26 pairs) is a frozen array, and the code comment states that a new upstream adaptation must add an entry here. `buildLock` iterates it in declaration order, so `lock.files` has a fixed order and one entry per pair.
- **Lock/test agreement.** `test/upstream-lock.test.js` requires the checked-in lock to match the
  script's maps exactly: `schemaVersion` 1, `repository` equal to `DEFAULT_REPOSITORY`, a non-empty
  `branch`, a 40-character `commit` and exactly 26 `files` entries in `ADAPTED_FILES` order;
  `readLock` itself enforces only field presence and format
  ([../test/upstream-lock.test.js](../test/upstream-lock.test.js)).
- **Hash normalisation.** `upstreamHash` normalises CRLF to LF before hashing in both modes, so the lock records the repository's LF text and is independent of a Windows checkout's line endings ([check-upstream.mjs:177-189](check-upstream.mjs)). Source mode reads `<source>/<upstreamPath>` and throws when the file is absent ([check-upstream.mjs:181-184](check-upstream.mjs)); network mode throws on any non-OK response ([check-upstream.mjs:186-189](check-upstream.mjs)).
- **Lock update scope.** `--update-lock` always writes for the ref it checked and then exits 0, even when the pin moved ([check-upstream.mjs:359-385](check-upstream.mjs)). Without `--source`, the commit is resolved from `--ref` or the branch recorded in the lock, falling back to `DEFAULT_BRANCH` when no lock exists ([check-upstream.mjs:356-357](check-upstream.mjs), [check-upstream.mjs:365-366](check-upstream.mjs)). In source mode the commit is an explicit `--ref` recorded verbatim or the checkout's git HEAD ([check-upstream.mjs:361-363](check-upstream.mjs)); no remote default branch is consulted, matching the header's promise that the pin never moves without a human running it ([check-upstream.mjs:19-21](check-upstream.mjs)).
- **Check scope.** `checkForDrift` uses `lock.repository` and `--ref` or `lock.branch` as the target ([check-upstream.mjs:231-234](check-upstream.mjs)). When the target commit equals the pinned commit it returns `drift: false` without calling the compare API ([check-upstream.mjs:241-248](check-upstream.mjs)). Otherwise it calls GitHub compare ([check-upstream.mjs:249](check-upstream.mjs)); a `status` of `behind` re-runs the comparison in the forward direction so the file list is still populated, while preserving the original `html_url` ([check-upstream.mjs:250-258](check-upstream.mjs)). Mapped files go to `affected` through the `ADAPTED_FILES` map, everything else to `otherChanged` ([check-upstream.mjs:260-274](check-upstream.mjs)), and `compareLimited` is set once the API returns at least 300 changed files ([check-upstream.mjs:275](check-upstream.mjs)). A 40-character hex ref is accepted directly and lowercased instead of being resolved through the API ([check-upstream.mjs:207-213](check-upstream.mjs)).
- **Argument parsing.** `parseArgs` starts from defaults for every option ([check-upstream.mjs:107](check-upstream.mjs)), accepts space-separated and `--flag=value` forms ([check-upstream.mjs:113-120](check-upstream.mjs)), lets a later occurrence overwrite an earlier one, and throws `unknown argument … (try --help)` on anything else ([check-upstream.mjs:121](check-upstream.mjs)). `--source` is only consumed by the `--update-lock` branch, so it has no effect on a plain check ([check-upstream.mjs:359-367](check-upstream.mjs), [check-upstream.mjs:388-395](check-upstream.mjs)).
- **Entry-point guard.** The CLI runs only when `pathToFileURL(process.argv[1]).href === import.meta.url`; an undefined `argv[1]` or a URL-conversion failure leaves the module inert ([check-upstream.mjs:398-406](check-upstream.mjs), [check-upstream.mjs:408-418](check-upstream.mjs)). Importing the module therefore causes no network, filesystem, or subprocess activity, which is what lets the test suite import its exports ([../test/upstream-lock.test.js](../test/upstream-lock.test.js)).
- **Result shape.** A check run prints the report object tagged `result: 'drift'` or `result: 'clean'` under `--json` ([check-upstream.mjs:390-391](check-upstream.mjs)); an update run prints the lock result tagged `result: 'lock-updated'` ([check-upstream.mjs:379](check-upstream.mjs)).
- **Failure handling.** `main` returns `0` or `1`; the entry-point wrapper stores that in `process.exitCode` and converts a rejected promise into one stderr line, `check-upstream: <message>`, with exit code `2` ([check-upstream.mjs:408-417](check-upstream.mjs)). The module never calls `process.exit()`.

## Side Effects

- **Network reads.** With `--update-lock` and no `--source`, every adapted upstream file is fetched from `https://raw.githubusercontent.com/<repository>/<commit>/<upstreamPath>` ([check-upstream.mjs:41](check-upstream.mjs), [check-upstream.mjs:186-189](check-upstream.mjs)). GitHub API calls go to `GITHUB_API` (default `https://api.github.com`) for commit resolution ([check-upstream.mjs:198-213](check-upstream.mjs)) and for compare ranges ([check-upstream.mjs:249-256](check-upstream.mjs)); the repository-metadata helper at [check-upstream.mjs:215-221](check-upstream.mjs) currently has no caller. Requests carry `accept: application/vnd.github+json`, a `user-agent`, and `authorization: Bearer <token>` when a token is set ([check-upstream.mjs:192-196](check-upstream.mjs)).
- **Disk write.** The only file written is `upstream.lock.json`, via `writeFileSync(LOCK_PATH, …)`, serialising the lock with `JSON.stringify(updated, null, 2)` and a trailing newline, and only inside the `--update-lock` branch ([check-upstream.mjs:369](check-upstream.mjs)). A normal check writes nothing.
- **Disk reads.** `readLock` reads the lock file ([check-upstream.mjs:131](check-upstream.mjs)); with `--source`, `upstreamHash` reads each mapped file from the checkout ([check-upstream.mjs:181-184](check-upstream.mjs)).
- **Subprocess.** `git -C <directory> rev-parse HEAD` runs through `spawnSync` only for `--update-lock --source` without `--ref` ([check-upstream.mjs:223-227](check-upstream.mjs), [check-upstream.mjs:361-363](check-upstream.mjs)).
- **Environment reads.** `GITHUB_TOKEN` then `GH_TOKEN` are read in `main` ([check-upstream.mjs:353](check-upstream.mjs)); `GITHUB_API_URL` is read at module load and is therefore captured before `main` runs ([check-upstream.mjs:40](check-upstream.mjs)).
- **Output streams.** Stdout carries the help text, the text report, JSON results, and the update summary ([check-upstream.mjs:349-350](check-upstream.mjs), [check-upstream.mjs:379-393](check-upstream.mjs)); stderr is written only for an error escaping `main` ([check-upstream.mjs:413-415](check-upstream.mjs)). The process status is set through `process.exitCode` rather than an immediate exit ([check-upstream.mjs:410-416](check-upstream.mjs)).

## Verification

- Run: `node --test` from the package root ([package.json:7-10](../package.json)). CI runs the same command on Ubuntu with Node 22 and 24 and on Windows with Node 24 ([ci.yml:13-37](../.github/workflows/ci.yml)) and then asserts the packed file list contains `scripts/check-upstream.mjs` and no `test/`, `examples/`, or `.github/` files ([ci.yml:38-121](../.github/workflows/ci.yml)).
- `test/upstream-lock.test.js` imports this module and checks that the lock's `files` array matches `ADAPTED_FILES` and that every shipped adapted file still hashes to its recorded SHA-256 ([../test/upstream-lock.test.js](../test/upstream-lock.test.js)).
- Optional network-free smoke test: `node scripts/check-upstream.mjs --help` prints the usage block and exits 0 ([check-upstream.mjs:329-352](check-upstream.mjs)).
- The networked drift check and `--update-lock` (which require GitHub access or a local upstream checkout) are not part of the routine verification.
