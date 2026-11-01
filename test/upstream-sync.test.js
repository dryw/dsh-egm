/**
 * Upstream-sync consistency: `upstream.lock.json`, the vendored fixtures and the
 * adapted files must agree. This is the offline half of the semi-automatic
 * upstream tracking; `scripts/check-upstream.mjs` and the weekly workflow do the
 * networked half (compare upstream HEAD against the pinned commit).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PACKAGE_ROOT, formatList, isFile, relativeToPackage, filesEntryMatches, readPackageJson } from './helpers.js'
import {
  ADAPTED_FILES,
  DEFAULT_REPOSITORY,
  VENDORED_FIXTURES,
  readLock,
  sha256,
} from '../scripts/check-upstream.mjs'

const LOCK_PATH = join(PACKAGE_ROOT, 'upstream.lock.json')
const lock = readLock(LOCK_PATH)
const SHA256 = /^[0-9a-f]{64}$/u

/**
 * Hash an upstream text file the way the lock records it: repository bytes (LF).
 * A Windows checkout can materialise CRLF via core.autocrlf, which must not make
 * the recorded hash look stale.
 */
function hashUpstreamText(file) {
  return sha256(readFileSync(file, 'utf8').replace(/\r\n/gu, '\n'))
}

/** Validate the lock's schema and identity fields; returns problems instead of throwing. */
function validateLockIdentity() {
  const problems = []
  if (lock.schemaVersion !== 1) problems.push(`schemaVersion must be 1; found ${JSON.stringify(lock.schemaVersion)}`)
  if (lock.repository !== DEFAULT_REPOSITORY) problems.push(`repository must be ${JSON.stringify(DEFAULT_REPOSITORY)}`)
  if (typeof lock.branch !== 'string' || lock.branch === '') problems.push('branch must be a non-empty string')
  if (typeof lock.commit !== 'string' || !/^[0-9a-f]{40}$/u.test(lock.commit)) problems.push('commit must be a full 40-character commit SHA')
  if (!Array.isArray(lock.files) || lock.files.length !== ADAPTED_FILES.length) {
    problems.push(`files must list exactly the ${ADAPTED_FILES.length} adapted upstream files; found ${lock.files?.length ?? 'none'}`)
  }
  if (!Array.isArray(lock.fixtures) || lock.fixtures.length !== VENDORED_FIXTURES.length) {
    problems.push(`fixtures must list exactly the ${VENDORED_FIXTURES.length} vendored upstream files; found ${lock.fixtures?.length ?? 'none'}`)
  }
  return problems
}

test('upstream.lock.json pins the upstream repository and every adapted file', () => {
  const problems = validateLockIdentity()
  if (Array.isArray(lock.files)) {
    const recorded = lock.files.map((entry) => [entry.upstream, entry.adapted])
    if (JSON.stringify(recorded) !== JSON.stringify(ADAPTED_FILES)) {
      problems.push('files mapping drifted from ADAPTED_FILES in scripts/check-upstream.mjs (regenerate with --update-lock)')
    }
    const upstreams = new Set()
    const adapted = new Set()
    for (const entry of lock.files) {
      if (upstreams.has(entry.upstream)) problems.push(`duplicate upstream file ${entry.upstream}`)
      if (adapted.has(entry.adapted)) problems.push(`duplicate adapted file ${entry.adapted}`)
      upstreams.add(entry.upstream)
      adapted.add(entry.adapted)
      if (!SHA256.test(entry.sha256)) problems.push(`${entry.upstream}: sha256 is not a SHA-256 hex digest`)
      if (!isFile(join(PACKAGE_ROOT, entry.adapted))) problems.push(`${entry.adapted}: adapted file is missing`)
    }
  }
  assert.equal(problems.length, 0, `upstream.lock.json problems:${formatList(problems)}`)
})

