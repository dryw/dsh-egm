/**
 * Skill checks: the seven vendored upstream `skills/<dir>/SKILL.md` files must
 * carry parseable YAML frontmatter whose name equals the directory, a usable
 * description, and the upstream license and invocation flags.
 *
 * The upstream files use folded (`>-`) block scalars for some descriptions, which
 * the DeepSeek Harness integration layer folds to one line at registration.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  EXPECTED_SKILLS,
  SKILLS_DIR,
  formatList,
  isFile,
  listSkillDirectories,
  parseFrontmatter,
  readTextFile,
  relativeToPackage,
} from './dsh_helpers.js'

const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const BOOLEAN_VALUES = new Set(['true', 'false'])
const MAX_DESCRIPTION_LENGTH = 500

const skillFile = (directory) => join(SKILLS_DIR, directory, 'SKILL.md')

// Parse every present SKILL.md once so each test can report every problem instead of stopping at the first.
const parsedSkills = new Map()
const parseProblems = []
for (const directory of listSkillDirectories()) {
  const file = skillFile(directory)
  if (!isFile(file)) {
    parseProblems.push(`${relativeToPackage(file)}: skill directory has no SKILL.md`)
    continue
  }
  try {
    const source = readTextFile(file)
    parsedSkills.set(directory, { file, source, ...parseFrontmatter(source, relativeToPackage(file)) })
  } catch (error) {
    parseProblems.push(error.message)
  }
}

test('all seven EGM skill directories from upstream exist, and no others', () => {
  const present = listSkillDirectories()
  const missing = EXPECTED_SKILLS.filter((name) => !present.includes(name))
  const unexpected = present.filter((name) => !EXPECTED_SKILLS.includes(name))
  const problems = []
  if (missing.length > 0) problems.push(`missing skill directories:${formatList(missing)}`)
  if (unexpected.length > 0) problems.push(`unexpected skill directories:${formatList(unexpected)}`)
  assert.equal(problems.length, 0, problems.join('\n'))
})

test('every skill directory contains a SKILL.md', () => {
  const missing = listSkillDirectories().filter((directory) => !isFile(skillFile(directory)))
  assert.equal(missing.length, 0, `skill directories without SKILL.md:${formatList(missing)}`)
})

test('every SKILL.md has parseable frontmatter', () => {
  assert.equal(parseProblems.length, 0, `frontmatter problems:${formatList(parseProblems)}`)
})

test('frontmatter matches the vendored upstream contract', () => {
  const problems = []
  for (const [directory, document] of parsedSkills) {
    const fields = document.fields
    const label = relativeToPackage(document.file)

    if (!Object.hasOwn(fields, 'name')) {
      problems.push(`${label}: missing required "name"`)
    } else {
      if (!SKILL_NAME_PATTERN.test(fields.name)) {
        problems.push(`${label}: "name" ${JSON.stringify(fields.name)} is not kebab-case`)
      }
      if (fields.name !== directory) {
        problems.push(`${label}: "name" ${JSON.stringify(fields.name)} must equal the skill directory ${JSON.stringify(directory)}`)
      }
    }

    if (!Object.hasOwn(fields, 'description') || fields.description === '') {
      problems.push(`${label}: missing required "description"`)
    } else {
      if (fields.description.length > MAX_DESCRIPTION_LENGTH) {
        problems.push(
          `${label}: folded "description" is ${fields.description.length} characters; the DSH catalog caps it at ${MAX_DESCRIPTION_LENGTH}`,
        )
      }
      if (/[\r\n]/u.test(fields.description)) {
        problems.push(`${label}: "description" must fold to one line`)
      }
      if (fields.description !== fields.description.trim()) {
        problems.push(`${label}: "description" must not start or end with whitespace`)
      }
    }

    if (fields.license !== 'Apache-2.0') {
      problems.push(`${label}: "license" must stay "Apache-2.0" as upstream has it; found ${JSON.stringify(fields.license ?? null)}`)
    }

    for (const key of ['disable-model-invocation', 'user-invocable']) {
      if (Object.hasOwn(fields, key) && !BOOLEAN_VALUES.has(fields[key])) {
        problems.push(`${label}: "${key}" must be the literal true or false; found ${JSON.stringify(fields[key])}`)
      }
    }

    if (Object.hasOwn(fields, 'whenToUse') && fields.whenToUse === '') {
      problems.push(`${label}: "whenToUse" is empty; omit the key instead`)
    }
    if (document.bodyTrimmed === '') problems.push(`${label}: skill body is empty`)
  }
  assert.equal(problems.length, 0, `frontmatter contract problems:${formatList(problems)}`)
})

test('frontmatter values are scalars, not YAML lists or maps', () => {
  const problems = []
  for (const [directory, document] of parsedSkills) {
    if (document.raw.includes('\n-') || /:\s*\[/u.test(document.raw)) {
      problems.push(`${relativeToPackage(document.file)}: list/map frontmatter values are not part of the upstream contract`)
    }
  }
  assert.equal(problems.length, 0, `non-scalar frontmatter values:${formatList(problems)}`)
})
