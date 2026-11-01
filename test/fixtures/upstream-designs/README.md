# Vendored upstream design documents

Verbatim copies of EGM-authored design documents from
[`google/elephant-goldfish-model`](https://github.com/google/elephant-goldfish-model)
(Apache-2.0, Copyright Google LLC), commit `403d8881d62022490637d740657b33f01e321ea8`:

- `docs/designs/review.md` → `review.md`
- `docs/designs/draft.md` → `draft.md`

They are kept as test material for the Goldfish review skills: a real review
corpus whose expected shape is recorded in [`corpus.json`](corpus.json). The
review protocol's semantic-split rule expects a specification to have a
`## Detailed Implementation Plan` heading. These upstream documents are EGM's own
protocol designs rather than split feature specifications, so neither carries that
H2 yet — `corpus.json` records that fact (and `test/upstream-designs.test.js`
fails if the recording and the files drift apart). The adapted review skill and
the bundled design template still enforce the rule.

**Do not edit these files.** Refresh them from the commit pinned in
[`upstream.lock.json`](../../../upstream.lock.json).

The Apache-2.0 licence text is in the package root ([`LICENSE`](../../../LICENSE));
attribution is in [`NOTICE`](../../../NOTICE).
