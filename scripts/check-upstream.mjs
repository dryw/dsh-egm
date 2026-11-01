#!/usr/bin/env node
/**
 * Check whether the upstream Elephant-Goldfish Model moved past the commit this
 * package was adapted from, and say which adapted files a re-adaptation must touch.
 *
 * The package is a DeepSeek Harness port of `google/elephant-goldfish-model`
 * (Apache-2.0). `upstream.lock.json` pins the upstream commit and the SHA-256 of
 * every upstream file this package adapted, so a small, deterministic script can
 * tell whether upstream changed without downloading the whole repository.
 *
 * Usage:
 *   node scripts/check-upstream.mjs                       check the upstream default branch
 *   node scripts/check-upstream.mjs --ref <sha-or-branch> check a specific upstream ref
 *   node scripts/check-upstream.mjs --json                machine-readable report
 *   node scripts/check-upstream.mjs --update-lock         rewrite the lock for the checked ref
 *   node scripts/check-upstream.mjs --update-lock --source <checkout>
 *                                                         rewrite the lock from a local clone
 *
 * Exit codes: 0 = up to date, 1 = drift (upstream moved), 2 = error. `--update-lock`
 * exits 0 after writing the lock (or 2 on error) and always writes for the *checked*
 * ref, so it never silently follows a branch without a human running it.
 *
 * Environment: `GITHUB_TOKEN` (or `GH_TOKEN`) is used for GitHub API calls when
 * present. `GITHUB_API_URL` overrides the API base (GitHub Enterprise).
 *
 * Zero dependencies: Node >= 22 builtins only. It is imported by the package
 * tests for its mapping exports; only direct execution runs the CLI.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Package root (the directory that owns package.json and upstream.lock.json). */
export const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
export const LOCK_PATH = join(PACKAGE_ROOT, 'upstream.lock.json')
export const DEFAULT_REPOSITORY = 'google/elephant-goldfish-model'
export const DEFAULT_BRANCH = 'main'
const GITHUB_API = (process.env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/+$/u, '')
const RAW_GITHUB = 'https://raw.githubusercontent.com'

/**
 * Upstream file -> adapted file in this package. This list is the contract the
 * lock file and the drift report are built from; add an entry when a new
 * upstream file is adapted.
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const ADAPTED_FILES = Object.freeze([
  ['skills/egm-bootstrap/SKILL.md', 'skills/egm-bootstrap/SKILL.md'],
  ['skills/egm-brainstorm/SKILL.md', 'skills/egm-brainstorm/SKILL.md'],
  ['skills/egm-draft/SKILL.md', 'skills/egm-draft/SKILL.md'],
  ['skills/egm-drift-report/SKILL.md', 'skills/egm-drift-report/SKILL.md'],
  ['skills/egm-resolve/SKILL.md', 'skills/egm-resolve/SKILL.md'],
  ['skills/egm-review/SKILL.md', 'skills/egm-review/SKILL.md'],
  ['skills/egm-review-loop/SKILL.md', 'skills/egm-review-loop/SKILL.md'],
  ['agents/bootstrap_orchestrator.md', 'agents/bootstrap_orchestrator.md'],
  ['agents/codebase_details.md', 'agents/codebase_details.md'],
  ['agents/comprehension.md', 'agents/comprehension.md'],
  ['agents/design_critic.md', 'agents/design_critic.md'],
  ['agents/implementation_readiness.md', 'agents/implementation_readiness.md'],
  ['agents/structural.md', 'agents/structural.md'],
  ['agents/style.md', 'agents/style.md'],
  ['agents/synthesizer.md', 'agents/synthesizer.md'],
  ['agents/zoom_out.md', 'agents/zoom_out.md'],
  ['resources/README.md', 'resources/README.md'],
  ['resources/execution_instructions.md', 'resources/execution_instructions.md'],
  ['resources/document_standards/feature-spec-standard.md', 'resources/document_standards/feature-spec-standard.md'],
  ['resources/document_standards/heilmeier-standard.md', 'resources/document_standards/heilmeier-standard.md'],
  ['resources/document_standards/implementation-readiness-standard.md', 'resources/document_standards/implementation-readiness-standard.md'],
  ['resources/document_standards/re-implementation-standard.md', 'resources/document_standards/re-implementation-standard.md'],
  ['resources/document_standards/zoom-out-standard.md', 'resources/document_standards/zoom-out-standard.md'],
  ['skills/egm-draft/references/design_doc.md', 'skills/egm-draft/references/design_doc.md'],
  ['skills/egm-bootstrap/references/templates.md', 'skills/egm-bootstrap/references/templates.md'],
  ['skills/egm-bootstrap/references/worker-return.schema.json', 'skills/egm-bootstrap/references/worker-return.schema.json'],
])
/**
 * Upstream files vendored verbatim as test fixtures (same bytes as upstream).
 * @type {ReadonlyArray<readonly [string, string]>}
 */
