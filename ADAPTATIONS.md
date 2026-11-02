# Upstream parity and the DeepSeek Harness integration layer

`dsh-egm` packages [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model)
for DeepSeek Harness. The skills, agent personas and shared standards are vendored **verbatim** from
the upstream commit pinned in [upstream.lock.json](upstream.lock.json)
(`a119668d7dc5d558664ba711d4671d11fb7270a8`). No skill text is forked for this harness. Upstream's
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

The only authored runtime code is the DeepSeek Harness layer:

- **`skills-host.js`** registers each vendored `SKILL.md` in the Harness skill registry. Its body is
  the verbatim upstream Markdown; at registration it receives a short `<dsh_integration>` preamble
  built for that skill. The preamble supplies the package root and the skill's own directory, maps
  the upstream plugin-root paths, states that instructions for other harnesses are ignored, and states the DeepSeek Harness mechanics:
  - Goldfish reviewers are started with `egm_reviewer({ description, prompt })`, never `subagent`
    and never `subagent_fork`;
  - bootstrap partition workers use the generic `subagent` tool because they write contracts;
  - interactive gates use `ask_user_question` with `{ label, description }` options and no
    `(Recommended)` prefix;
  - artifacts are written to the project working directory, not into the package.
- **`reviewer-host.js`** provides the `egm_reviewer` tool. It starts an in-process `spawn` child with
  the independent `egm-reviewer` agent preset and a depth cap that forbids the child from
  delegating. It also applies a deny-list restriction at the child's agent scope so no non-read-only global
  tool is visible to the reviewer.
- **`reviewer-tools.js`** is mounted inside the `egm-reviewer` preset. It hides every non-read-only
  global tool and registers a guard that denies any non-allowlisted call as a second layer.
  Allowed: `read`, `read_image`, `glob`, `grep`, and the `ops_*` readers.
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
- its preset composes only read/search tools, and the preset guard rejects any non-allowlisted call
  (no write, edit, shell, terminal, job, question, presentation, subagent or session-reading tool is
  available to it);
- a depth cap of 1 admits the reviewer but forbids it from delegating; review and brainstorm
  synthesis therefore run as direct dispatch, not as a synthesizer child;
- the agent-scope deny-list and the preset guard are two independent layers, so a future tool
  registered by another plugin is still denied unless it is on the read-only allowlist.

## Upstream harness criteria

Upstream EGM counts a harness as supported after `/egm-brainstorm`, `/egm-draft` and
`/egm-review` run end to end through its plugin install, and records reviewer isolation as part of the
tested surface
([`docs/harnesses.md`](https://github.com/google/elephant-goldfish-model/blob/a119668d7dc5d558664ba711d4671d11fb7270a8/docs/harnesses.md)).
This package records that evidence: the bundle installs and registers the seven skills; reviewer
isolation is enforced as described above; and the three commands ran end to end with all five review
stages and 17 read-only reviewer activations ([E2E-VERIFICATION.md](E2E-VERIFICATION.md), recorded on
0.2.0; no runtime changes since).

## Not shipped

Upstream's `docs/` integration guides, Python test harness, site, release tooling and marketplace
manifests are not part of this package. Upstream's behavioural scenario suites are vendored under
`test/fixtures/` as content-parity fixtures; `node --test` checks their content, not an end-to-end
run.

## License and attribution

The vendored files are Copyright Google LLC and licensed under the Apache License 2.0; see
[NOTICE](NOTICE) and [LICENSE](LICENSE). The adapter layer in this package is original work, released
under the same license.
