# Testing

Upstream pin: `113a3afc44e8f4f54722d7150d5701f65cc8ef7f` in
[upstream.lock.json](upstream.lock.json). This page maps each upstream support
requirement to the dsh-egm check that answers it, states each limit, and is the
harness test record. Host mechanics, manifest mapping and the composed
isolation layers live in [docs/dsh.md](docs/dsh.md).

Status: for 0.3.0 the free checks, the automated workflow run and the manual
human-pause run passed; 0.3.1 is runtime-identical and passes the free checks. Upstream-support acceptance is an EGM maintainer
decision and is **pending**. Every run,
passed or failed, is a row in the [harness test record](#harness-test-record).

Sources at that commit: A = [`docs/designs/additional-harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/designs/additional-harnesses.md)
("Architecture and data flow", "Validation and release gates");
H = [`docs/harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/docs/harnesses.md);
T = [`TESTING.md`](https://github.com/google/elephant-goldfish-model/blob/113a3afc44e8f4f54722d7150d5701f65cc8ef7f/TESTING.md).

## Commands

| Layer | Command | Cost |
| --- | --- | --- |
| Node suite | `npm test` (quoted `tests/unit/*.test.js`; CI: Linux and Windows) | Free |
| One Node suite | `node --test "tests/unit/<name>.test.js"` | Free |
| Upstream drift check | `node adapters/dsh/check_upstream.mjs` (repository-only, manual; see [upstream drift check](#upstream-drift-check)) | Free |
| Raw-Git provenance and extraction | offline `EGM_SOURCE`/`git show` procedure under [raw-Git provenance and extraction](#raw-git-provenance-and-extraction) | Free |
| Keyless DSH tests | `DSH_EGM_LIVE=0 pytest tests/integration tests/unit/test_dsh_traces.py -q` (CI: Linux) | Free |
| Packed-file check | CI pack check: `npm pack --dry-run` compared with `package.json` `files` | Free |
| Paid DSH tests | `DSH_EGM_LIVE=1 pytest tests/integration -q`, see [paid live runs](#paid-live-runs) | API credit |
| Manual interactive run | steps under [manual interactive run](#manual-interactive-run) | API credit |

## Node suite

Zero-dependency `node:test` suite that gates the package before publishing. Most
of the package is vendored verbatim from upstream EGM; the suite therefore checks
that the vendored tree stays byte-faithful, that the DeepSeek Harness integration
layer injects the right preamble and reviewer isolation, and that the bundle
manifest, locale and icon satisfy the DSH plugin contract. The separate keyless
DSH suite below checks the adapter in a real Harness on Linux/Node 24/Python
3.12, including the trace regressions in `tests/unit/test_dsh_traces.py`. It does
not replace this JavaScript suite or add dependencies to its unit/content
checks; install its locked dependencies separately.

Requirements: Node.js **>= 22** (locally validated on Node 24); no `npm install`
is needed, because the suite imports only `node:` builtins and the package's own
files. Run from the package root (the directory containing `package.json`).

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

### What the Node suite checks

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

### Packaging split

Only the two rendered diagrams (`docs/assets/workflow.svg` and
`docs/assets/protocol.svg`) are shipped. Their D2 sources, the diagram README and
the renderer (`adapters/dsh/render_diagrams.mjs`) stay in the repository, as do
the manual upstream checker and every test tree; the packed-file checks in
`dsh_manifest.test.js` enforce that split. Host mechanics are documented in
[docs/dsh.md](docs/dsh.md); the requirement map and the harness test record are
this page.

### Upstream test parity

Upstream's Python suite is not runnable against this package layout, so its
offline intents are covered by equivalent checks here:

| Upstream test intent | Covered by |
|---|---|
| Skill frontmatter schema | `tests/unit/dsh_skill_metadata.test.js` (including folded block scalars) |
| Relative link / reference integrity | `tests/unit/dsh_resources.test.js` (vendored paths and skill-local `references/`) |
| Portable plugin manifest and shared metadata consistency | `tests/unit/dsh_manifest.test.js`, `tests/unit/dsh_metadata.test.js` |
| Marketplace/component path checks | not applicable: this bundle ships no marketplace or component paths; the DSH manifest and patch rows are checked instead |
| Read-hook tests (POSIX shell) | not applicable: the package installs no hooks |
| Trace-based harness integration tests | the [keyless DSH suite](#keyless-suite-setup): keyless replay covers install identity, reviewer isolation, read-only enforcement, skill delivery and host-injected context; opt-in live tests cover the workflow. The [requirement map](#requirement-map) maps each upstream requirement to its check |

The maintained Python/native replay gate below uses the public SDK and the
locked native replay runtime.

## Keyless suite setup

The keyless DSH suite needs Linux, Node 24 and Python 3.12. From the repository
root:

```sh
python3.12 -m venv /path/to/venv
/path/to/venv/bin/pip install -r tests/integration/dsh_requirements.txt
npm ci --prefix tests/integration/dsh-ci
DSH_EGM_LIVE=0 /path/to/venv/bin/python -m pytest tests/integration tests/unit/test_dsh_traces.py -q
```

`tests/integration/dsh-ci/` holds the locked Node runtime package pins;
`tests/integration/dsh_requirements.txt` holds the Python pins. Set
`EGM_TEST_RUNTIME` to point at a different installation of the locked Node
runtime (a Linux-local directory under WSL). The paid tests stay skipped unless
`DSH_EGM_LIVE=1`; `npm test` runs the separate Node suite. CI runs the suite with
paid tests disabled.

What it checks:

- `tests/integration/test_dsh.py`: `test_install` compares every packed file with
  the installed copy and hashes every locked vendored archive member's literal
  bytes, comparing the digest with the lock (no newline normalization);
  `test_adapter` checks skill delivery, parent controls, fresh-context isolation,
  reads, write/shell guard denials, child completion, and records whether a
  project `AGENTS.md` reaches the parent and the reviewer
  (`controls/host-context.json`).
- `tests/unit/test_dsh_traces.py`: synthetic negative cases showing each evidence
  check can fail, including malformed JSONL and rejection of parent-only reviewer
  claims. Keyless regressions also prove `write_identity` reads the installed
  package's own upstream pin and that the archive byte check rejects
  CRLF-rewritten bytes.
- `test_dsh_live.py`: two paid tests, skipped unless explicitly enabled, plus the
  `check` and `profile` commands described under [paid live runs](#paid-live-runs)
  and [manual interactive run](#manual-interactive-run).

`run_dsh` and the `profile` command pass the installed package's
`adapters/dsh/agent-presets.patch.yml` (the opt-in D8 prerequisite patch) as an
additional patch, so keyless and paid runs load the same file a user applies.
`profile_rows` keeps only the observer, session-persistence and replay-provider
rows, which are instrumentation rather than prerequisites. The keyless
`test_missing_agent_presets` omits the patch and asserts the exact fail-closed
error. See [host prerequisites and current limits](#host-prerequisites-and-current-limits)
and [docs/dsh.md](docs/dsh.md).

Evidence is retained under pytest's temporary directory: requests and tool
results, notifications, native Sessions and artifacts. Pass a fresh `--basetemp`
path to keep it; pytest clears an existing basetemp. Fixtures use native replay
entries and native-writer Session seeds. Do not invent lifecycle events;
regenerate seeds with the pinned runtime and validate them through its
`parseSessionLog` and `deriveReplayScript` APIs before replacing them.

## Upstream drift check

The upstream checker is repository-only tooling. The npm package does not ship
`adapters/dsh/check_upstream.mjs` or `adapters/dsh/render_diagrams.mjs`;
`package.json` `files` enumerates the shipped paths explicitly, and the CI pack
check rejects either checker or renderer if it leaks into a tarball.

`upstream.lock.json` pins the upstream commit and, for every vendored upstream
file this package ships, the SHA-256 of its repository text with LF line endings.
The Node test compares the shipped files as LF-normalized text; the Python
archive check hashes each packed member's raw bytes and compares that digest with
the recorded value. The checker compares that pin with the upstream default
branch and reports which vendored files a re-adaptation must touch. It is a manual
maintainer step, not part of the daily test run; the daily workflow runs the check
and surfaces drift through its CI status and logs, and never rewrites the lock or
re-adapts content automatically.

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
  `GITHUB_API_URL` overrides the API base (GitHub Enterprise).
- `--update-lock` is a human step: the daily workflow only reports drift, it never
  rewrites the lock or re-adapts content automatically. It also never moves the pin
  silently — run it against the `--ref` you checked.
- When upstream changed but none of the mapped files changed, the script still
  exits 1 (upstream moved) but says no re-adaptation is required; refresh the lock.
- To adapt a newly vendored upstream file, add `[upstreamPath, adaptedPath]` to
  `ADAPTED_FILES` in `adapters/dsh/check_upstream.mjs`, run
  `node adapters/dsh/check_upstream.mjs --update-lock --source <checkout>`, and
  keep the script change and `upstream.lock.json` in the same change;
  `tests/unit/dsh_upstream.test.js` fails if the two drift apart.

The diagram renderer is repository-only in the same way; its sources, assets and
theming notes are in [docs/assets/README.md](docs/assets/README.md).

## Raw-Git provenance and extraction

The live test follows the two scenarios in upstream `test_codex.py` at the pinned
commit. DSH supplies startup, native skill invocation and trace decoding;
`tests/integration/upstream_contract.py` retains the artifact and reviewer-count
assertions. Replay tests exercise host mechanics, not model behavior.

The canonical prompt and the extracted assertions are pinned to raw Git bytes,
not to a working copy. `tests/integration/fixtures/dsh_line_count_provenance.json`
records the commit, source path, Git blob SHA-1, prompt SHA-256 and prompt byte
count. The procedures below are offline, free and invoke no model. Ordinary CI
runs neither; record their result for a candidate explicitly.

First, extract and verify the host-neutral upstream assertions from raw Git bytes,
in a Linux shell with an upstream clone that contains the pinned commit:

```sh
# e.g. C:/Users/dryw/Projects/dsh-egm/.dev/upstream-clone on Windows
export EGM_SOURCE=/path/to/upstream-clone
mkdir -p .dev/acceptance
git -C "$EGM_SOURCE" show 113a3afc44e8f4f54722d7150d5701f65cc8ef7f:tests/integration/test_codex.py > .dev/acceptance/upstream-test-codex-lf.py
python3.12 tests/integration/extract_upstream_contract.py .dev/acceptance/upstream-test-codex-lf.py --check
```

Second, the full provenance checkpoint. Point `EGM_SOURCE` at a clone that
contains the pinned commit (for example the main checkout's
`.dev/upstream-clone`). It compares the fixture's blob, prompt and extraction
records with raw Git objects, and checks every lock hash against its pinned Git
object. It records `.dev/docs/provenance_check.json`; a mismatch records failure
and exits nonzero. `.dev/` is private, git-ignored scratch.

```sh
export EGM_SOURCE=/path/to/upstream-clone   # clone containing the pinned commit
python3.12 - <<'PY'
import ast, hashlib, json, os, subprocess, sys, tempfile
from pathlib import Path
repo = Path.cwd()
clone = Path(os.environ["EGM_SOURCE"])
integration = repo / "tests/integration"
meta = json.loads((integration / "fixtures/dsh_line_count_provenance.json").read_text(encoding="utf-8"))
prompt_path = integration / "fixtures/dsh_line_count_prompt.txt"
lock = json.loads((repo / "upstream.lock.json").read_text(encoding="utf-8"))
out = repo / ".dev/docs/provenance_check.json"
out.parent.mkdir(parents=True, exist_ok=True)
report = {"result": "fail"}
try:
    assert meta["source_commit"] == lock["commit"]
    raw = subprocess.check_output(["git", "-C", str(clone), "show", meta["source_commit"] + ":" + meta["source_path"]])
    blob = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
    assert blob == meta["source_git_blob_sha1"]
    sys.path.insert(0, str(integration))
    from extract_upstream_contract import extract
    assert (integration / "upstream_contract.py").read_bytes() == extract(raw).encode("utf-8")
    with tempfile.TemporaryDirectory(prefix="egm-provenance-") as temporary:
        source = Path(temporary) / "test_codex.py"
        source.write_bytes(raw)
        subprocess.run([sys.executable, str(integration / "extract_upstream_contract.py"), str(source), "--check"], check=True)
    fn = next(n for n in ast.walk(ast.parse(raw)) if isinstance(n, ast.FunctionDef) and n.name == meta["source_function"])
    assignments = [n for n in ast.walk(fn) if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == meta["source_variable"] for t in n.targets)]
    assert len(assignments) == 1
    prompt = ast.literal_eval(assignments[0].value).encode("utf-8")
    digest = hashlib.sha256(prompt).hexdigest()
    assert digest == meta["prompt_sha256"] and len(prompt) == meta["prompt_bytes"]
    assert prompt == prompt_path.read_bytes()
    for entry in lock["files"]:
        original = subprocess.check_output(["git", "-C", str(clone), "show", lock["commit"] + ":" + entry["upstream"]])
        assert hashlib.sha256(original).hexdigest() == entry["sha256"], entry["upstream"]
    report.update(result="pass", commit=lock["commit"], source_blob=blob, prompt_sha256=digest, vendor_hashes=len(lock["files"]))
except Exception as error:
    report["error"] = type(error).__name__ + ": " + str(error)
    raise
finally:
    out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report))
PY
```

The checkpoint verifies that the fixture's source commit equals the lock commit;
the pinned source blob's SHA-1 equals the fixture's; the extracted
`upstream_contract.py` bytes equal what the extractor regenerates, including its
`--check` drift assertion; the prompt AST assignment, UTF-8 bytes, byte count and
SHA-256 equal the fixture and the prompt file; and all 26 lock hashes equal the
bytes of their pinned Git objects.

Optional network probe, distinct from the offline check above:
`python3.12 tests/integration/verify_dsh_prompt.py` fetches the pinned source from
`raw.githubusercontent.com` and repeats the blob, prompt byte-length and SHA-256
checks. It is keyless and invokes no model.

## Paid live runs

Paid. Run in WSL from the repository root after the keyless setup above. Pack a
fixed tarball first and note the commit it came from.

```sh
export EGM_TEST_RUNTIME=/home/dryw/.cache/dsh-egm-linux-runtime
export PATH=/home/dryw/.cache/dsh-egm-node24/node_modules/.bin:$EGM_TEST_RUNTIME/node_modules/.bin:/usr/bin:/bin
export DSH_EGM_TARBALL="$PWD/.dev/acceptance/dsh-egm-<version>.tgz"
export DSH_EGM_SOURCE_SHA=<commit the tarball was packed from>
export DSH_EGM_MODEL=deepseek-flash
read -rsp 'DeepSeek API key: ' DEEPSEEK_API_KEY; echo
export DEEPSEEK_API_KEY
DSH_EGM_LIVE=1 /home/dryw/.cache/dsh-egm-acceptance-venv/bin/python -m pytest tests/integration -s -q --basetemp "$HOME/.cache/dsh-egm-live-$(date +%s)"
unset DEEPSEEK_API_KEY
```

Replace the cached runtime, Node 24 bin directory and acceptance venv with your
own paths; `EGM_TEST_RUNTIME` and `tests/integration/dsh-ci/` are described in the
keyless setup above. With `-s`, each run prints a timestamped line when a reviewer
starts or finishes and when the parent writes or edits a file, so a long review
shows its stage.

Paid runs enable thinking with `reasoningEffort: high` (override with
`DSH_EGM_REASONING=low|high|max`). Upstream's Codex test runs at medium reasoning;
DeepSeek offers no medium, and high is its default when thinking is on.
`identity.json` records the effort used.

This runs the whole suite against the tarball, so install, isolation and
workflow are separate outcomes. It spends API credit: 32,768 output tokens per
response, a 60-minute SDK wait per run (`DSH_EGM_WAIT_SECONDS` overrides it), no provider retries and no total cap. Keep native
logs private; the client closes in `finally`.

The workflow test sends the unchanged upstream line-count prompt after one block
of native slash invocations of the three skills. Each paid test writes
`identity.json` before the model runs; its upstream pin comes from the installed
package's own `upstream.lock.json`, so an explicitly selected tarball records the
pin it was packed from rather than this checkout's. The workflow test writes
`checks.json` with every check's result, then fails if any check failed. See
[Live results](#live-results) for how to read it and for the `check` command that
inspects retained or manual evidence without changing it.

## Manual interactive run

Upstream requires a real human approval pause. Use the same tarball.

1. Prepare a disposable profile with logs, observer and identity record:

   ```sh
   python tests/integration/test_dsh_live.py profile "$HOME/.cache/dsh-egm-manual-$(date +%s)" \
     --tarball "$DSH_EGM_TARBALL" --source-sha "$DSH_EGM_SOURCE_SHA" --model "$DSH_EGM_MODEL"
   ```

   It installs the tarball into DSH's shipped `web` profile and prints the command
   that starts the browser UI with the run's `profile.patch.json` (session logs,
   observer, model provider). `web` already composes the agent-preset registry, so
   the opt-in `adapters/dsh/agent-presets.patch.yml` is not added. Run the printed
   command with `DEEPSEEK_API_KEY` exported and open the URL it prints.
2. Type `/egm-brainstorm`, then the feature paragraph and author line from
   `tests/integration/fixtures/dsh_line_count_prompt.txt`, without its approval
   paragraph. Answer every gate yourself.
3. Type `/egm-draft concepts_brief.md` and answer every gate yourself.
4. Type `/egm-review design_draft.md` and choose Step `uninterrupted`.
5. Quit, then run `python tests/integration/test_dsh_live.py check <dir>`.
6. For the pause, quote the native log rows for one question and for your typed
   answer, with their times. Record this run in its own row (see
   [record row template](#record-row-template)).

## Requirement map

| # | Upstream requirement | Check, record or limit | Status |
| --- | --- | --- | --- |
| 1 | Manifest parsing, identity, version (A) | `dsh_manifest`, `dsh_engines`, `dsh_metadata` tests; CI pack check | Pass |
| 2 | Persona, standard, guide paths in the installed layout (A) | `test_install`: every packed file equals the installed file, and every locked vendored member's literal bytes hash to its recorded lock SHA-256 (no newline normalization) | Pass (keyless) |
| 3 | Adapter tool restrictions (A) | `dsh_reviewer` test; `test_adapter` real denials | Pass |
| 4 | No copies of shared behavior; no fork of skill text (A, H) | `dsh_upstream`: the bundled copy matches the LF-normalized `113a3af` bytes recorded in the lock, a pinned copy, not a fork; the raw archive bytes are checked by row 2. The preamble restates some upstream rules in DSH terms. Whether an external package counts is row 19 | Pass; packaging open |
| 5 | Negative fixtures for each evidence parser (A) | Synthetic cases in [tests/unit/test_dsh_traces.py](tests/unit/test_dsh_traces.py) | Pass (keyless) |
| 6 | Clean host profile, fixed candidate (A) | Disposable `DSH_HOME`; `DSH_EGM_TARBALL`. The keyless and paid runs load the installed `adapters/dsh/agent-presets.patch.yml` (opt-in, D8); no fixture-injected prerequisite rows. Limit: the patch is applied with `--patch` and the package does not compose the registry automatically, so `headless` or `sdk` need it added | Paid run |
| 7 | Candidate SHA, checksum, host version and surface, model, date (A) | `identity.json`; the upstream pin comes from the installed package's own `upstream.lock.json` | Paid run |
| 8 | Install, workflow, isolation recorded separately (A) | `test_install`; `test_brainstorm_draft_review`; `test_adapter` and `test_fresh_context_isolation` | Paid run |
| 9 | Brainstorm, draft, review end to end through the install (H) | `test_brainstorm_draft_review` | Paid run |
| 10 | A real human approval pause (A) | Manual run record, quoting the native question and answer rows | Manual run |
| 11 | Reviewer starts and completions from host records (A) | `child_traces` | Paid run |
| 12 | A missing reviewer is not a passing review; no inline simulation (A) | `child_traces`; parent-receipt case | Pass (keyless) |
| 13 | Sequential stages (T) | `assert_stage_order` | Paid run |
| 14 | Random parent-only marker (A) | `test_fresh_context_isolation`; `test_adapter` | Pass (keyless) |
| 15 | Reviewer reads persona, target and standard (A, T) | `assert_required_reads`. Limit: `GoldfishContext` entries are a reading list, not checked | Paid run |
| 16 | Inspect host-injected context; memory and MCP (A) | `AGENTS.md` probe in `test_adapter` (`host-context.json`); exact reviewer tool set `{read, read_image, glob, grep}` | Seen: DSH 0.2.1-rc.5 puts project `AGENTS.md` into the reviewer request. User-level instruction files and memory not probed |
| 17 | Read-only enforcement on a disposable fixture (A) | `test_adapter` sentinels and exact guard errors | Pass (keyless) |
| 18 | Missing delegation stops with a clear message (A) | `dsh_reviewer` fail-closed errors | Pass. Limit: the skill stopping is model behavior |
| 19 | Manifest in the upstream repo, `docs/harnesses.md` entry, transcripts in the PR (H) | Upstream decides: external package, or a manifest and adapter moved upstream ([#240](https://github.com/google/elephant-goldfish-model/issues/240)) | Open |
| 20 | A successful read is non-error, non-empty text and does not prove the whole file was read (T) | Rule in `assert_required_reads` | Limit stated |
| 21 | Reviewers cannot reach unrelated reports through the filesystem (A) | None: DSH guards tool names, not paths | Limit |
| 22 | Host agent-preset prerequisites (D3/D3a, amended by D8) | Shipped opt-in `adapters/dsh/agent-presets.patch.yml`; `run_dsh` and the `profile` command load the installed file; `test_missing_agent_presets` asserts the exact fail-closed error without it. Limit: opt-in only; no automatic composition or repair | Pass (keyless); opt-in only |

## Host prerequisites and current limits

`egm_reviewer` needs a profile that composes an `agentPresets` registry resolving a
valid default preset, plus an in-process `spawn` subagent provider. The bundle
declares the read-only `egm-reviewer` preset but does not compose the registry or
its default. The shipped `web` template composes a registry (`default: standard`)
and `spawn`; the shipped `headless` and `sdk` templates compose `spawn` but no
registry. For those, the package ships an opt-in patch,
`adapters/dsh/agent-presets.patch.yml`, applied with the public launcher option
`--patch <installed package>/adapters/dsh/agent-presets.patch.yml`. Profiles that
already compose a registry need nothing; applying the patch to `web` with DSH
0.2.1-rc.5 exits 0 but yields a second registry/preset pair with the same ids in
the `--dump-config` composition, so it is not merged or refused.

The keyless replay runs (`run_dsh` and the `profile` command in
`tests/integration/test_dsh_live.py`) pass the **installed** copy of that file as
an additional patch, so they load what a user loads; no test injects the
registry or preset rows itself. The observer, session-persistence and replay
provider rows remain instrumentation, not prerequisites. The negative test
`test_missing_agent_presets` omits the patch and asserts the exact fail-closed
error (see [docs/dsh.md](docs/dsh.md#host-prerequisites-and-current-limit)).

The package still does **not** compose the prerequisites automatically and does
not repair an existing registry whose default is missing or invalid. Supplying
the patch is a launcher step; bare SDK and arbitrary-profile workflow therefore
remains **pending** unless the patch is added. This candidate makes no support
claim for those surfaces.

The test `identity.json` reads the upstream pin from the installed package's own
lock. A hand-selected tarball therefore records its own pin instead of this
checkout's.

## Live results

`test_brainstorm_draft_review` runs every check and writes `checks.json` before
it fails on any of them, so one failure never hides the rest. To check retained
or manual evidence without changing it:

```sh
python tests/integration/test_dsh_live.py check <evidence-dir> --out <checks.json>
```

A Status-only difference between `design_draft.md` and the final design is listed
under `deviations` as `status-line-only`, and the upstream assertion still fails.
The record row then follows upstream's Antigravity row: Review "Pass (fixture)"
only when `upstream_artifacts` is the sole failing check and `deviations` is
exactly `["status-line-only"]`, with Notes "The final design differs from the
draft in one `Status` line"; otherwise Fail.

## Record row template

Columns as in upstream `TESTING.md`, "Harness Test Record". Fill one row for the
automated run and one for the manual run, because upstream records surfaces
separately.

```text
| DeepSeek Harness (<surface>) | <dsh_version> | <date_utc> | <test_install> | <Brainstorm> | <Draft> | <Review> | dsh-egm <package_version> from <source_sha>, tarball SHA-256 <tarball_sha256>; model <model>. <reviewers>, <stage_order>, <required_reads>. <deviations>. <limits> |
```

## Harness test record

One row per run or run series, newest first, in upstream's `TESTING.md` columns. The 2026-11-04 runs
used DSH 0.2.1-rc.5 on Linux (WSL) through the `sdk` profile and the SDK client
(`sdk-headless`), with model `deepseek-flash`. "Isolation" is upstream's
parent-only marker probe plus the keyless replay checks. Development runs are
summarized in one row; their failures are named there.

| Harness | Version | Date | Install | Brainstorm | Draft | Review | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DeepSeek Harness (sdk-headless, web) | 0.2.1-rc.5 | 2026-11-05 | — | — | — | — | dsh-egm 0.3.1, no new paid run. Tarball `candidate/3` (`0d1a0b6`, SHA-256 `3d56baa682ee265f16ee8f52812373485486b4100ad566ab1cb24ba3c27aa2f8`) moves the Chinese README to `docs/README.zh-CN.md`, because npm took the root `README.zh-CN.md` as the 0.3.0 package readme. Against 0.3.0 (`candidate/2`) every runtime file is byte-identical; only `README.md`, `docs/dsh.md`, `CHANGELOG.md`, `package.json` (version and `files`) and the README's path differ. The Node suite and the keyless DSH suite pass on this tarball; the 0.3.0 automated and manual rows below are its workflow evidence. |
| DeepSeek Harness (web) | 0.2.1-rc.5 | 2026-11-05 | Pass | Pass | Pass | Pass | dsh-egm 0.3.0. Manual interactive run on `candidate/2` (SHA-256 `e32de0855dd0ce41d6995db9891bcd8f315caba2da4d4fe86105d9f39d112f87`) in the shipped `web` profile in a browser, `deepseek-flash`, `reasoningEffort: high`, every gate answered by a person. Human pause: the native `ask_user_question` call (readiness gate, seq 60) at 03:55:35 UTC and its typed answer `{"answers":[{"id":"readiness","selected":["Review with Goldfishes"]}]}` (seq 61) at 03:56:50 UTC; 21 native questions in all. Reviewers, stage order, required reads and skill delivery pass: 15 reviewers, stages sequential. The artifact check could not run, because after the review the operator also ran `/egm-resolve`, which rewrote the design and deleted `design_draft.md`; the design was saved as `docs/designs/line_count.md`, and the UI ran in `~/manual-test` rather than the prepared workspace (the check was pointed there from a scratch copy). |
| DeepSeek Harness (sdk-headless) | 0.2.1-rc.5 | 2026-11-05 | Pass | Pass | Pass | Pass | dsh-egm 0.3.0. Automated run on the release tarball `candidate/2` (`323b4f7`, SHA-256 `e32de0855dd0ce41d6995db9891bcd8f315caba2da4d4fe86105d9f39d112f87`), `deepseek-flash`, `reasoningEffort: high`; the full suite passed with exit 0. Every workflow check passed with no deviations and no remediation: 15 reviewers, one turn each, no follow-up messages; stages sequential with no edits during a stage; required reads pass; final design byte-identical to the reviewed draft. The stage reviewers read the final copy `docs/designs/line-count.md` rather than `design_draft.md`; the two were byte-identical, and after the last stage the parent relabelled the report `Target` lines to name the draft. |
| DeepSeek Harness (sdk-headless) | 0.2.1-rc.5 | 2026-11-04 | Pass | Pass | Pass | Pass | dsh-egm 0.3.0. Automated run on `candidate/1` (`96eed0f`, tarball SHA-256 `51dd2f40a0c0f3df9e8c2cc82e6b05d943b38820c6ef5b05ba7a0bec51e70d2c`), `deepseek-flash`, `reasoningEffort: high`. Install, both isolation tests and the missing-patch refusal passed in the full suite; that run's workflow test hit the old 20-minute wait at stage 9, and the workflow rerun on the same tarball passed every check: 15 reviewers, one turn each, no follow-up messages; stages sequential with no edits during a stage; required reads pass; final design byte-identical to the reviewed draft. The release tarball `candidate/2` (`323b4f7`, SHA-256 `e32de0855dd0ce41d6995db9891bcd8f315caba2da4d4fe86105d9f39d112f87`) has byte-identical runtime files (the 26 vendored files, adapter modules, both patches, locales, icon and lock); it differs only in `docs/dsh.md`, `CHANGELOG.md`, the `package.json` `files` list, and no longer packing `TESTING.md`. |
| DeepSeek Harness (sdk-headless) | 0.2.1-rc.5 | 2026-11-04 | Pass | — | — | — | Development runs, not release evidence: seven paid runs with `deepseek-flash`, from the published 0.2.4 through candidate `1d208c2`. Isolation passed on every full run. The workflow failures they found are fixed and now checked: reviewers received abridged persona text (personas are now read by path); review stages ran in parallel (the preamble states upstream's sequencing rule); with reasoning off the parent stopped after brainstorm once and skipped the brainstorm reviewers once (paid runs use `reasoningEffort: high`); a reviewer was resumed and the draft was edited during a stage (both refused or checked). The last run, on `1d208c2`, passed every check with the final design byte-identical to the reviewed draft. The release candidate still needs its own rows. |

## Free checks (not acceptance)

The free checks run on every candidate: the Node suite, the keyless DSH suite,
the packed-file and installed-file comparisons, the raw-byte and raw-Git
provenance checks for all 26 vendored files, export-key resolution and a
relative-link check. They cover packaging, installed identity, host mechanics
under replay, provenance and documentation. They do not establish the workflow,
the human pause or upstream acceptance.