export const VENDORED_FIXTURES = Object.freeze([
  ['skills/egm-bootstrap/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-bootstrap.yaml'],
  ['skills/egm-brainstorm/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-brainstorm.yaml'],
  ['skills/egm-draft/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-draft.yaml'],
  ['skills/egm-drift-report/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-drift-report.yaml'],
  ['skills/egm-resolve/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-resolve.yaml'],
  ['skills/egm-review/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-review.yaml'],
  ['skills/egm-review-loop/test_scenarios.yaml', 'test/fixtures/upstream-scenarios/egm-review-loop.yaml'],
  ['skills/egm-bootstrap/SKILL.md', 'test/fixtures/upstream-skills/egm-bootstrap/SKILL.md'],
  ['skills/egm-brainstorm/SKILL.md', 'test/fixtures/upstream-skills/egm-brainstorm/SKILL.md'],
  ['skills/egm-draft/SKILL.md', 'test/fixtures/upstream-skills/egm-draft/SKILL.md'],
  ['skills/egm-drift-report/SKILL.md', 'test/fixtures/upstream-skills/egm-drift-report/SKILL.md'],
  ['skills/egm-resolve/SKILL.md', 'test/fixtures/upstream-skills/egm-resolve/SKILL.md'],
  ['skills/egm-review/SKILL.md', 'test/fixtures/upstream-skills/egm-review/SKILL.md'],
  ['skills/egm-review-loop/SKILL.md', 'test/fixtures/upstream-skills/egm-review-loop/SKILL.md'],
  ['docs/designs/review.md', 'test/fixtures/upstream-designs/review.md'],
  ['docs/designs/draft.md', 'test/fixtures/upstream-designs/draft.md'],
])

/** Normalised SHA-256 of a buffer or text. */
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

/** Parse `process.argv` into the CLI options (does not validate combinations). */
export function parseArgs(argv) {
  const options = { ref: undefined, json: false, updateLock: false, source: undefined, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--json') options.json = true
    else if (argument === '--update-lock') options.updateLock = true
    else if (argument === '--help' || argument === '-h') options.help = true
    else if (argument === '--ref') {
      options.ref = argv[index + 1]
      index += 1
    } else if (argument.startsWith('--ref=')) options.ref = argument.slice('--ref='.length)
    else if (argument === '--source') {
      options.source = argv[index + 1]
      index += 1
    } else if (argument.startsWith('--source=')) options.source = argument.slice('--source='.length)
    else throw new Error(`unknown argument ${JSON.stringify(argument)} (try --help)`)
  }
  return options
}

