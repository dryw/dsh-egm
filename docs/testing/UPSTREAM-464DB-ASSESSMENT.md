# Upstream 464db semantic assessment

Assessed before adaptation, 2026-11-03. Source: google/elephant-goldfish-model,
`a119668d7dc5d558664ba711d4671d11fb7270a8` → `464db031e7dd1b9a79803ac8ea45f55c7c20c5bc`.
Tracking: issue #2 (superseded by #3). Complete Git diff inspected
for all eleven runtime files. 26 commits / 108 files; origin/main equals target
at inspection. Scope remains the explicit target.

| File | Semantic change and intent | Observable surface / DSH adaptation | Coverage / risk |
|---|---|---|---|
| agents/style.md | Adds evidence-calibrated claims and concrete decision caveats; classify DROP/CALIBRATE/RELOCATE/KEEP (KEEP is not a finding). | Reviewer rubric/output changes; no host API dependency or code adaptation. | Exact bytes, rubric parity; owner checks traceable findings. Medium |
| resources/document_standards/feature-spec-standard.md | Rejections need technical/scope reasons; maintainer attribution requires issue/discussion/PR evidence. | Artifact acceptance changes; no runtime adaptation. | Parity, author/rejection manual checks. Medium |
| resources/document_standards/implementation-readiness-standard.md | Exact repo-relative create/modify/delete boundaries; globs only for unpredictable generated output. | Implementation handoff changes. Explain that DSH adapter supplies no Phase 5 write allowlist. | Parity; manual file-boundary audit. Medium |
| resources/execution_instructions.md | Private host scratch or mktemp directory; Markdown fallback; bans fixed shared scratch paths. | Temporary artifact behavior changes; POSIX example needs Windows fallback in preamble. | Parity; manual scratch inspection. Medium |
| skills/egm-bootstrap/SKILL.md | Each worker gets private scratch outside workspace; omit status files if unavailable. | Worker artifacts change; same Windows adaptation. | Parity and preamble contract. Medium |
| skills/egm-brainstorm/SKILL.md | Git name then GIT_AUTHOR_NAME then chat; evidence for rejected alternatives; host-neutral next-step invocation examples. | Author intake and brief format change. Explicit DSH slash-command mapping; identity stays an Elephant operation, never reviewer shell. | Parity, invocation contract, manual identity fallback. Medium |
| skills/egm-draft/SKILL.md | Brief author first, then Git/environment/chat; author owns architecture; attributed technical rejection; host-neutral handoffs. | Gates/header/handoff change; DSH invocation mapping. Owner retains final authority in this task. | Parity, manual carried decisions/identity. Medium |
| skills/egm-draft/references/design_doc.md | Rejection placeholder requires author rationale / evidence for maintainer claim. | Template behavior change; no host code adaptation. | Template bytes, manual artifact inspection. Low |
| skills/egm-resolve/SKILL.md | High/Medium/Low becomes Blocker/Major/Nit. | Resolution report format now agrees with existing personas/synthesis; no JS severity parser found. | Search runtime consumers; exact parity and severity consistency. Medium |
| skills/egm-review-loop/SKILL.md | Empty context counts as provided; synthesis must forward context to each reviewer. | Prompt propagation changes; DSH uses direct dispatch, with explicit stage context preamble. | Parity; manual per-child envelopes. High |
| skills/egm-review/SKILL.md | Discover links after preset, before first context stage; fragment stripping, document-relative resolution, realpath workspace check, skip missing; outside/URL approval or headless exclusion; refresh new links on resume. Forward context except comprehension Stage 6. | Intake, approval, prompts and resource selection change. Clarify empty supplemental selection still permits approved automatic links; Stage 6 gets no supplemental context. No filesystem sandbox is implied. | Parity plus manual link/symlink/headless/stage cases; native replay guard checks separately. High |

No changes above are purely editorial, although slash-prefix removal and owner →
author wording include editorial components. Vendored text remains verbatim.
Other changed mapped fixtures: brainstorm/draft/review scenarios, six skill copies,
and review design corpus. All 42 mappings, including unchanged files, were refreshed and independently
compared with target Git objects and lock hashes. No licensing change identified.

## Boundary review and maintained verification

The adapter starts `spawn`, selects `egm-reviewer`, passes the explicit prompt and
caps depth at 1. It installs the scoped guard before hiding tools, propagates setup
errors and rejects broken presets. Unit checks cover these adapter paths; source
tracing supports native initialization failure propagation. An injected native
setup-failure case was not executed.

The [two maintained pytest cases](../../tests/integration/README.md) use the public
Python SDK and pinned native replay runtime with the installed candidate tarball.
They observe actual parent and child model inputs, successful native completions,
exact guard errors, role-specific resource reads, artifacts and bounded cleanup.
The existing Linux gate passed after the refresh; see [the result record](RESULTS-464DB.md).
No additional provider or runtime framework is required for this upstream update.

Installed filesystem source describes cwd as a resolution default, not containment;
read paths remain unconfined. Reading-list approval and implementation file
boundaries are model instructions. Linked instructions cannot authorize extra
tools or resources. Allowed read implementations are trusted, and absent automatic
parent context does not make OS-readable parent/session files confidential. These
are source-backed limits, not results of a new outside-read experiment.

The preamble supplies DSH command syntax, context staging and untrusted-content
rules, author fallback without invented identity, Windows private-scratch fallback
and accurate enforcement language. String tests establish instruction presence;
scenario parity establishes text contracts. Scripted replay does not establish
that a live model discovers links, requests approvals, follows identity/scratch
rules or obeys implementation file boundaries. The table's manual observations
are potential future model checks, not new mandatory acceptance gates. Windows,
Agent Team and live-model behavior were not exercised in the local candidate evaluation.
