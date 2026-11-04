# dsh-egm test suite

Zero-dependency `node:test` suite that gates the package before publishing. Most
of the package is vendored verbatim from upstream EGM; the suite therefore checks
that the vendored tree stays byte-faithful, that the DeepSeek Harness integration
layer injects the right preamble and reviewer isolation, and that the bundle
manifest, locale and icon satisfy the DSH plugin contract.

The separate [Python integration suite](../tests/integration/README.md) checks the
adapter in a real Harness on Linux/Node 24/Python 3.12, including the trace
regressions in `tests/unit/test_dsh_traces.py`. It does not replace this
JavaScript suite or add dependencies to its unit/content checks. Install its
locked dependencies separately (see below).

## Requirements

- Node.js **>= 22** (locally validated on Node 24). No `npm install` is needed: the
  suite imports only `node:` builtins and the package's own files.
- Run from the package root (the directory containing `package.json`).

## Run

```sh
# The package script: node --test "tests/unit/*.test.js"
npm test

# Explicit glob; quote it so Node, not the shell, expands it
node --test "tests/unit/*.test.js"

# One suite while working
node --test "tests/unit/dsh_manifest.test.js"
```

> **Note:** `node --test tests/unit/` is not a directory argument on Node 24. The
> positional arguments after `--test` are glob patterns, and `tests/unit/` matches
> the directory itself, so Node tries to execute it as a test file and fails. Use
> the quoted glob above.

`node --test` also discovers the suites when run with no arguments from the
package root. Read the current pass/fail/skip count from the run output rather
than a recorded total; the only expected skip is the `EGM_SOURCE`-gated Git
comparison. Check against another DSH runtime by setting `DSH_RUNTIME_VERSION`
(default `0.2.1-rc.5`, the version the `engines.dsh` range is validated against):

```sh
DSH_RUNTIME_VERSION=0.2.2 npm test
```

PowerShell: `$env:DSH_RUNTIME_VERSION='0.2.2'; npm test`.

To compare every locked vendored file with the pinned upstream Git object, point
`EGM_SOURCE` at an upstream checkout:

```sh
EGM_SOURCE=/path/to/upstream-checkout npm test
```

PowerShell: `$env:EGM_SOURCE='C:\path\to\upstream-checkout'; npm test`.

## What is checked

