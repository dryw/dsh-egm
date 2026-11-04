# dsh-egm test suite

Zero-dependency `node:test` suite that gates the package before publishing. Most
of the package is vendored verbatim from upstream EGM; the suite therefore checks
that the vendored tree stays byte-faithful, that the DeepSeek Harness integration
layer injects the right preamble and reviewer isolation, and that the bundle
manifest, locale and icon satisfy the DSH plugin contract.

The separate [Python integration suite](../tests/integration/README.md) checks the adapter
in a real Harness on Linux/Node 24/Python 3.12. It does not replace this JavaScript suite
or add dependencies to its unit/content checks. Install its locked dependencies separately.

## Requirements

- Node.js **>= 22** (locally validated on v24.19.0). No `npm install` is needed: the
  suite imports only `node:` builtins and the package's own files.
- Run from the package root (the directory containing `package.json`).

## Run

```sh
# Discover every test/*.test.js (Node >= 22 default discovery)
node --test

# Explicit glob; quote it so Node, not the shell, expands it
node --test "test/*.test.js"

# One suite while working
node --test "test/plugin.test.js"
```

> **Note:** `node --test test/` is not a directory argument on Node 24. The
> positional arguments after `--test` are glob patterns, and `test/` matches the
> directory itself, so Node tries to execute it as a test file and fails with
> `Cannot find module .../test`. Use `node --test` or the quoted glob above.

The suite currently has **41 tests** (`node --test` also lists the helper module
`test/helpers.js` as a file-level subtest, so its headline count is 42). Check against another DSH runtime by setting
`DSH_RUNTIME_VERSION` (default `0.2.1-rc.5`, the version the `engines.dsh` range is
validated against):

```sh
DSH_RUNTIME_VERSION=0.2.2 node --test
```

PowerShell: `$env:DSH_RUNTIME_VERSION='0.2.2'; node --test`.

## What is checked

| Suite | Contract |
|---|---|
| `test/manifest.test.js` | `package.json` identity, `exports` for the entry plus `./skills-host`, `./reviewer-host`, `./reviewer-tools`, `./locale/*.json` and `./icon`; `dsh.bundle.patch` inserts this package (rows may also name shipped packages such as the agent-preset registry); `engines.dsh` admits the running DSH; `files` entries exist and cover every runtime file; the plain-JS entry imports only `node:` builtins and relative adapter modules, so no install-time build is needed. |
| `test/engines.test.js` | `engines.node` is bounded and admits the CI-tested Node 22 and 24 majors; `engines.dsh` admits the recorded `0.2.1-rc.5` runtime, later `0.2.2` prereleases and the final `0.2.2` under DSH's `includePrerelease` policy, while refusing `0.3.0`. |
| `test/skills.test.js` | The seven vendored `skills/<dir>/SKILL.md` files exist; YAML frontmatter parses (including upstream's folded `>-` descriptions, which the adapter folds to one line); `name` is kebab-case and equals the directory; `description` is usable and at most 500 characters after folding; `license` stays `Apache-2.0`; invocation flags are literal booleans. |
| `test/resources.test.js` | The 19 vendored shared paths exist (upstream resources, skill-local `references/`, and `agents/*.md` personas); every `resources/...` path mentioned in skill or agent Markdown resolves against the package root; references use forward slashes; agent personas are non-empty Markdown. |
| `test/plugin.test.js` | `index.js` re-exports the integration layer; `apply()` registers all seven skills via `ctx.effect`/`ctx.skills.register`; each registration starts with the `<dsh_integration>` preamble, ends with the verbatim upstream body, and uses the package root as its resource base; the preamble keeps the DSH mechanics, names each reviewer's persona by a `Persona:` path, and keeps the context-selection contracts; the parser accepts every bundled `SKILL.md`, folds upstream block scalars, rejects YAML lists, and a malformed bundled skill fails activation instead of shrinking the install. |
| `test/reviewer.test.js` | The `egm_reviewer` tool tells the model to name the persona file rather than paste it, starts exactly one `spawn` activation in the `egm-reviewer` preset with a depth cap of 1; it fails closed without the preset service, a `spawn` provider, or the declared preset; reviewer agents get a deny-list restriction that hides every non-read-only tool; the preset guard denies every non-allowlisted call and keeps `read`, `read_image`, `glob`, `grep` and the read-only `ops_*` readers. |
| `test/ui-meta.test.js` | `locale/en.json` and `locale/zh.json` declare non-empty `meta.title` and `meta.description`; locale filenames are language ids; `icon.svg` is valid SVG under DSH's 256 KiB limit and is reachable through `exports "./icon"`. |
| `test/upstream-lock.test.js` | The one content gate. `upstream.lock.json` pins the upstream repository, commit and the 26 files in `scripts/check-upstream.mjs`; every shipped vendored file is byte-identical to its SHA-256 (LF-normalised); every git-tracked file under `skills/`, `agents/` and `resources/` has a lock entry and every entry is tracked; `files` ships every adapted file; with `EGM_SOURCE=<checkout>` every entry equals `git show <commit>:<path>`. Byte-identical files need no further upstream content tests. |

`test/helpers.js` holds the shared readers (frontmatter parser, file walker,
`files` glob matcher and a small SemVer range checker that mirrors DSH's
`includePrerelease` policy). `test/fixtures/` holds the stand-in skills the parser
tests use.

## Upstream test parity

Upstream's Python suite is not runnable against this package layout, so its offline intents are
covered by equivalent checks here:

| Upstream test intent | Covered by |
|---|---|
| Skill frontmatter schema | `test/skills.test.js` (including folded block scalars) |
| Relative link / reference integrity | `test/resources.test.js` (vendored paths and skill-local `references/`) |
| Portable plugin manifest and shared metadata consistency | `test/manifest.test.js`, `test/ui-meta.test.js` |
| Marketplace/component path checks | not applicable: this bundle ships no marketplace or component paths; the DSH manifest and patch rows are checked instead |
| Read-hook tests (POSIX shell) | not applicable: the package installs no hooks |
| Trace-based harness integration tests | [Python integration suite](../tests/integration/README.md): keyless replay covers install identity, reviewer isolation, read-only enforcement, skill delivery and host-injected context; opt-in live tests cover the workflow. [VERIFICATION.md](../VERIFICATION.md) maps each upstream requirement to its check |

`docs/testing/` is excluded from npm and contains the upstream semantic assessments
and local result records. The maintained [Python/native replay gate](../tests/integration/README.md)
uses the public SDK and locked native replay runtime; see [VERIFICATION.md](../VERIFICATION.md)
for the current Linux results and limits.
