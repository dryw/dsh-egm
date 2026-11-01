/**
 * Hygiene checks: the vendored upstream content is byte-identical to upstream and
 * therefore names other harnesses on purpose; the DeepSeek Harness integration
 * layer (adapter modules, bundle patch, locale) is the content this package
 * authors, so it must never leak another harness's tooling. The integration
 * preamble tells the agent which upstream sections do not apply.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import {
  FORBIDDEN_HARNESS_TOKENS,
  PACKAGE_ROOT,
  formatList,
  isFile,
  readTextFile,
  relativeToPackage,
} from './helpers.js'

/** Files this package authors. Vendored upstream trees are checked by the sync tests instead. */
const ADAPTER_FILES = [
  'index.js',
  'skills-host.js',
  'reviewer-host.js',
  'reviewer-tools.js',
  'cordis.patch.yml',
  'locale/en.json',
  'locale/zh.json',
]

/** Additional leftovers the adapter must not introduce (install/marketplace text and harness docs). */
const EXTRA_FORBIDDEN_TOKENS = [
  ['CLAUDE.md', /CLAUDE\.md/i],
  ['.claude/ directory', /(?:^|[^A-Za-z0-9_])\.claude\//iu],
  ['/plugin install', /\/plugin install/i],
  ['plugin marketplace', /plugin marketplace/i],
]

/** Scan the adapter files for forbidden tokens, returning one problem per hit. */
function scan(tokens) {
  const problems = []
  for (const relativePath of ADAPTER_FILES) {
    const file = join(PACKAGE_ROOT, relativePath)
    if (!isFile(file)) {
      problems.push(`${relativePath}: adapter file is missing`)
      continue
    }
    const lines = readTextFile(file).split(/\r?\n/u)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      for (const [label, pattern] of tokens) {
        if (!pattern.test(line)) continue
        problems.push(`${relativeToPackage(file)}:${index + 1}: ${label} -> ${line.trim().slice(0, 140)}`)
      }
    }
  }
  return problems
}

test('the adapter never mentions another agent harness', () => {
  const problems = scan(FORBIDDEN_HARNESS_TOKENS)
  assert.equal(
    problems.length,
    0,
    `the DeepSeek Harness integration layer must not name another harness (vendored upstream text is exempt):${formatList(problems)}`,
  )
})

test('the adapter carries no other-harness install or marketplace text', () => {
  const problems = scan(EXTRA_FORBIDDEN_TOKENS)
  assert.equal(
    problems.length,
    0,
    `other-harness install/marketplace text must not enter the adapter:${formatList(problems)}`,
  )
})

test('the adapter injects the DSH integration layer instead of rewriting upstream text', () => {
  const host = readTextFile(join(PACKAGE_ROOT, 'skills-host.js'))
  const problems = []
  for (const marker of ['<dsh_integration>', 'egm_reviewer', 'ask_user_question', 'Package root:']) {
    if (!host.includes(marker)) problems.push(`skills-host.js does not contain ${JSON.stringify(marker)}`)
  }
  assert.equal(problems.length, 0, `integration-layer problems:${formatList(problems)}`)
})
