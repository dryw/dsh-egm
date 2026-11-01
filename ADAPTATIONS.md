# Upstream parity and the DeepSeek Harness integration layer

`dsh-egm` packages [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)
for DeepSeek Harness. The skills, agent personas and shared standards are vendored **verbatim** from
the upstream commit pinned in [upstream.lock.json](upstream.lock.json)
(`403d8881d62022490637d740657b33f01e321ea8`). No skill text is forked for this harness. Upstream's
own rule is that one skill set serves every harness and each harness maps the generic instructions
to its own tools; this package follows that rule.

## What is verbatim

| Vendored path | Upstream path |
|---|---|
| `skills/<name>/SKILL.md` | `skills/<name>/SKILL.md` |
| `skills/egm-draft/references/design_doc.md` | same |
| `skills/egm-bootstrap/references/` | same |
| `agents/*.md` | `agents/*.md` |
| `resources/execution_instructions.md`, `resources/document_standards/`, `resources/README.md` | same |

`upstream.lock.json` records the upstream commit and the SHA-256 of each file. `node --test` fails
if a vendored file drifts from that record, and `scripts/check-upstream.mjs` reports when upstream
moves.

## What the adapter adds

The only authored code is the DeepSeek Harness layer:

- **`skills-host.js`** registers each vendored `SKILL.md` in the Harness skill registry. Its body is
  the verbatim upstream Markdown; at registration it receives a short `<dsh_integration>` preamble
  built for that skill. The preamble supplies the package root and the skill's own directory, maps
  the upstream plugin-root paths, lists which upstream sections describe other harnesses and must be
  ignored, and states the DeepSeek Harness mechanics:
  - Goldfish reviewers are started with `egm_reviewer({ description, prompt })`, never `subagent`
    and never `subagent_fork`;
  - bootstrap partition workers use the generic `subagent` tool because they write contracts;
  - interactive gates use `ask_user_question` with `{ label, description }` options and no
    `(Recommended)` prefix;
  - artifacts are written to the project working directory, not into the package.
- **`reviewer-host.js`** provides the `egm_reviewer` tool. It starts an in-process `spawn` child with
  the independent `egm-reviewer` agent preset and a depth cap that forbids the child from
  delegating. It also applies a deny-list restriction at the child's agent scope so the reviewer's
  visible tool schema contains only read/search tools.
- **`reviewer-tools.js`** is mounted inside the `egm-reviewer` preset. It hides every non-read-only
  global tool and registers a guard that denies any non-allowlisted call as a second layer.
  Allowed: `read`, `read_image`, `glob`, `grep`, and the read-only `ops_*` file readers.
- **`cordis.patch.yml`** inserts the two host rows and declares the `egm-reviewer` agent preset,
  whose plugin list composes only a persona, read-only file tools and search tools, compaction, and
  the reviewer guard. It has no write, edit, shell, terminal, job, schedule, goal, todo, question,
  presentation, delegation or session-reading tool.

The integration preamble is injected at registration; it is not written into the vendored files.
Replacing or refreshing the vendored tree therefore never loses harness mechanics, and reading the
vendored files still shows exactly what upstream ships.

## Path mapping

The upstream text uses three kinds of paths, which the preamble resolves explicitly:

- the upstream plugin-root placeholder, `agents/...`, `resources/...` → the package root;
- `references/...` → the current skill's own directory;
- project paths such as `docs/designs/...` → the user's project working directory.

## Reviewer isolation

This is enforced by the Harness, not by a persona instruction:

- the reviewer child is a fresh `spawn` child (never a fork, so it does not inherit the
  conversation);
- its preset exposes only read/search tools (verified live: no write, edit, shell, terminal, job,
  question, presentation, subagent or session-reading tool; a global discovery tool that remains in
  the schema is rejected by the guard at call time);
- a depth cap of 1 admits the reviewer but forbids it from delegating;
- the agent-scope deny-list and the preset guard are two independent layers, so a future tool
  registered by another plugin is still denied unless it is on the read-only allowlist.

## Harness support status against upstream's criteria