/** Read and validate `upstream.lock.json`; throws a readable error when invalid. */
export function readLock(lockPath = LOCK_PATH) {
  if (!existsSync(lockPath)) throw new Error(`no lock file at ${lockPath}; run with --update-lock first`)
  let lock
  try {
    lock = JSON.parse(readFileSync(lockPath, 'utf8'))
  } catch (error) {
    throw new Error(`${lockPath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  for (const field of ['repository', 'branch', 'commit']) {
    if (typeof lock?.[field] !== 'string' || lock[field].trim() === '') {
      throw new Error(`${lockPath}: "${field}" must be a non-empty string`)
    }
  }
  if (!Array.isArray(lock.files) || lock.files.length === 0) throw new Error(`${lockPath}: "files" must be a non-empty array`)
  for (const [index, entry] of lock.files.entries()) {
    for (const field of ['upstream', 'adapted']) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        throw new Error(`${lockPath}: files[${index}].${field} must be a non-empty string`)
      }
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(entry.sha256)) {
      throw new Error(`${lockPath}: files[${index}].sha256 must be a SHA-256 hex digest`)
    }
  }
  return lock
}

/** Build the lock object for one upstream commit using a local checkout or GitHub. */
export async function buildLock({ repository, branch, commit, source, token }) {
  const files = []
  for (const [upstream, adapted] of ADAPTED_FILES) {
    files.push({ upstream, adapted, sha256: await upstreamHash(upstream, { repository, commit, source, token }) })
  }
  const fixtures = []
  for (const [upstream, vendoredPath] of VENDORED_FIXTURES) {
    fixtures.push({ upstream, path: vendoredPath, sha256: await upstreamHash(upstream, { repository, commit, source, token }) })
  }
  const lock = {
    schemaVersion: 1,
    repository,
    branch,
    commit,
    updatedAt: new Date().toISOString(),
    files,
    fixtures,
  }
  return lock
}

/** Read one upstream file's SHA-256 from a checkout directory or from raw.githubusercontent.com. */
async function upstreamHash(upstreamPath, { repository, commit, source, token }) {
  // Git stores upstream text with LF; a Windows checkout may materialise CRLF
  // (core.autocrlf). Hash the repository text so the lock is platform-independent
  // and matches GitHub's raw bytes.
  if (source !== undefined) {
    const file = join(source, upstreamPath)
    if (!existsSync(file)) throw new Error(`upstream file missing from ${source}: ${upstreamPath}`)
    return sha256(readFileSync(file, 'utf8').replace(/\r\n/gu, '\n'))
  }
  const url = `${RAW_GITHUB}/${repository}/${commit}/${upstreamPath}`
  const response = await fetch(url, { headers: requestHeaders(token) })
  if (!response.ok) throw new Error(`cannot fetch ${url}: HTTP ${response.status}`)
  return sha256(Buffer.from(await response.arrayBuffer()).toString('utf8').replace(/\r\n/gu, '\n'))
}

function requestHeaders(token) {
  const headers = { accept: 'application/vnd.github+json', 'user-agent': 'dsh-egm-upstream-check' }
  if (token) headers.authorization = `Bearer ${token}`
  return headers
}

async function githubJson(path, token) {
  const response = await fetch(`${GITHUB_API}${path}`, { headers: requestHeaders(token) })
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 300)
    throw new Error(`GitHub API ${path} failed: HTTP ${response.status}${detail === '' ? '' : ` (${detail})`}`)
  }
  return response.json()
}

/** Resolve a branch, tag or commit to a full 40-character commit SHA. */
async function resolveCommit(repository, ref, token) {
  if (/^[0-9a-f]{40}$/iu.test(ref)) return ref.toLowerCase()
  const commit = await githubJson(`/repos/${repository}/commits/${encodeURIComponent(ref)}`, token)
  if (typeof commit?.sha !== 'string') throw new Error(`GitHub did not return a commit SHA for ${ref}`)
  return commit.sha
}

async function resolveDefaultBranch(repository, token) {
  const repo = await githubJson(`/repos/${repository}`, token)
  if (typeof repo?.default_branch !== 'string' || repo.default_branch === '') {
    throw new Error(`GitHub did not return a default branch for ${repository}`)
  }
  return repo.default_branch
}

function gitHead(directory) {
  const result = spawnSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`cannot read git HEAD from ${directory}: ${(result.stderr ?? '').trim()}`)
  return result.stdout.trim()
}

/** Compare the locked commit with a target commit and report the affected adapted files. */
export async function checkForDrift({ ref, token, lock }) {
  const repository = lock.repository
  const branch = typeof lock.branch === 'string' && lock.branch !== '' ? lock.branch : DEFAULT_BRANCH
  const targetRef = ref ?? branch
  const targetCommit = await resolveCommit(repository, targetRef, token)
  const result = {
    repository,
    branch,
    pinnedCommit: lock.commit,
    targetRef,
    targetCommit,
    drift: targetCommit !== lock.commit,
    commitCount: 0,
    comparedFiles: 0,
    affected: [],
    otherChanged: [],
    compareUrl: undefined,
  }
  if (!result.drift) return result
  let compare = await githubJson(`/repos/${repository}/compare/${lock.commit}...${targetCommit}`, token)
  let targetBehind = false
  if (compare?.status === 'behind') {
    // GitHub returns no file list when head is an ancestor of base; read the same
    // diff in the forward direction so the report can still name the files.
    targetBehind = true
    const compareUrl = typeof compare?.html_url === 'string' ? compare.html_url : undefined
    compare = await githubJson(`/repos/${repository}/compare/${targetCommit}...${lock.commit}`, token)
    if (compareUrl !== undefined) compare.html_url = compareUrl
  }
  const changedFiles = Array.isArray(compare?.files) ? compare.files : []
  const adaptedByUpstream = new Map(ADAPTED_FILES.map(([upstream, adapted]) => [upstream, adapted]))
  result.commitCount = typeof compare?.total_commits === 'number' ? compare.total_commits : changedFiles.length
  result.comparedFiles = changedFiles.length
  result.targetBehind = targetBehind
  result.targetStatus = typeof compare?.status === 'string' ? compare.status : undefined
  result.compareUrl = typeof compare?.html_url === 'string' ? compare.html_url : undefined
  for (const file of changedFiles) {
    if (typeof file?.filename !== 'string') continue
    const adapted = adaptedByUpstream.get(file.filename)
    if (adapted !== undefined) {
      result.affected.push({ upstream: file.filename, adapted, status: file.status ?? 'changed' })
    } else {
      result.otherChanged.push(file.filename)
    }
  }
  result.compareLimited = changedFiles.length >= 300
  return result
}

/** Render the plain-text report (also used as the GitHub issue body head). */
export function renderReport(result, { updateNote } = {}) {
  const lines = []
  lines.push('dsh-egm upstream check')
  lines.push(`  repository: ${result.repository}`)
  lines.push(`  pinned:     ${result.pinnedCommit}${result.pinnedCommit === result.targetCommit ? '' : ' (upstream.lock.json)'}`)
  lines.push(`  target:     ${result.targetCommit} (${result.targetRef})`)
  if (!result.drift) {
    lines.push('')
    lines.push('Up to date: upstream has not moved since the pinned commit.')
    if (updateNote) lines.push(updateNote)
    return `${lines.join('\n')}\n`
  }
  lines.push('')
  if (result.targetBehind === true) {
    lines.push(`DRIFT: the checked ref is behind the pinned commit (${result.commitCount} commit(s) the pinned commit has ahead).`)
    lines.push('Check the upstream default branch instead of an older --ref.')
  } else if (result.targetStatus === 'diverged') {
    lines.push(`DRIFT: upstream and the pinned commit have diverged (${result.comparedFiles} changed file(s)).`)
  } else {
    lines.push(`DRIFT: upstream advanced past the pinned commit (${result.commitCount} commit(s), ${result.comparedFiles} changed file(s)).`)
  }
  if (result.affected.length === 0) {
    lines.push('')
    lines.push('No adapted file changed in the compared range, so no re-adaptation is required.')
  } else {
    lines.push('')
    lines.push(`Affected adapted files (${result.affected.length}):`)
    for (const file of result.affected) lines.push(`  - [${file.status}] ${file.upstream}  ->  ${file.adapted}`)
  }
  if (result.otherChanged.length > 0) {
    lines.push('')
    lines.push(`Other changed upstream files (${result.otherChanged.length}, not adapted; no action required):`)
    for (const file of result.otherChanged.slice(0, 20)) lines.push(`  - ${file}`)
    if (result.otherChanged.length > 20) lines.push(`  - ... and ${result.otherChanged.length - 20} more`)
  }
  if (result.compareLimited) {
    lines.push('')
    lines.push('Note: the GitHub compare API truncated its file list; check the compare page for the rest.')
  }
  if (result.compareUrl) {
    lines.push('')
    lines.push(`Compare: ${result.compareUrl}`)
  }
  lines.push('')
  lines.push('Next steps: re-adapt the affected files for DeepSeek Harness, refresh the vendored fixtures,')
  lines.push('then run `node scripts/check-upstream.mjs --update-lock` and `node --test`.')
  return `${lines.join('\n')}\n`
}

const HELP = `Check google/elephant-goldfish-model for changes since upstream.lock.json

Usage: node scripts/check-upstream.mjs [options]

Options:
  --ref <sha-or-branch>  upstream ref to check (default: the locked branch)
  --json                 print a machine-readable report
  --update-lock          rewrite upstream.lock.json for the checked ref
  --source <checkout>    with --update-lock: hash a local upstream checkout instead of GitHub raw
  -h, --help             show this help

Environment:
  GITHUB_TOKEN / GH_TOKEN  authenticate GitHub API calls (avoids the 60 req/h anonymous limit)
  GITHUB_API_URL           API base override (GitHub Enterprise)

Exit codes: 0 up to date, 1 drift, 2 error.
`

async function main(argv) {
  const options = parseArgs(argv)
  if (options.help) {
    process.stdout.write(HELP)
    return 0
  }
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
  // --update-lock can bootstrap a missing lock file; a normal check cannot.
  const existingLock = options.updateLock && !existsSync(LOCK_PATH) ? undefined : readLock()
  const repository = existingLock?.repository ?? DEFAULT_REPOSITORY
  const branch = typeof existingLock?.branch === 'string' && existingLock.branch !== '' ? existingLock.branch : DEFAULT_BRANCH

  if (options.updateLock) {
    let commit
    const source = options.source
    if (source !== undefined) {
      commit = options.ref ?? gitHead(source)
    } else {
      const targetRef = options.ref ?? branch
      commit = await resolveCommit(repository, targetRef, token)
    }
    const updated = await buildLock({ repository, branch, commit, source, token })
    writeFileSync(LOCK_PATH, `${JSON.stringify(updated, null, 2)}\n`)
    const result = {
      repository,
      branch,
      pinnedCommit: existingLock?.commit ?? null,
      targetRef: options.ref ?? branch,
      targetCommit: commit,
      drift: existingLock?.commit !== commit,
      updated,
    }
    if (options.json) process.stdout.write(`${JSON.stringify({ ...result, result: 'lock-updated' }, null, 2)}\n`)
    else {
      process.stdout.write(
        `updated ${LOCK_PATH}\n  commit:   ${commit}\n  files:    ${updated.files.length} adapted, ${updated.fixtures.length} vendored\n`,
      )
    }
    return 0
  }

  const lock = existingLock ?? readLock()
  const result = await checkForDrift({ ref: options.ref, token, lock })
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...result, result: result.drift ? 'drift' : 'clean' }, null, 2)}\n`)
  } else {
    process.stdout.write(renderReport(result))
  }
  return result.drift ? 1 : 0
}

/** True when this module is the process entry point (not imported by the tests). */
function isEntryPoint(argv1 = process.argv[1]) {
  if (argv1 === undefined) return false
  try {
    return pathToFileURL(argv1).href === import.meta.url
  } catch {
    return false
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      process.stderr.write(`check-upstream: ${error instanceof Error ? error.message : String(error)}\n`)
      process.exitCode = 2
    },
  )
}
