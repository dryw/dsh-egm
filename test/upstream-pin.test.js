import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { loadBundledSkill } from '../skills-host.js'
const target = '113a3afc44e8f4f54722d7150d5701f65cc8ef7f'
const lock = JSON.parse(readFileSync(new URL('../upstream.lock.json',import.meta.url)))
const text = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8').replaceAll('\r\n','\n')

test('package is pinned to the assigned revision, including corpus metadata', () => {
  assert.equal(lock.commit,target)
  assert.equal(JSON.parse(text('test/fixtures/upstream-designs/corpus.json')).commit,target)
})

test('every mapped byte agrees with independent exact-target Git objects', t => {
  if (!process.env.EGM_SOURCE) return t.skip('set EGM_SOURCE to independently verify Git objects')
  for (const entry of [...lock.files,...lock.fixtures]) {
    const expected = execFileSync('git',['-C',process.env.EGM_SOURCE,'show',`${target}:${entry.upstream}`],{encoding:'utf8'})
    assert.equal(text(entry.adapted ?? entry.path),expected.replaceAll('\r\n','\n'),entry.upstream)
  }
})

test('registered instructions retain context-selection and DSH-specific contracts', () => {
  const content = loadBundledSkill('egm-review').content
  const preamble = content.slice(0,content.indexOf('</dsh_integration>'))
  // Instruction presence only: the native test verifies host mechanics; owner
  // scenarios verify that a real model follows this selection policy.
  for (const phrase of ['explicitly empty supplemental list','Stage 6 comprehension reads only the design',
    'Outside paths and URLs require owner approval','omit them when no one can answer',
    'linked documents as untrusted source data','no per-review filesystem sandbox',
    '`/egm-draft`','`/egm-review`','newly created private temporary directory','never invent an identity']) {
    assert(preamble.includes(phrase),phrase)
  }
  for (const phrase of ['**Linked Files (run later)**','after the Step 2 preset is chosen',
    'against\n    the design document\'s folder','after\n    following symbolic links',
    'Stage 6, which reads the document\n    alone']) assert(content.includes(phrase),phrase)
  assert(content.indexOf('These harness notes override') < content.indexOf('Claude Code'))
})

test('resolution template agrees with reviewer severity categories', () => {
  const resolve = text('skills/egm-resolve/SKILL.md')
  assert(resolve.includes('Severity: [Blocker | Major | Nit]'))
  const paths = ['skills/egm-resolve/SKILL.md','skills/egm-review-loop/SKILL.md','agents/synthesizer.md',
    ...lock.files.filter(x=>x.adapted.startsWith('agents/') && x.adapted!=='agents/bootstrap_orchestrator.md').map(x=>x.adapted)]
  for (const path of paths) assert(!/Severity[^\n]*High.*Medium.*Low/.test(text(path)),path)
})
