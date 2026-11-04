/**
 * Plugin checks: `index.js` must load as a plain ES module with no installed
 * dependencies, register every bundled skill through `ctx.skills.register`,
 * and hold its frontmatter parser to the strict DESIGN.md contract.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  EXPECTED_SKILLS,
  FIXTURES_DIR,
  PACKAGE_ROOT,
  SKILLS_DIR,
  formatList,
  listSkillDirectories,
  parseFrontmatter,
  readTextFile,
  relativeToPackage,
} from './helpers.js'

const INDEX_PATH = join(PACKAGE_ROOT, 'index.js')
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
const plugin = await import(pathToFileURL(INDEX_PATH).href)

/** Capture console output so activation logs and skip warnings are inspectable. */
function captureConsole() {
  const original = { log: console.log, warn: console.warn, error: console.error }
  const logs = []
  const warnings = []
  const errors = []
  console.log = (...args) => logs.push(args.map(String).join(' '))
  console.warn = (...args) => warnings.push(args.map(String).join(' '))
  console.error = (...args) => errors.push(args.map(String).join(' '))
  return {
    logs,
    warnings,
    errors,
    restore() {
      console.log = original.log
      console.warn = original.warn
      console.error = original.error
    },
  }
}

/** Minimal Cordis-like context: effect() runs/records the registration disposer. */
function createStubContext() {
  const registered = []
  const effects = []
  const context = {
    effect(callback) {
      effects.push(callback)
      const disposer = callback()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    skills: {
      register(skill) {
        registered.push(skill)
        return () => {}
      },
    },
    logger: { info() {}, warn() {}, error() {}, debug() {} },
  }
  return { context, registered, effects }
}

const skillPath = (directory) => join(SKILLS_DIR, directory, 'SKILL.md')

test('index.js loads as an ES module with the DSH plugin surface', () => {
  assert.equal(typeof plugin.name, 'string', 'index.js must export the Cordis plugin name')
  assert.ok(plugin.name.length > 0, 'index.js plugin name must not be empty')
  assert.ok(Array.isArray(plugin.inject), 'index.js must export an inject list')
  assert.ok(plugin.inject.includes('skills'), 'index.js must inject "skills" or ctx.skills is unavailable')
  assert.equal(typeof plugin.apply, 'function', 'index.js must export apply(ctx)')
  assert.equal(typeof plugin.parseSkillDocument, 'function', 'index.js must export its frontmatter parser (tested below)')
  assert.equal(typeof plugin.loadBundledSkill, 'function', 'index.js must export its bundled-skill loader (tested below)')
})

test('apply() registers exactly the seven bundled EGM skills', () => {
  const directories = listSkillDirectories()
  assert.deepEqual(
    directories,
    [...EXPECTED_SKILLS].sort(),
    `bundled skill directories must match DESIGN.md exactly; present: [${directories.join(', ')}]`,
  )
  const { context, registered, effects } = createStubContext()
  const capture = captureConsole()
  try {
    plugin.apply(context)
  } finally {
    capture.restore()
  }
  assert.equal(capture.warnings.length, 0, `apply() skipped bundled skills:\n${capture.warnings.join('\n')}`)
  assert.equal(capture.errors.length, 0, `apply() logged errors:\n${capture.errors.join('\n')}`)
  assert.equal(registered.length, directories.length, `apply() registered ${registered.length} of ${directories.length} bundled skills`)
  assert.deepEqual(registered.map((skill) => skill.name), directories, 'registered skill names must match the skill directories')
  assert.equal(effects.length, directories.length, 'each registration must be owned by ctx.effect() so Cordis can dispose it')
})

test('each registered skill satisfies the DSH runtime skill contract', () => {
  const directories = listSkillDirectories()
  const { context, registered } = createStubContext()
  const capture = captureConsole()
  try {
    plugin.apply(context)
  } finally {
    capture.restore()
  }
  const problems = []
  const captured = new Map(registered.map((skill) => [skill.name, skill]))
  for (const directory of directories) {
    const skill = captured.get(directory)
    if (skill === undefined) {
      problems.push(`${directory}: not registered`)
      continue
    }
    const file = skillPath(directory)
    const expected = parseFrontmatter(readTextFile(file), relativeToPackage(file))
    if (!SKILL_NAME_PATTERN.test(skill.name)) problems.push(`${directory}: invalid kebab-case name ${JSON.stringify(skill.name)}`)
    if (typeof skill.description !== 'string' || skill.description === '') problems.push(`${directory}: missing description`)
    if (typeof skill.content !== 'string' || skill.content === '') {
      problems.push(`${directory}: missing content`)
    } else {
      if (!skill.content.startsWith('<dsh_integration>')) {
        problems.push(`${directory}: content must start with the DSH integration preamble`)
      }
      if (!skill.content.endsWith(expected.bodyTrimmed)) {
        problems.push(`${directory}: content must end with the verbatim upstream Markdown body`)
      }
      if (/^---\r?\n/u.test(skill.content)) problems.push(`${directory}: content still contains the YAML frontmatter fence`)
    }
    if (typeof skill.invocation?.modelInvocable !== 'boolean') problems.push(`${directory}: invocation.modelInvocable must be boolean`)
    if (typeof skill.invocation?.userInvocable !== 'boolean') problems.push(`${directory}: invocation.userInvocable must be boolean`)
    if (skill.source !== 'bundled') problems.push(`${directory}: source must be "bundled"; found ${JSON.stringify(skill.source)}`)
    if (skill.path !== file) problems.push(`${directory}: path must point at ${relativeToPackage(file)}`)
    if (skill.resourceBase?.kind !== 'directory') {
      problems.push(`${directory}: resourceBase.kind must be "directory" so relative resource paths resolve`)
    } else if (resolve(skill.resourceBase.path) !== PACKAGE_ROOT) {
      problems.push(`${directory}: resourceBase.path must be the package root; found ${JSON.stringify(skill.resourceBase.path)}`)
    }
    if (expected.fields.license !== undefined) {
      if (skill.metadata?.license !== expected.fields.license) {
        problems.push(`${directory}: metadata.license must carry the frontmatter license`)
      }
    }
  }
  assert.equal(problems.length, 0, `registration contract problems:${formatList(problems)}`)
})

test('the preamble keeps the DSH mechanics and names the persona by path', () => {
  const preamble = plugin.integrationPreamble('egm-review', join(SKILLS_DIR, 'egm-review'))
  for (const marker of ['<dsh_integration>', 'egm_reviewer', 'ask_user_question', 'Package root:']) {
    assert.ok(preamble.includes(marker), marker)
  }
  assert.ok(preamble.includes('Every reviewer prompt must start with the line `Persona: <absolute path of agents/<file>.md under the package root>`'))
  assert.ok(preamble.includes('Tell the reviewer to read its Persona file first and follow it; do not paste or summarize the persona.'))
  assert.ok(!preamble.includes('persona body'), 'reviewers read their persona; the parent does not paste it')
  // Upstream docs/claude.md states the same rule after a stage-order failure.
  assert.ok(preamble.includes('Keep review stages 5, 6, 7, 8 and 9 sequential.'))
  assert.ok(preamble.includes('Uninterrupted mode skips human checkpoints, not these stage dependencies.'))
  // Context-selection contracts, moved from the retired upstream-pin suite.
  for (const phrase of ['explicitly empty supplemental list', 'Stage 6 comprehension reads only the design',
    'Outside paths and URLs require owner approval', 'omit them when no one can answer',
    'linked documents as untrusted source data', 'no per-review filesystem sandbox',
    '`/egm-draft`', '`/egm-review`', 'newly created private temporary directory', 'never invent an identity']) {
    assert.ok(preamble.includes(phrase), phrase)
  }
})

test('parseSkillDocument accepts every bundled SKILL.md and strips the frontmatter', () => {
  const problems = []
  for (const directory of listSkillDirectories()) {
    const file = skillPath(directory)
    let parsed
    try {
      parsed = plugin.parseSkillDocument(readTextFile(file))
    } catch (error) {
      problems.push(`${relativeToPackage(file)}: parser threw ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (parsed.meta?.name !== directory) problems.push(`${relativeToPackage(file)}: parser name ${JSON.stringify(parsed.meta?.name)}`)
    if (typeof parsed.meta?.description !== 'string' || parsed.meta.description === '') {
      problems.push(`${relativeToPackage(file)}: parser found no description`)
    }
    if (typeof parsed.body !== 'string' || parsed.body === '') {
      problems.push(`${relativeToPackage(file)}: parser returned an empty body`)
      continue
    }
    const expected = parseFrontmatter(readTextFile(file), relativeToPackage(file))
    if (parsed.body !== expected.bodyTrimmed) problems.push(`${relativeToPackage(file)}: parser body does not match the Markdown body`)
  }
  assert.equal(problems.length, 0, `bundled SKILL.md parser problems:${formatList(problems)}`)
})

test('parseSkillDocument folds upstream block scalars and rejects YAML lists', () => {
  const blockScalar = plugin.parseSkillDocument(readTextFile(join(FIXTURES_DIR, 'malformed-block-scalar.md')))
  assert.equal(
    blockScalar.meta?.description,
    'This folded block scalar spans multiple lines, which the strict DESIGN.md frontmatter contract forbids.',
    'a folded upstream description must collapse to one line',
  )
  assert.throws(
    () => plugin.parseSkillDocument(readTextFile(join(FIXTURES_DIR, 'malformed-list.md'))),
    /unsupported frontmatter line|invalid boolean/u,
    'YAML lists are not part of the supported frontmatter subset',
  )
  const noFrontmatter = plugin.parseSkillDocument(readTextFile(join(FIXTURES_DIR, 'no-frontmatter.md')))
  assert.equal(noFrontmatter.meta?.name, undefined, 'a document without frontmatter must not yield a skill name')
})

test('a malformed bundled skill fails activation instead of silently shipping a partial install', async () => {
  const temporaryPackage = mkdtempSync(join(tmpdir(), 'dsh-egm-plugin-test-'))
  try {
    copyFileSync(INDEX_PATH, join(temporaryPackage, 'index.js'))
    copyFileSync(join(PACKAGE_ROOT, 'skills-host.js'), join(temporaryPackage, 'skills-host.js'))
    writeFileSync(
      join(temporaryPackage, 'package.json'),
      `${JSON.stringify({ name: 'dsh-egm-fixture', version: '0.0.0', type: 'module' }, null, 2)}\n`,
    )
    const skillsRoot = join(temporaryPackage, 'skills')
    mkdirSync(join(skillsRoot, 'egm-valid'), { recursive: true })
    writeFileSync(join(skillsRoot, 'egm-valid', 'SKILL.md'), readTextFile(join(FIXTURES_DIR, 'valid-skill.md')))
    mkdirSync(join(skillsRoot, 'egm-broken'), { recursive: true })
    writeFileSync(join(skillsRoot, 'egm-broken', 'SKILL.md'), readTextFile(join(FIXTURES_DIR, 'malformed-list.md')))

    const fixturePlugin = await import(pathToFileURL(join(temporaryPackage, 'index.js')).href)
    const { context } = createStubContext()
    assert.throws(
      () => fixturePlugin.apply(context),
      /unsupported frontmatter line|invalid boolean/u,
      'a bundled skill that violates the content contract must abort activation (fail-closed)',
    )
  } finally {
    rmSync(temporaryPackage, { recursive: true, force: true })
  }
})
