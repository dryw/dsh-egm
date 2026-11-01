/**
 * Upstream content parity: use upstream EGM's own behavioural scenario suites as
 * the test material. Each scenario assertion is a pattern that upstream's skill
 * text either satisfies (required) or deliberately avoids (forbidden). If the
 * upstream skill text satisfies a required pattern, our adapted DeepSeek Harness
 * skill must still satisfy it; if the upstream skill avoids a forbidden pattern,
 * our adapted skill must avoid it too.
 *
 * Upstream baselines are vendored verbatim under `test/fixtures/upstream-skills/`
 * so this test is deterministic and offline (CI has no upstream checkout).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  EXPECTED_SKILLS,
  FIXTURES_DIR,
  SKILLS_DIR,
  formatList,
  isFile,
  readTextFile,
  relativeToPackage,
} from './helpers.js'
import {
  collectScenarioAssertions,
  evaluateContentParity,
  loadScenarioFixtures,
} from './upstream-fixtures.js'

const SCENARIOS_DIR = join(FIXTURES_DIR, 'upstream-scenarios')
const UPSTREAM_SKILLS_DIR = join(FIXTURES_DIR, 'upstream-skills')
const skillMd = (skillsRoot, skill) => join(skillsRoot, skill, 'SKILL.md')

/** Render one parity failure with everything needed to act on it. */
function describeFailure(failure) {
  return [
    `scenario_id: ${failure.scenarioId}`,
    `skill:      ${failure.skill}`,
    `assertion:  ${failure.message}`,
    `type:       ${failure.type}`,
    `pattern:    ${failure.pattern}`,
    `file:       ${relativeToPackage(failure.adaptedFile)}`,
    `reason:     ${failure.reason}`,
  ].join('\n  ')
}

test('vendored upstream scenario suites cover all seven EGM skills', () => {
  const documents = loadScenarioFixtures(SCENARIOS_DIR)
  const covered = documents.map((entry) => entry.document.skill)
  const problems = []
  for (const skill of EXPECTED_SKILLS) {
    if (!covered.includes(skill)) problems.push(`${skill}: no vendored test_scenarios.yaml`)
  }
  for (const skill of covered) {
    if (!EXPECTED_SKILLS.includes(skill)) problems.push(`${skill}: scenario suite has no adapted skill`)
    if (!isFile(skillMd(UPSTREAM_SKILLS_DIR, skill))) problems.push(`${skill}: missing vendored upstream SKILL.md baseline`)
    if (!isFile(skillMd(SKILLS_DIR, skill))) problems.push(`${skill}: missing adapted skills/${skill}/SKILL.md`)
  }
  assert.equal(problems.length, 0, `upstream fixture coverage problems:${formatList(problems)}`)
})

test('every scenario assertion yields a content-parity invariant', (t) => {
  const documents = loadScenarioFixtures(SCENARIOS_DIR)
  const failures = []
  const skippedInvalidPatterns = []
  const skippedUpstreamUnsatisfied = []
  const translatedPatterns = []
  let checked = 0
  let totalAssertions = 0

  for (const { document } of documents) {
    const skill = document.skill
    const adaptedFile = skillMd(SKILLS_DIR, skill)
    const upstreamFile = skillMd(UPSTREAM_SKILLS_DIR, skill)
    if (!isFile(adaptedFile) || !isFile(upstreamFile)) {
      failures.push({
        scenarioId: '-',
        skill,
        message: 'cannot run parity: adapted or upstream baseline file is missing',
        type: '-',
        pattern: '-',
        adaptedFile,
        reason: 'missing file',
      })
      continue
    }
    const outcome = evaluateContentParity({
      upstreamText: readTextFile(upstreamFile),
      adaptedText: readTextFile(adaptedFile),
      assertions: collectScenarioAssertions(document),
      skill,
      adaptedFile,
    })
    failures.push(...outcome.failures)
    skippedInvalidPatterns.push(...outcome.skippedInvalidPatterns)
    skippedUpstreamUnsatisfied.push(...outcome.skippedUpstreamUnsatisfied)
    translatedPatterns.push(...outcome.translatedPatterns)
    checked += outcome.checked
    totalAssertions += outcome.totalAssertions
  }

  t.diagnostic(
    `parity: ${checked} invariants checked of ${totalAssertions} assertions; ` +
      `${skippedInvalidPatterns.length} non-JS patterns skipped; ` +
      `${skippedUpstreamUnsatisfied.length} assertions skipped because upstream itself does not satisfy them; ` +
      `${translatedPatterns.length} Python-style inline patterns translated`,
  )
  if (skippedInvalidPatterns.length > 0) {
    t.diagnostic(
      `WARNING: ${skippedInvalidPatterns.length} upstream pattern(s) are not valid JavaScript RegExp and were skipped: ` +
        skippedInvalidPatterns.map((entry) => entry.pattern).join(' | '),
    )
  }
  assert.ok(checked > 0, 'no parity invariant could be derived from the vendored scenarios')
  assert.equal(failures.length, 0, `upstream content parity failures:\n\n  ${failures.map(describeFailure).join('\n\n  ')}\n`)
})