test('every vendored upstream fixture is recorded and byte-identical to the lock hash', () => {
  const problems = []
  if (Array.isArray(lock.fixtures)) {
    const recorded = lock.fixtures.map((entry) => [entry.upstream, entry.path])
    if (JSON.stringify(recorded) !== JSON.stringify(VENDORED_FIXTURES)) {
      problems.push('fixtures mapping drifted from VENDORED_FIXTURES in scripts/check-upstream.mjs (regenerate with --update-lock)')
    }
    for (const entry of lock.fixtures) {
      const file = join(PACKAGE_ROOT, entry.path)
      if (!isFile(file)) {
        problems.push(`${entry.path}: vendored fixture is missing`)
        continue
      }
      if (!SHA256.test(entry.sha256)) {
        problems.push(`${entry.path}: sha256 is not a SHA-256 hex digest`)
        continue
      }
      const actual = hashUpstreamText(file)
      if (actual !== entry.sha256) {
        problems.push(
          `${entry.path}: vendored copy no longer matches upstream ${entry.upstream} at the pinned commit ` +
            `(expected ${entry.sha256}, got ${actual}); refresh it from upstream`,
        )
      }
    }
  }
  assert.equal(problems.length, 0, `vendored fixture problems:${formatList(problems)}`)
})

test('the published package ships every adapted upstream file', () => {
  const manifest = readPackageJson()
  const files = Array.isArray(manifest.files) ? manifest.files : []
  const uncovered = ADAPTED_FILES.map(([, adapted]) => adapted).filter(
    (adapted) => !files.some((entry) => filesEntryMatches(adapted, entry)),
  )
  assert.equal(uncovered.length, 0, `adapted files missing from the published "files" list:${formatList(uncovered)}`)
})

test('vendored fixtures are excluded from the published package', () => {
  const manifest = readPackageJson()
  const files = Array.isArray(manifest.files) ? manifest.files : []
  const leaked = VENDORED_FIXTURES.map(([, path]) => path).filter((path) => files.some((entry) => filesEntryMatches(path, entry)))
  assert.equal(leaked.length, 0, `test fixtures must not be shipped in the npm package:${formatList(leaked)}`)
})

test('the lock matches a local upstream checkout when one is available', (t) => {
  const source = process.env.EGM_SOURCE
  if (source === undefined || !existsSync(join(source, 'skills'))) {
    t.diagnostic('EGM_SOURCE is not set or does not point at an upstream checkout; skipping the live cross-check')
    return
  }
  const problems = []
  const head = spawnSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (head.status === 0 && head.stdout.trim() !== lock.commit) {
    problems.push(`checkout HEAD ${head.stdout.trim()} does not match the pinned commit ${lock.commit}; refresh the lock or check out the pinned commit`)
  }
  for (const entry of lock.files) {
    const file = join(source, entry.upstream)
    if (!existsSync(file)) problems.push(`${entry.upstream}: missing from the upstream checkout`)
    else if (hashUpstreamText(file) !== entry.sha256) problems.push(`${entry.upstream}: content changed upstream; the lock is stale`)
  }
  for (const entry of lock.fixtures) {
    const file = join(source, entry.upstream)
    if (!existsSync(file)) problems.push(`${entry.upstream}: missing from the upstream checkout`)
    else if (hashUpstreamText(file) !== entry.sha256) problems.push(`${entry.upstream}: content changed upstream; the lock is stale`)
  }
  assert.equal(problems.length, 0, `upstream checkout cross-check problems:${formatList(problems)}`)
})

test('the check-upstream entry point is inert when imported and exposes its mapping', () => {
  // scripts/check-upstream.mjs is imported above; importing it must not run the CLI
  // (it guards on import.meta.url). Its mapping is the contract the lock follows.
  assert.ok(ADAPTED_FILES.length > 0)
  assert.equal(new Set(ADAPTED_FILES.map(([upstream]) => upstream)).size, ADAPTED_FILES.length, 'ADAPTED_FILES has duplicate upstream paths')
  for (const [, adapted] of ADAPTED_FILES) {
    if (!relativeToPackage(join(PACKAGE_ROOT, adapted))) continue
    assert.ok(isFile(join(PACKAGE_ROOT, adapted)), `missing adapted file ${adapted}`)
  }
})
