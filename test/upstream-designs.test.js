/**
 * Vendored upstream design documents: a future review corpus for the Goldfish
 * skills, plus the review protocol's semantic-split rule.
 *
 * The review protocol expects a feature specification to expose its implementation
 * detail under a `## Detailed Implementation Plan` heading. The vendored upstream
 * documents are EGM's own protocol designs, not split feature specs, so they do not
 * carry that H2 today. Rather than inventing a rule the corpus does not meet, this
 * test records which documents satisfy the rule (`corpus.json`) and fails when the
 * recording and the vendored files drift apart, while separately asserting that the
 * adapted review skill and template still enforce the rule.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIXTURES_DIR,
  PACKAGE_ROOT,
  SKILLS_DIR,
  formatList,
  isFile,
  readJsonFile,
  readPackageJson,
  readTextFile,
  relativeToPackage,
} from './helpers.js'

const DESIGNS_DIR = join(FIXTURES_DIR, 'upstream-designs')
const CORPUS_PATH = join(DESIGNS_DIR, 'corpus.json')
const H2_HEADING = /^## Detailed Implementation Plan[ \t]*$/mu

test('corpus.json records the vendored upstream design documents and their semantic-split state', () => {
  const corpus = readJsonFile(CORPUS_PATH)
  const lock = readJsonFile(join(PACKAGE_ROOT, 'upstream.lock.json'))
  const problems = []
  if (corpus.schemaVersion !== 1) problems.push(`schemaVersion must be 1; found ${JSON.stringify(corpus.schemaVersion)}`)
  if (corpus.source !== 'google/elephant-goldfish-model') problems.push('source must be google/elephant-goldfish-model')
  if (corpus.license !== 'Apache-2.0') problems.push('license must be Apache-2.0')
  if (corpus.commit !== lock.commit) problems.push(`commit ${corpus.commit} must match upstream.lock.json (${lock.commit})`)
  if (!Array.isArray(corpus.documents) || corpus.documents.length === 0) problems.push('documents must be a non-empty array')

  const listed = new Set()
  for (const document of corpus.documents ?? []) {
    const file = join(DESIGNS_DIR, document.file)
    listed.add(document.file)
    if (!isFile(file)) {
      problems.push(`${document.file}: vendored design document is missing`)
      continue
    }
    const text = readTextFile(file)
    const title = /^# (.+)$/mu.exec(text)?.[1]?.trim()
    if (title !== document.title) problems.push(`${document.file}: recorded title ${JSON.stringify(document.title)} != actual ${JSON.stringify(title)}`)
    const mentions = text.match(/Detailed Implementation Plan/gu)?.length ?? 0
    if (mentions !== document.detailedImplementationPlanMentions) {
      problems.push(
        `${document.file}: recorded ${document.detailedImplementationPlanMentions} "Detailed Implementation Plan" mention(s) != actual ${mentions}; refresh corpus.json`,
      )
    }
    if (document.mentionsDetailedImplementationPlan !== mentions > 0) {
      problems.push(`${document.file}: mentionsDetailedImplementationPlan does not match the file`)
    }
    const hasHeading = H2_HEADING.test(text)
    if (hasHeading !== document.hasDetailedImplementationPlanHeading) {
      problems.push(
        `${document.file}: semantic-split recording says heading present=${document.hasDetailedImplementationPlanHeading}, ` +
          `actual=${hasHeading}; update corpus.json (and fix the fixture if the content changed unexpectedly)`,
      )
    }
    if (typeof document.semanticSplitStatus !== 'string' || document.semanticSplitStatus === '') {
      problems.push(`${document.file}: semanticSplitStatus must describe why the document does or does not have the heading`)
    }
  }
  const vendored = readdirSync(DESIGNS_DIR).filter((name) => name.endsWith('.md') && name !== 'README.md')
  for (const file of vendored) {
    if (!listed.has(file)) problems.push(`${file}: vendored design document is not recorded in corpus.json`)
  }
  assert.equal(problems.length, 0, `upstream design corpus problems:${formatList(problems)}`)
})

test('the adapted review skill and template still enforce the semantic-split rule', () => {
  const reviewSkill = join(SKILLS_DIR, 'egm-review', 'SKILL.md')
  const template = join(PACKAGE_ROOT, 'skills', 'egm-draft', 'references', 'design_doc.md')
  const problems = []
  if (!isFile(reviewSkill)) problems.push(`${relativeToPackage(reviewSkill)}: missing`)
  else if (!readTextFile(reviewSkill).includes('Detailed Implementation Plan')) {
    problems.push('skills/egm-review/SKILL.md no longer mentions the Detailed Implementation Plan semantic split')
  }
  if (!isFile(template)) problems.push(`${relativeToPackage(template)}: missing`)
  else if (!H2_HEADING.test(readTextFile(template))) {
    problems.push('skills/egm-draft/references/design_doc.md no longer contains a "## Detailed Implementation Plan" heading')
  }
  assert.equal(problems.length, 0, `semantic-split rule problems:${formatList(problems)}`)
})

test('the review corpus records which documents satisfy the semantic-split rule', (t) => {
  const corpus = readJsonFile(CORPUS_PATH)
  const documents = Array.isArray(corpus.documents) ? corpus.documents : []
  assert.ok(documents.length > 0, 'corpus.json lists no documents')
  const split = documents.filter((document) => document.hasDetailedImplementationPlanHeading === true).map((document) => document.file)
  const unsplit = documents.filter((document) => document.hasDetailedImplementationPlanHeading !== true).map((document) => document.file)
  t.diagnostic(
    `upstream design corpus: ${split.length} document(s) already split (${split.join(', ') || 'none'}); ` +
      `${unsplit.length} recorded as unsplit (${unsplit.join(', ')})`,
  )
  // The recording is allowed to change when the fixtures are refreshed, but every
  // document must carry an explicit boolean so the state is never silently unknown.
  for (const document of documents) {
    assert.equal(typeof document.hasDetailedImplementationPlanHeading, 'boolean', `${document.file}: semantic-split state must be recorded`)
  }
})
