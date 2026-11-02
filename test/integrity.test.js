/**
 * Vendored-content integrity: `upstream.lock.json` must describe exactly the files
 * this package vendors from google/elephant-goldfish-model, in both directions.
 *
 * `test/upstream-sync.test.js` verifies the recorded SHA-256 values; this file covers
 * the complementary property: every shipped file under `skills/`, `agents/` and
 * `resources/`, and every verbatim upstream fixture under `test/fixtures/upstream-*`,
 * has a lock entry, and every lock entry still points at a file in the tree. A newly
 * vendored file therefore cannot slip in without a lock entry, and a stale entry
 * cannot survive a rename or deletion.
 *
 * Determinism: only read-only helpers from `./helpers.js` are used. The tracked-file
 * list comes from `git ls-files` (the package is a git checkout in CI) with a
 * filesystem-walk fallback for environments without git.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { FIXTURES_DIR, PACKAGE_ROOT, formatList, isDirectory, isFile, relativeToPackage, walkFiles } from './helpers.js'
import { LOCK_PATH, readLock } from '../scripts/check-upstream.mjs'

const lock = readLock(LOCK_PATH)

/** Package-relative roots whose every shipped file is a vendored upstream file. */
const VENDORED_CONTENT_ROOTS = Object.freeze(['skills', 'agents', 'resources'])

/**
 * Package-authored files that live beside the vendored fixture bytes. They are not
 * upstream content, so they are the only allowed exceptions to the fixture rule.
 */
const PACKAGE_AUTHORED_FIXTURES = Object.freeze([
  'test/fixtures/upstream-designs/README.md',
  'test/fixtures/upstream-designs/corpus.json',
  'test/fixtures/upstream-scenarios/README.md',
  'test/fixtures/upstream-skills/README.md',
])

/** Normalise a path to the package-relative POSIX form the lock file records. */
function normalisePath(filePath) {
  return String(filePath).replace(/\\/gu, '/').replace(/^\.\//u, '')
}

/** Absolute path for comparison against git's `--show-toplevel` output. */
function normaliseAbsolute(filePath) {
  const resolved = resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

/**
 * Package-relative POSIX paths of the git-tracked files matching `pathspecs`.
 * Returns `undefined` when git is unavailable, this is not a checkout, or the
 * enclosing repository is not the package root, so callers can fall back to walking.
 *
 * @param {readonly string[]} pathspecs package-relative paths to list.
 * @returns {string[] | undefined} sorted unique paths, or undefined without git.
 */
function gitTrackedFiles(pathspecs) {
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: PACKAGE_ROOT, encoding: 'utf8' })
  if (toplevel.error !== undefined || toplevel.status !== 0 || typeof toplevel.stdout !== 'string') return undefined
  if (normaliseAbsolute(toplevel.stdout.trim()) !== normaliseAbsolute(PACKAGE_ROOT)) return undefined
  const result = spawnSync('git', ['ls-files', '-z', '--', ...pathspecs], { cwd: PACKAGE_ROOT, encoding: 'utf8' })
  if (result.error !== undefined || result.status !== 0 || typeof result.stdout !== 'string') return undefined
  const tracked = result.stdout
    .split('\0')
    .filter((file) => file !== '')
    .map(normalisePath)
  return [...new Set(tracked)].sort()
}

/** Every shipped vendored content file, from git when available and the filesystem otherwise. */
function listVendoredContentFiles() {
  const tracked = gitTrackedFiles(VENDORED_CONTENT_ROOTS)
  if (tracked !== undefined) return { files: tracked, tracked: true }
  const walked = VENDORED_CONTENT_ROOTS.flatMap((root) => walkFiles(join(PACKAGE_ROOT, root))).map(relativeToPackage)
  return { files: [...new Set(walked)].sort(), tracked: false }
}

/** Every file below a `test/fixtures/upstream-*` directory, minus the package-authored exceptions. */
function listVendoredFixtureFiles() {
  if (!isDirectory(FIXTURES_DIR)) return []
  const fixtureDirectories = readdirSync(FIXTURES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('upstream-'))
    .map((entry) => join(FIXTURES_DIR, entry.name))
    .sort()
  return fixtureDirectories
    .flatMap((directory) => walkFiles(directory))
    .map(relativeToPackage)
    .filter((file) => !PACKAGE_AUTHORED_FIXTURES.includes(file))
}

const contentFiles = listVendoredContentFiles()
const fixtureFiles = listVendoredFixtureFiles()
const trackedAdapted = new Set(lock.files.map((entry) => normalisePath(entry.adapted)))
const trackedFixtures = new Set(lock.fixtures.map((entry) => normalisePath(entry.path)))

test('every vendored runtime file under skills/, agents/ and resources/ is listed in upstream.lock.json', () => {
  const unlisted = contentFiles.files.filter((file) => !trackedAdapted.has(file))
  assert.equal(
    unlisted.length,
    0,
    `vendored runtime files with no upstream.lock.json "files" entry ` +
      `(add them to ADAPTED_FILES in scripts/check-upstream.mjs and regenerate the lock):${formatList(unlisted)}`,
  )
})

test('every upstream.lock.json files[].adapted path exists and is git-tracked', () => {
  const problems = []
  for (const entry of lock.files) {
    const adapted = normalisePath(entry.adapted)
    if (!isFile(join(PACKAGE_ROOT, adapted))) {
      problems.push(`${adapted}: lock entry points at a missing file`)
    } else if (contentFiles.tracked && !contentFiles.files.includes(adapted)) {
      problems.push(`${adapted}: lock entry points at a file that is not git-tracked`)
    }
  }
  assert.equal(problems.length, 0, `upstream.lock.json "files" entries that no longer match the tree:${formatList(problems)}`)
})

test('every vendored upstream fixture under test/fixtures/upstream-* is listed in upstream.lock.json', () => {
  const unlisted = fixtureFiles.filter((file) => !trackedFixtures.has(file))
  assert.equal(
    unlisted.length,
    0,
    `vendored upstream fixtures with no upstream.lock.json "fixtures" entry ` +
      `(add them to VENDORED_FIXTURES in scripts/check-upstream.mjs and regenerate the lock):${formatList(unlisted)}`,
  )
})

test('every upstream.lock.json fixtures[].path exists', () => {
  const missing = lock.fixtures
    .map((entry) => normalisePath(entry.path))
    .filter((path) => !isFile(join(PACKAGE_ROOT, path)))
  assert.equal(missing.length, 0, `upstream.lock.json "fixtures" entries whose vendored file is missing:${formatList(missing)}`)
})
