/**
 * Upstream lock: `upstream.lock.json` pins the upstream commit and the SHA-256 of
 * every vendored skill, persona and standard. Shipped copies must match it, every
 * vendored file must be listed, and with `EGM_SOURCE` set to an upstream checkout
 * every entry must equal the pinned Git object. This is the one content gate: a
 * byte-identical copy needs no further upstream content tests.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PACKAGE_ROOT, formatList, isFile, relativeToPackage, filesEntryMatches, readPackageJson, walkFiles } from './helpers.js'
import { ADAPTED_FILES, DEFAULT_REPOSITORY, LOCK_PATH, readLock, sha256 } from '../scripts/check-upstream.mjs'

const lock = readLock(LOCK_PATH)
const SHA256 = /^[0-9a-f]{64}$/u
const VENDORED_CONTENT_ROOTS = Object.freeze(['skills', 'agents', 'resources'])

/** Hash text as the lock records it: repository bytes (LF), whatever core.autocrlf did. */
function hashUpstreamText(file) {
  return sha256(readFileSync(file, 'utf8').replace(/\r\n/gu, '\n'))
}

function normalisePath(filePath) {
  return String(filePath).replace(/\\/gu, '/').replace(/^\.\//u, '')
}

/** Vendored content files, from git when this is the package checkout, else the filesystem. */
function listVendoredContentFiles() {
  const same = (path) => (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path))
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: PACKAGE_ROOT, encoding: 'utf8' })
  if (toplevel.status === 0 && same(toplevel.stdout.trim()) === same(PACKAGE_ROOT)) {
    const listed = spawnSync('git', ['ls-files', '-z', '--', ...VENDORED_CONTENT_ROOTS], { cwd: PACKAGE_ROOT, encoding: 'utf8' })
    if (listed.status === 0) {
      return { files: [...new Set(listed.stdout.split('\0').filter(Boolean).map(normalisePath))].sort(), tracked: true }
    }
  }
  const walked = VENDORED_CONTENT_ROOTS.flatMap((root) => walkFiles(join(PACKAGE_ROOT, root))).map(relativeToPackage)
  return { files: [...new Set(walked)].sort(), tracked: false }
}

test('upstream.lock.json pins the upstream repository and every adapted file', () => {
  const problems = []
  if (lock.schemaVersion !== 1) problems.push(`schemaVersion must be 1; found ${JSON.stringify(lock.schemaVersion)}`)
  if (lock.repository !== DEFAULT_REPOSITORY) problems.push(`repository must be ${JSON.stringify(DEFAULT_REPOSITORY)}`)
  if (typeof lock.branch !== 'string' || lock.branch === '') problems.push('branch must be a non-empty string')
  if (typeof lock.commit !== 'string' || !/^[0-9a-f]{40}$/u.test(lock.commit)) problems.push('commit must be a full 40-character commit SHA')
  const recorded = (lock.files ?? []).map((entry) => [entry.upstream, entry.adapted])
  if (JSON.stringify(recorded) !== JSON.stringify(ADAPTED_FILES)) {
    problems.push('files mapping drifted from ADAPTED_FILES in scripts/check-upstream.mjs (regenerate with --update-lock)')
  }
  for (const entry of lock.files ?? []) {
    if (!SHA256.test(entry.sha256)) problems.push(`${entry.upstream}: sha256 is not a SHA-256 hex digest`)
  }
  assert.equal(problems.length, 0, `upstream.lock.json problems:${formatList(problems)}`)
})

test('every shipped upstream file is byte-identical to the lock hash', () => {
  const problems = []
  for (const entry of lock.files) {
    const file = join(PACKAGE_ROOT, entry.adapted)
    if (!isFile(file)) problems.push(`${entry.adapted}: shipped file is missing`)
    else if (hashUpstreamText(file) !== entry.sha256) {
      problems.push(`${entry.adapted}: no longer matches upstream ${entry.upstream} at the pinned commit; restore it from upstream`)
    }
  }
  assert.equal(problems.length, 0, `shipped file problems:${formatList(problems)}`)
})

test('every vendored file under skills/, agents/ and resources/ has a lock entry, and every entry is tracked', () => {
  const content = listVendoredContentFiles()
  const locked = new Set(lock.files.map((entry) => normalisePath(entry.adapted)))
  const problems = content.files.filter((file) => !locked.has(file)).map((file) => `${file}: no lock entry`)
  if (content.tracked) {
    for (const file of locked) if (!content.files.includes(file)) problems.push(`${file}: lock entry is not git-tracked`)
  }
  assert.equal(problems.length, 0, `vendored files and lock entries disagree:${formatList(problems)}`)
})

test('the published package ships every adapted upstream file', () => {
  const files = readPackageJson().files ?? []
  const uncovered = ADAPTED_FILES.map(([, adapted]) => adapted).filter(
    (adapted) => !files.some((entry) => filesEntryMatches(adapted, entry)),
  )
  assert.equal(uncovered.length, 0, `adapted files missing from the published "files" list:${formatList(uncovered)}`)
})

test('every lock entry equals the pinned Git object in an upstream checkout', (t) => {
  const source = process.env.EGM_SOURCE
  if (!source) return t.skip('set EGM_SOURCE to an upstream checkout to compare pinned Git objects')
  for (const entry of lock.files) {
    const expected = execFileSync('git', ['-C', source, 'show', `${lock.commit}:${entry.upstream}`], { encoding: 'utf8' })
    assert.equal(readFileSync(join(PACKAGE_ROOT, entry.adapted), 'utf8').replace(/\r\n/gu, '\n'),
      expected.replace(/\r\n/gu, '\n'), entry.upstream)
  }
})

test('the check-upstream entry point is inert when imported and exposes its mapping', () => {
  // Importing scripts/check-upstream.mjs above must not run its CLI (it guards on import.meta.url).
  assert.ok(ADAPTED_FILES.length > 0)
  assert.equal(new Set(ADAPTED_FILES.map(([upstream]) => upstream)).size, ADAPTED_FILES.length, 'ADAPTED_FILES has duplicate upstream paths')
})