| Suite | Contract |
|---|---|
| `tests/unit/dsh_manifest.test.js` | `package.json` identity (`main`/`exports["."]` target the relocated `adapters/dsh/skills-host.js`); every public export key is preserved and retargeted under `adapters/dsh/`; `dsh.bundle.patch` is `./adapters/dsh/cordis.patch.yml` and inserts this package; `engines.dsh` admits the running DSH; declared `files` entries are non-empty, unique and exist; every required runtime, guide and provenance file is packed; repository-only trees and files (tests, examples, `docs/testing`, `scripts`, `.github`, `.dev`, the manual checker, the diagram renderer, D2 sources and any `*.EGM.md`) are never packed; the plain-JS entry imports only `node:` builtins and relative modules, so no install-time build is needed. |
| `tests/unit/dsh_engines.test.js` | `engines.node` is bounded and admits the CI-tested Node 22 and 24 majors; `engines.dsh` admits the recorded `0.2.1-rc.5` runtime, later `0.2.2` prereleases and the final `0.2.2` under DSH's `includePrerelease` policy, while refusing `0.3.0`. |
| `tests/unit/dsh_skill_metadata.test.js` | The seven vendored `skills/<dir>/SKILL.md` files exist; YAML frontmatter parses (including upstream's folded `>-` descriptions, which the adapter folds to one line); `name` is kebab-case and equals the directory; `description` is usable and at most 500 characters after folding; `license` stays `Apache-2.0`; invocation flags are literal booleans. |
| `tests/unit/dsh_resources.test.js` | The 19 vendored shared paths exist (upstream resources, skill-local `references/`, and `agents/*.md` personas); every `resources/...` path mentioned in skill or agent Markdown resolves against the package root; references use forward slashes; agent personas are non-empty Markdown. |
| `tests/unit/dsh_skills.test.js` | `adapters/dsh/skills-host.js` loads as a plain ES module that re-exports the integration layer; `apply()` registers all seven skills via `ctx.effect`/`ctx.skills.register`; each registration starts with the `<dsh_integration>` preamble, ends with the verbatim upstream body, and uses the package root as its resource base; the preamble keeps the DSH mechanics, names each reviewer's persona by a `Persona:` path, and keeps the context-selection contracts; the parser accepts every bundled `SKILL.md`, folds upstream block scalars, rejects YAML lists, and a malformed bundled skill in a temporary package fails activation instead of shrinking the install. |
| `tests/unit/dsh_reviewer.test.js` | The `egm_reviewer` tool from `adapters/dsh/reviewer-host.js` tells the model to name the persona file rather than paste it, starts exactly one `spawn` activation in the `egm-reviewer` preset with a depth cap of 1; it fails closed without the preset service, a `spawn` provider, or the declared preset; reviewer agents get a deny-list restriction that hides the non-read-only tools known at that point; the guard from `adapters/dsh/reviewer-tools.js` denies every non-allowlisted call (including a tool published later) and keeps `read`, `read_image`, `glob`, `grep` and the read-only `ops_*` readers. |
| `tests/unit/dsh_metadata.test.js` | `adapters/dsh/locale/en.json` and `adapters/dsh/locale/zh.json` declare non-empty `meta.title` and `meta.description`; locale filenames are language ids; `adapters/dsh/icon.svg` is valid SVG under DSH's 256 KiB limit and is reachable through `exports "./icon"`. |
| `tests/unit/dsh_upstream.test.js` | The one content gate. `upstream.lock.json` pins the upstream repository, commit and the 26 files in `adapters/dsh/check_upstream.mjs`; every shipped vendored file matches its SHA-256 as LF-normalized text; every git-tracked file under `skills/`, `agents/` and `resources/` has a lock entry and every entry is tracked; `files` ships every adapted file; with `EGM_SOURCE=<checkout>` every entry equals `git show <commit>:<path>`. Byte-identical files need no further upstream content tests. The Python `test_install` adds the literal check: it hashes each packed member's raw bytes and compares that digest with the lock's recorded SHA-256, so a newline-representation change cannot pass both gates. |

`tests/unit/dsh_helpers.js` holds the shared readers (frontmatter parser, file
walker, `files` glob matcher and a small SemVer range checker that mirrors DSH's
`includePrerelease` policy). `tests/unit/fixtures/` holds the stand-in skills the
parser tests use.

## Packaging note

Only the two rendered diagrams (`docs/assets/workflow.svg` and
`docs/assets/protocol.svg`) are shipped. Their D2 sources, the diagram README and
the renderer (`adapters/dsh/render_diagrams.mjs`) stay in the repository, as do
the manual upstream checker and every test tree; the packed-file checks in
`dsh_manifest.test.js` enforce that split. Host mechanics are documented in
[docs/dsh.md](../docs/dsh.md); the requirement map, reproducible commands and the
harness test record are in [TESTING.md](../TESTING.md).

## Python integration suite

The native replay gate lives in `tests/integration/`:

```sh
python3.12 -m venv /path/to/venv
/path/to/venv/bin/pip install -r tests/integration/dsh_requirements.txt
npm ci --prefix tests/integration/dsh-ci
/path/to/venv/bin/python -m pytest tests/integration tests/unit/test_dsh_traces.py -q
```

Set `DSH_EGM_LIVE=0` for the keyless offline run, `EGM_TEST_RUNTIME` to reuse a
cached installation of the locked Node 24 runtime, and `EGM_SOURCE` to an
upstream checkout for the provenance gate. The trace regressions in
`tests/unit/test_dsh_traces.py` run under pytest, not `npm test`. Paid live
acceptance is opt-in only; see [tests/integration/README.md](../tests/integration/README.md)
and [TESTING.md](../TESTING.md).

## Upstream test parity

Upstream's Python suite is not runnable against this package layout, so its offline intents are
covered by equivalent checks here:

| Upstream test intent | Covered by |
|---|---|
| Skill frontmatter schema | `tests/unit/dsh_skill_metadata.test.js` (including folded block scalars) |
| Relative link / reference integrity | `tests/unit/dsh_resources.test.js` (vendored paths and skill-local `references/`) |
| Portable plugin manifest and shared metadata consistency | `tests/unit/dsh_manifest.test.js`, `tests/unit/dsh_metadata.test.js` |
| Marketplace/component path checks | not applicable: this bundle ships no marketplace or component paths; the DSH manifest and patch rows are checked instead |
| Read-hook tests (POSIX shell) | not applicable: the package installs no hooks |
| Trace-based harness integration tests | [Python integration suite](../tests/integration/README.md): keyless replay covers install identity, reviewer isolation, read-only enforcement, skill delivery and host-injected context; opt-in live tests cover the workflow. [TESTING.md](../TESTING.md) maps each upstream requirement to its check |

`docs/testing/` is excluded from npm and contains the upstream semantic assessments
and local result records. The maintained [Python/native replay gate](../tests/integration/README.md)
uses the public SDK and locked native replay runtime; see [TESTING.md](../TESTING.md)
for the current Linux results and limits.
