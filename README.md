<p align="center">
  <img src="icon.svg?v=2" width="96" height="96" alt="dsh-egm mark: the elephant's front half and the goldfish's tail cut at the split">
</p>

<h1 align="center">dsh-egm</h1>

<p align="center"><strong>Design with an elephant. Review with a goldfish.</strong></p>

<p align="center">
  <a href="#install">Install</a> &ensp;·&ensp;
  <a href="#quickstart">Quickstart</a> &ensp;·&ensp;
  <a href="#how-it-works">How it works</a> &ensp;·&ensp;
  <a href="#see-a-complete-run">Example run</a> &ensp;·&ensp;
  <a href="#license-and-attribution">License</a>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: Apache-2.0" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://github.com/dryw/dsh-egm/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/dryw/dsh-egm/actions/workflows/ci.yml/badge.svg"></a>
  <img alt="DeepSeek Harness 0.2.x" src="https://img.shields.io/badge/DSH-0.2.x-4c1.svg">
  <img alt="node --test" src="https://img.shields.io/badge/gate-node%20--test-brightgreen.svg">
</p>

<p align="center">
  <sub>An independent community port of Google's Elephant-Goldfish Model. Not affiliated with or
  endorsed by Google.</sub>
</p>

`dsh-egm` brings the [Elephant-Goldfish Model](https://github.com/google/elephant-goldfish-model)
(EGM) to [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) as a native plugin.
A context-rich **Elephant** session interviews you and drafts a design document; fresh,
zero-context, **read-only Goldfish** reviewers then attack it for ambiguity, hidden assumptions, and
implementation gaps; **you** make the trade-offs and approve the specification before any code
is written.

Use it when a change needs design decisions first. For a small, clear bug fix, use your normal
coding workflow.

## How it works

| Role | Context | Responsibility |
|---|---|---|
| **Elephant** | Your project, requirements, and earlier decisions | Explore the problem, debate trade-offs, and draft the specification. |
| **Goldfish** | The document and its referenced source material, without the earlier conversation | Find missing assumptions, unclear requirements, and implementation risks. |
| **You** | The goals and constraints that matter | Resolve trade-offs, approve the design, and decide what to build. |

The upstream skills, personas and standards are shipped **verbatim** from the pinned upstream
commit (see [ADAPTATIONS.md](ADAPTATIONS.md)); DeepSeek Harness mechanics live in a small
integration layer that the host plugin prepends to each skill when it registers it. Reviewers are
started with the plugin's `egm_reviewer` tool, which runs them in the bundled read-only
`egm-reviewer` agent preset: they can read and search files, and have no write, edit, command,
user-question, session-read, or delegation tool. A review in the same context is not a Goldfish
review.

## Requirements

- DeepSeek Harness `0.2.1-rc.5` or newer in the `0.2.x` line (`engines.dsh`).
- A Harness composition with the skill registry, the tools registry, the subagent service, the
  agent-presets service, and an in-process `spawn` subagent provider. The plugin installs the
  `egm-reviewer` preset and the `egm_reviewer` tool that selects it.
- Use `egm_reviewer`, not a plain `subagent`, for reviewers: a plain subagent inherits the parent's
  tool belt, so it is not read-only and must never run a Goldfish review.

## Install

Install into a profile — replace `default` with the profile you boot:

```sh
# from npm: shortest install, and the form the DSH Plugin Hub lists
dsh plugin --profile web add dsh-egm

# from GitHub (before npm, or to pin a revision)
dsh plugin --profile web add github:dryw/dsh-egm#<sha>

# from a local checkout
dsh plugin --profile web add /path/to/dsh-egm

# from a packed tarball
pnpm pack
dsh plugin --profile web add ./dsh-egm-0.2.0.tgz
```

Replace `web` with the profile you boot. Restart the Harness after the first install, then check the
plugin rows and its icon under **Settings → Plugins**.

## Quickstart

Pick a feature that needs design decisions, for example webhook delivery: what should happen when
a delivery fails, or the same event arrives twice?

1. **Explore the idea** — type `/egm-brainstorm Add webhook delivery to this project.` and
   discuss requirements and trade-offs. Fresh reviewers challenge the proposal, and the agreed
   direction is saved as `concepts_brief.md`.
2. **Draft the specification** — `/egm-draft` turns the brief into a section-by-section design
   document under `docs/designs/`, pausing after each section for your feedback in chat.
3. **Review the draft** — `/egm-review docs/designs/webhook-delivery/DESIGN.md` runs the Goldfish
   Protocol: zoom-out, naive-reader comprehension, design critique, intermediate zoom-out, and
   implementation readiness, then a synthesis pass. Choose which findings to address with
   `/egm-resolve`.
4. **Human review, then implement** — send the design for human review, then tell the agent to
   build to the approved plan.

You can use each skill on its own; you do not have to follow the full sequence.

## See a complete run

[`examples/e2e-verification/`](https://github.com/dryw/dsh-egm/tree/main/examples/e2e-verification)
in the repository is a recorded run against a small fixture project: the concept brief from
`/egm-brainstorm`, the design from `/egm-draft`, and all five Goldfish stage reports from
`/egm-review`, with the harness environment and reviewer activation ids in
[E2E-VERIFICATION.md](https://github.com/dryw/dsh-egm/blob/main/E2E-VERIFICATION.md). It is
repository-only and is not part of the npm tarball.

## Skills

| Skill | Invoke | Use it to… |
|---|---|---|
| Brainstorm | `/egm-brainstorm` | Test an idea and write a concept brief. |
| Draft | `/egm-draft` | Turn a brief or existing notes into a design document. |
| Review | `/egm-review` | Review a design with fresh, read-only Goldfish agents across five stages. |
| Review loop | `/egm-review-loop` | Run a configured group of reviewers for a specific review task. |
| Resolve | `/egm-resolve` | Work through review findings and agree on changes. |
| Bootstrap | `/egm-bootstrap` | Create or update READMEs and codebase context for an existing codebase. |
| Drift report | `/egm-drift-report` | Compare checked-in design documents with the current source code. |

All seven skills are user-invoked, exactly like upstream EGM: the agent does not decide on its own
to start a design session or an expensive review. Start one by typing its `/egm-…` name; the
upstream instructions plus the DeepSeek Harness integration notes are injected into that turn.

## Project layout

EGM works best when design artifacts live in the repository:

```text
path/to/project
├── .agents/skills/<project>-elephant/SKILL.md   # optional: project context loader
└── docs/
    └── designs/
        ├── SITEMAP.md                          # index of design artifacts
        └── <feature>/DESIGN.md                 # design specification
```

Design documents, concept briefs, and review reports are plain Markdown written into your working
directory, so they are reviewable in a pull request like any other change. The project-context
skill is discovered by DeepSeek Harness at `<repo>/.agents/skills/`.

To keep EGM's working artifacts out of the repository root while the design still lives in
`docs/designs/`, add this line to the project's `AGENTS.md` and gitignore the folder:

```text
EGM artifact directory: .dev/docs
```

## Package layout

```
dsh-egm/
├── index.js            # package entry; re-exports the integration layer
├── skills-host.js      # DSH integration layer: registers skills + injects the preamble
├── reviewer-host.js    # egm_reviewer tool: fresh child in the read-only preset
├── reviewer-tools.js   # preset tool guard: read/search allowlist, deny everything else
├── cordis.patch.yml    # bundle patch: host rows + the egm-reviewer agent preset
├── ADAPTER-NOTES.md    # adapter notes for direct SKILL.md reads
├── E2E-VERIFICATION.md # recorded brainstorm -> draft -> review verification run
├── examples/           # repository-only: the recorded end-to-end run
├── skills/             # seven upstream SKILL.md files, verbatim
├── agents/             # nine upstream reviewer/orchestrator personas, verbatim
├── resources/          # upstream standards, execution instructions and README, verbatim
├── locale/             # plugin display metadata (en, zh)
└── icon.svg
```

The adapter modules are the only code this package adds. The vendored trees are byte-identical to
upstream at the pinned commit; `upstream.lock.json` records the commit and every file hash.

## Development

```sh
node --test                            # 49 checks: manifest, vendored content, adapter, reviewer isolation, upstream parity
node scripts/check-upstream.mjs        # reports whether upstream EGM moved since the pinned commit
```

The end-to-end verification run for the upstream support criterion is recorded in
[E2E-VERIFICATION.md](E2E-VERIFICATION.md).

After editing vendored content (only when re-adapting a new upstream commit), refresh the lock with
`node scripts/check-upstream.mjs --update-lock`. To iterate on the plugin after installing it,
restart the Harness (or toggle the plugin row) so the host plugin re-reads the bundled files.

## Staying in sync with upstream

`dsh-egm` vendors upstream EGM verbatim and adds only a DeepSeek Harness integration layer.
[`upstream.lock.json`](upstream.lock.json) pins the upstream commit
(`403d8881d62022490637d740657b33f01e321ea8`) and the SHA-256 of every vendored file.

[`scripts/check-upstream.mjs`](scripts/check-upstream.mjs) compares that pin with upstream's default
branch and reports which vendored files changed:

```sh
node scripts/check-upstream.mjs                # clean = exit 0, drift = exit 1
node scripts/check-upstream.mjs --json         # machine-readable drift report
node scripts/check-upstream.mjs --update-lock  # after refreshing the vendored files
```

A weekly GitHub Actions workflow
([`.github/workflows/upstream-sync.yml`](.github/workflows/upstream-sync.yml)) runs the check and
opens, or refreshes, an issue titled **"Upstream EGM changed: re-adapt bundled skills"**.
`test/upstream-parity.test.js` uses upstream's own behavioural scenario suites as content-parity
tests, so a refresh that drops an upstream-visible requirement fails `node --test`.
[`scripts/README.md`](scripts/README.md) has the full process.

## License and attribution

Licensed under the Apache License, Version 2.0. The skills, reviewer personas, standards and
templates are vendored from [google/elephant-goldfish-model](https://github.com/google/elephant-goldfish-model),
Copyright Google LLC, under the Apache License, Version 2.0; see [NOTICE](NOTICE) and
[ADAPTATIONS.md](ADAPTATIONS.md). The DeepSeek Harness adapter, bundle and reviewer preset are
original work for this package.

This is not an officially supported Google product.
