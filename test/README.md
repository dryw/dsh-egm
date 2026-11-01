# dsh-egm test suite

Zero-dependency `node:test` suite that gates the package before publishing. Most
of the package is vendored verbatim from upstream EGM; the suite therefore checks
that the vendored tree stays byte-faithful, that the DeepSeek Harness integration
layer injects the right preamble and reviewer isolation, and that the bundle
manifest, locale and icon satisfy the DSH plugin contract.

## Requirements

- Node.js **>= 22** (validated on v24.16.0). No `npm install` is needed: the
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

The suite currently has **49 tests**. Check against another DSH runtime by setting
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
| `test/skills.test.js` | The seven vendored `skills/<dir>/SKILL.md` files exist; YAML frontmatter parses (including upstream's folded `>-` descriptions, which the adapter folds to one line); `name` is kebab-case and equals the directory; `description` is usable and at most 500 characters after folding; `license` stays `Apache-2.0`; invocation flags are literal booleans. |
| `test/resources.test.js` | The 19 vendored shared paths exist (upstream resources, skill-local `references/`, and `agents/*.md` personas); every `resources/...` path mentioned in skill or agent Markdown resolves against the package root; references use forward slashes; agent personas are non-empty Markdown. |
| `test/hygiene.test.js` | The integration layer this package authors (`index.js`, `skills-host.js`, `reviewer-host.js`, `reviewer-tools.js`, the bundle patch, locale) never names another agent harness and carries no other-harness install text. Vendored upstream text is exempt: it is byte-identical to upstream and the injected preamble tells the agent which sections do not apply. |
| `test/plugin.test.js` | `index.js` re-exports the integration layer; `apply()` registers all seven skills via `ctx.effect`/`ctx.skills.register`; each registration starts with the `<dsh_integration>` preamble, ends with the verbatim upstream body, and uses the package root as its resource base; the parser accepts every bundled `SKILL.md`, folds upstream block scalars, rejects YAML lists, and a malformed bundled skill fails activation instead of shrinking the install. |
| `test/reviewer.test.js` | The `egm_reviewer` tool starts exactly one `spawn` activation in the `egm-reviewer` preset with a depth cap of 1; it fails closed without the preset service, a `spawn` provider, or the declared preset; reviewer agents get a deny-list restriction that hides every non-read-only tool; the preset guard denies every non-allowlisted call and keeps `read`, `read_image`, `glob`, `grep` and the read-only `ops_*` readers. |
| `test/ui-meta.test.js` | `locale/en.json` and `locale/zh.json` declare non-empty `meta.title` and `meta.description`; locale filenames are language ids; `icon.svg` is valid SVG under DSH's 256 KiB limit and is reachable through `exports "./icon"`. |
| `test/upstream-parity.test.js` | Uses upstream EGM's own behavioural scenario suites (`test/fixtures/upstream-scenarios/`) as content tests: when the upstream skill text satisfies a required/contains pattern, the shipped `skills/<skill>/SKILL.md` must too; when upstream avoids a forbidden/not_contains pattern, the shipped text must avoid it. Each invariant is reported with scenario id, assertion, pattern and file; non-JavaScript patterns are counted and skipped, and a self-test proves the gate can fail. |
| `test/upstream-sync.test.js` | `upstream.lock.json` agrees with the vendored-file map in `scripts/check-upstream.mjs` (26 files), every vendored file exists and is shipped by `files`, every vendored fixture is byte-identical to its recorded SHA-256, and (when `EGM_SOURCE=<checkout>` is set) the lock matches a live upstream checkout. |
| `test/upstream-designs.test.js` | The vendored upstream design documents (`test/fixtures/upstream-designs/`) match the titles, mention counts and semantic-split (`## Detailed Implementation Plan` heading) state recorded in `corpus.json`, and the vendored review skill/template still enforce the semantic-split rule. |

`test/helpers.js` holds the shared readers (frontmatter parser, file walker,
`files` glob matcher and a small SemVer range checker that mirrors DSH's
`includePrerelease` policy). `test/upstream-fixtures.js` holds the tiny YAML reader
and the parity rule that `test/upstream-parity.test.js` applies. `test/fixtures/`
holds stand-in skills plus the upstream fixtures vendored from
`google/elephant-goldfish-model` at the commit pinned in `upstream.lock.json`; the
fixtures are test data, not bundled content.

The upstream fixtures are Apache-2.0, Copyright Google LLC; attribution is in the
package `NOTICE`. Refresh them from a new upstream commit, then run
`node scripts/check-upstream.mjs --update-lock` so the recorded hashes match.

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
| Trace-based harness integration tests | replaced by live probes recorded in the package review notes: upstream scenario probes through the installed skills, and the read-only reviewer isolation probe |