test('the vendored scenario suites genuinely assess every adapted skill', () => {
  // Guard against a green parity run caused by parsing nothing: each suite must
  // parse to scenarios with assertions, and every skill must contribute at least
  // one assertion that upstream's own text satisfies (so a real invariant exists).
  const documents = loadScenarioFixtures(SCENARIOS_DIR)
  assert.equal(documents.length, EXPECTED_SKILLS.length, 'one vendored scenario suite per EGM skill')
  const invariantsPerSkill = new Map()
  for (const { document } of documents) {
    const assertions = collectScenarioAssertions(document)
    assert.ok(document.scenarios.length > 0, `${document.skill}: scenario suite has no scenarios`)
    assert.ok(assertions.length > 0, `${document.skill}: scenario suite has no assertions`)
    const outcome = evaluateContentParity({
      upstreamText: readTextFile(skillMd(UPSTREAM_SKILLS_DIR, document.skill)),
      adaptedText: readTextFile(skillMd(SKILLS_DIR, document.skill)),
      assertions,
      skill: document.skill,
      adaptedFile: skillMd(SKILLS_DIR, document.skill),
    })
    invariantsPerSkill.set(document.skill, outcome.checked)
  }
  const empty = [...invariantsPerSkill].filter(([, count]) => count === 0).map(([skill]) => skill)
  assert.equal(empty.length, 0, `these skills produced no verifiable content-parity invariant:${formatList(empty)}`)
})

test('parity evaluation flags a lost required phrase and a newly introduced forbidden phrase', () => {
  // Self-check of the rule itself: a parity gate that cannot fail is not a gate.
  const assertions = [
    { scenarioId: 'lost-required', turnIndex: 0, type: 'required_pattern', pattern: 'Review with Goldfishes', message: 'required phrase' },
    { scenarioId: 'new-forbidden', turnIndex: 0, type: 'forbidden_pattern', pattern: '\\(Recommended\\)', message: 'forbidden phrase' },
    { scenarioId: 'upstream-missing', turnIndex: 0, type: 'required_pattern', pattern: 'Kafka', message: 'upstream lacks this' },
    { scenarioId: 'upstream-forbidden', turnIndex: 0, type: 'forbidden_pattern', pattern: 'Goldfish', message: 'upstream contains this' },
    { scenarioId: 'invalid-regex', turnIndex: 0, type: 'required_pattern', pattern: '(?<', message: 'not JavaScript' },
  ]
  const healthy = evaluateContentParity({
    upstreamText: 'Offer: Review with Goldfishes.',
    adaptedText: 'Offer: Review with Goldfishes.',
    assertions,
    skill: 'fixture',
    adaptedFile: 'fixture.md',
  })
  assert.equal(healthy.failures.length, 0, 'the healthy fixture text must not produce parity failures')
  assert.equal(healthy.checked, 2, 'only the two assertions upstream satisfies/avoids become invariants')
  assert.equal(healthy.skippedUpstreamUnsatisfied.length, 2)
  assert.equal(healthy.skippedInvalidPatterns.length, 1)

  const regressed = evaluateContentParity({
    upstreamText: 'Offer: Review with Goldfishes.',
    adaptedText: '(Recommended) Goldfish review.',
    assertions,
    skill: 'fixture',
    adaptedFile: 'fixture.md',
  })
  assert.equal(regressed.failures.length, 2, 'losing a required phrase and adding a forbidden one must both fail')
  assert.deepEqual(regressed.failures.map((failure) => failure.scenarioId).sort(), ['lost-required', 'new-forbidden'])
  assert.ok(regressed.failures.every((failure) => failure.skill === 'fixture' && failure.adaptedFile === 'fixture.md'))
})