Upstream (`docs/harnesses.md`) counts a harness as supported when the core commands run end to end
through its install and reviewer isolation is verified. On this package:

- **Install and discovery: pass.** The bundle installs from a local path or tarball, composes
  `# == dsh-egm`, registers seven user-invocable skills, and resolves vendored resources.
- **Reviewer isolation: pass for the EGM reviewer path**, as described above.
- **End-to-end fixtures: partial.** Upstream's scenario suites are content-parity fixtures and live
  probes exercised brainstorm, review, review-loop, draft and reviewer isolation, but no automated
  end-to-end fixture runs the three core commands against a live model.

We do not plan to open a pull request against the upstream EGM repository. The strategy is to make
the plugin useful and visible in the DeepSeek Harness ecosystem; if it earns adoption, someone else
(a user, a community list, or the upstream maintainers) can add DeepSeek Harness to their harness
table. The technical criteria are met, and [E2E-VERIFICATION.md](E2E-VERIFICATION.md) is the evidence
any such listing would link.

## Not ported

Upstream's Python test harness, site, release tooling, marketplace manifests and per-harness
integration documents are not shipped. Upstream's own behavioural scenario suites are vendored
under `test/fixtures/` as parity fixtures, not as a ported test runner.

## Upstream requirements checklist

Judged against upstream `docs/harnesses.md`, `docs/getting_started.md` and the README.

| Upstream requirement | Status |
|---|---|
| One set of skills; no harness gets a fork of the skill text | **Met.** 26 files are byte-identical to upstream at the pinned commit and hash-locked; the DeepSeek Harness adapter injects a runtime preamble and never edits the vendored files. |
| Install the whole plugin; skills read `agents/` and `resources/` at run time | **Met.** The bundle ships `skills/`, `agents/` and `resources/` together; path mapping is stated in the preamble and adapter notes. |
| Skills say "spawn a subagent"; each harness maps that phrase to its own tool, and where there are no named subagent types a general-purpose child reads the persona file | **Met.** The adapter maps reviewers to `egm_reviewer` (fresh child, persona passed verbatim) and bootstrap partition workers to `subagent`; composable reviewers read `agents/<file>.md`. |
| A Goldfish review needs a fresh context; no subagent tool means stop | **Met.** `spawn` only; `subagent_fork` is forbidden; vendored upstream text keeps the stop rule. |
| Reviewer isolation is verified | **Met.** Enforced read-only preset plus agent-scope deny list and preset guard; verified live with a dedicated probe. |
| Artifacts in the working directory, or a configurable artifact directory | **Met.** Working directory by default; the optional `EGM artifact directory: <dir>` convention is documented in the README and adapter notes. |
| If a harness cannot nest subagents, use direct dispatch instead of the synthesizer | **Met.** Delegation depth 1 admits reviewers only; bootstrap scouts run inline and partition workers are root-spawned. |
| Harness counts as supported after `/egm-brainstorm`, `/egm-draft` and `/egm-review` run end to end through the install, with verification notes | **Met (recorded).** The three commands ran end to end with all five review stages and 17 read-only reviewer activations; see [E2E-VERIFICATION.md](E2E-VERIFICATION.md). |
| A harness support listing requires a manifest/config in the upstream repository plus a `docs/harnesses.md` entry | **Deliberately left to the ecosystem.** No upstream pull request is planned; adoption may lead someone else to add the listing. The technical criteria are met and the verification record is shipped as [E2E-VERIFICATION.md](E2E-VERIFICATION.md). |

Known deviation: a profile that installs dsh-ops also publishes its capability-discovery selector
(`ops_discover_tools`) into the reviewer's scope. DeepSeek Harness's `tools.restrict` only masks
global tools, and dsh-ops registers that selector scope-locally, so the preset cannot hide it from
the schema. The preset's guard denies every call to it, the reviewer persona states it is blocked,
and a test asserts the denial. Every other non-read-only tool is hidden from the schema entirely.

DeepSeek Harness has no artifact directory of its own; the optional upstream convention is
implemented through the project's agent-instructions file as described above.
