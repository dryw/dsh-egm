/**
 * Shared helpers for the dsh-egm package test suite.
 *
 * Plain Node >= 22, zero dependencies: only `node:` builtins are imported here.
 * Every helper is a pure read; nothing in this file writes to the package.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// This module lives in tests/unit/, so the package root is two levels up.
/** Absolute path to the package root (the directory that owns package.json). */
export const PACKAGE_ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)))
export const PACKAGE_JSON_PATH = join(PACKAGE_ROOT, 'package.json')
export const SKILLS_DIR = join(PACKAGE_ROOT, 'skills')
export const RESOURCES_DIR = join(PACKAGE_ROOT, 'resources')
export const LOCALE_DIR = join(PACKAGE_ROOT, 'adapters', 'dsh', 'locale')
export const TEST_DIR = join(PACKAGE_ROOT, 'tests', 'unit')
export const FIXTURES_DIR = join(TEST_DIR, 'fixtures')

/**
 * Running DeepSeek Harness version the package is checked against.
 * Override with DSH_RUNTIME_VERSION when validating against another install.
 */
export const DSH_RUNTIME_VERSION = process.env.DSH_RUNTIME_VERSION || '0.2.1-rc.5'

/** Skill directories the vendored upstream set requires (upstream names, kept exactly). */
export const EXPECTED_SKILLS = Object.freeze([
  'egm-bootstrap',
  'egm-brainstorm',
  'egm-draft',
  'egm-drift-report',
  'egm-resolve',
  'egm-review',
  'egm-review-loop',
])

/** The authoritative vendored-upstream file set the integration layer promises. */
export const SHARED_RESOURCE_PATHS = Object.freeze([
  'resources/README.md',
  'resources/execution_instructions.md',
  'resources/document_standards/feature-spec-standard.md',
  'resources/document_standards/heilmeier-standard.md',
  'resources/document_standards/implementation-readiness-standard.md',
  'resources/document_standards/re-implementation-standard.md',
  'resources/document_standards/zoom-out-standard.md',
  'skills/egm-draft/references/design_doc.md',
  'skills/egm-bootstrap/references/templates.md',
  'skills/egm-bootstrap/references/worker-return.schema.json',
  'agents/bootstrap_orchestrator.md',
  'agents/codebase_details.md',
  'agents/comprehension.md',
  'agents/design_critic.md',
  'agents/implementation_readiness.md',
  'agents/structural.md',
  'agents/style.md',
  'agents/synthesizer.md',
  'agents/zoom_out.md',
])

/** Turn an absolute path into the package-relative POSIX path used in failures. */
export function relativeToPackage(absolutePath) {
  return relative(PACKAGE_ROOT, absolutePath).split(sep).join('/')
}

/** Resolve a package-relative path to an absolute path. */
export function packagePath(relativePath) {
  return join(PACKAGE_ROOT, relativePath)
}

/** Whether an absolute path is an existing regular file. */
export function isFile(absolutePath) {
  try {
    return statSync(absolutePath).isFile()
  } catch {
    return false
  }
}

/** Whether an absolute path is an existing directory. */
export function isDirectory(absolutePath) {
  try {
    return statSync(absolutePath).isDirectory()
  } catch {
    return false
  }
}

/** Read and parse a JSON file, with the file path in every failure message. */
export function readJsonFile(absolutePath) {
  let text
  try {
    text = readFileSync(absolutePath, 'utf8')
  } catch (error) {
    throw new Error(`cannot read ${relativeToPackage(absolutePath)}: ${error.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`${relativeToPackage(absolutePath)} is not valid JSON: ${error.message}`)
  }
}

/** Read a UTF-8 text file, with the package-relative path in every failure message. */
export function readTextFile(absolutePath) {
  try {
    return readFileSync(absolutePath, 'utf8')
  } catch (error) {
    throw new Error(`cannot read ${relativeToPackage(absolutePath)}: ${error.message}`)
  }
}

/** Read the package manifest (throws a readable error when it is missing). */
export function readPackageJson() {
  if (!isFile(PACKAGE_JSON_PATH)) throw new Error('package.json is missing from the package root')
  return readJsonFile(PACKAGE_JSON_PATH)
}

/** Sorted names of the directories under `skills/` (empty when the directory is missing). */
export function listSkillDirectories() {
  if (!isDirectory(SKILLS_DIR)) return []
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

/** Absolute path of each bundled `skills/<dir>/SKILL.md` that exists right now. */
export function listSkillMarkdownFiles() {
  return listSkillDirectories()
    .map((name) => join(SKILLS_DIR, name, 'SKILL.md'))
    .filter((file) => isFile(file))
}

/**
 * Recursively list regular files below a directory.
 * Skips `node_modules`, VCS metadata, dot-directories and symbolic links.
 */
export function walkFiles(rootDirectory) {
  if (!isDirectory(rootDirectory)) return []
  const found = []
  for (const entry of readdirSync(rootDirectory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue
    const entryPath = join(rootDirectory, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue
      found.push(...walkFiles(entryPath))
    } else if (entry.isFile()) {
      found.push(entryPath)
    }
  }
  return found.sort()
}

/** Every Markdown file whose path may reference shared resources (skills + resources trees). */
export function listContentMarkdownFiles() {
  const files = []
  if (isDirectory(SKILLS_DIR)) files.push(...walkFiles(SKILLS_DIR).filter((file) => file.endsWith('.md')))
  if (isDirectory(RESOURCES_DIR)) files.push(...walkFiles(RESOURCES_DIR).filter((file) => file.endsWith('.md')))
  return files
}

/**
 * Parse the strict, one-line-per-key YAML frontmatter block the vendored
 * upstream files use.
 *
 * This parser is deliberately independent of `adapters/dsh/skills-host.js`: the
 * tests must hold the files to the contract even if the host parser is lenient.
 * It accepts the folded (`>`) and literal (`|`) block scalars upstream uses, and
 * rejects indented continuation lines, lists, duplicate keys and unknown syntax.
 *
 * @param {string} source whole SKILL.md text.
 * @param {string} label diagnostic label (usually the package-relative path).
 * @returns {{ fields: Record<string, string>, body: string, bodyTrimmed: string }}
 * @throws {Error} when the frontmatter is missing or breaks the contract.
 */
export function parseFrontmatter(source, label = 'document') {
  const opening = /^---\r?\n/.exec(source)
  if (opening === null) {
    throw new Error(`${label}: missing YAML frontmatter (file must start with a "---" line)`)
  }
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(source.slice(opening[0].length))
  if (closing === null) {
    throw new Error(`${label}: unterminated YAML frontmatter (no closing "---" line)`)
  }
  const blockEnd = opening[0].length + closing.index
  const block = source.slice(opening[0].length, blockEnd)
  const body = source.slice(blockEnd + closing[0].length)
  const fields = {}
  const lines = block.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 2
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    if (/^[ \t]/.test(line)) {
      throw new Error(
        `${label}:${lineNumber}: indented frontmatter line ${JSON.stringify(line)} is a multiline value, which the ` +
          `frontmatter contract does not allow here (use a single-line value or a ">" / "|" block scalar)`,
      )
    }
    const pair = /^([A-Za-z0-9_-]+):(?:[ \t]*(.*))?$/.exec(line)
    if (pair === null) {
      throw new Error(`${label}:${lineNumber}: unsupported frontmatter line ${JSON.stringify(line)}`)
    }
    const key = pair[1]
    let value = (pair[2] ?? '').trim()
    if (/^[>|][+-]?$/u.test(value)) {
      const folded = value.startsWith('>')
      const continuation = []
      while (index + 1 < lines.length && (/^[ \t]/u.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
        index += 1
        continuation.push(lines[index])
      }
      const meaningful = continuation.map((entry) => entry.trim()).filter((entry) => entry !== '')
      value = folded ? meaningful.join(' ') : meaningful.join('\n')
    }
    if (value.startsWith('[') || value.startsWith('{') || /^-[ \t]/.test(value)) {
      throw new Error(`${label}:${lineNumber}: YAML lists/maps are forbidden in frontmatter`)
    }
    if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
      value = value.slice(1, -1)
    }
    if (Object.hasOwn(fields, key)) {
      throw new Error(`${label}:${lineNumber}: duplicate frontmatter key ${JSON.stringify(key)}`)
    }
    fields[key] = value
  }
  return { fields, raw: block, body, bodyTrimmed: body.trim() }
}

/**
 * Extract every `resources/...` path mentioned in a Markdown document.
 * Trailing sentence punctuation and fragments are stripped; placeholders are dropped.
 * @param {string} text document text.
 * @returns {string[]} unique package-relative reference strings, in order of appearance.
 */
export function referencedResourcePaths(text) {
  const matches = text.matchAll(/(?<![A-Za-z0-9_./-])resources\/[A-Za-z0-9._/-]+/g)
  const seen = new Set()
  const references = []
  for (const match of matches) {
    let reference = match[0].replace(/[.,;:!?'"`)\]}]+$/u, '')
    reference = reference.split('#')[0].split('?')[0]
    if (reference === '' || reference === 'resources') continue
    if (/[*<>{}]/.test(reference)) continue
    if (seen.has(reference)) continue
    seen.add(reference)
    references.push(reference)
  }
  return references
}

/**
 * Whether a package-relative file is included by one `files` manifest entry
 * (npm semantics: an entry is an exact file, a directory prefix, or a glob).
 */
export function filesEntryMatches(relativePath, entry) {
  const normalisedEntry = String(entry).replace(/^\.\//u, '').replace(/\/+$/u, '')
  if (normalisedEntry === '') return false
  if (normalisedEntry.includes('*') || normalisedEntry.includes('?')) {
    const pattern = normalisedEntry
      .split('/')
      .map((segment) => {
        if (segment === '**') return '.*'
        return segment.replace(/[.+^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '[^/]*').replace(/\?/gu, '[^/]')
      })
      .join('/')
    return new RegExp(`^${pattern}$`, 'u').test(relativePath)
  }
  return relativePath === normalisedEntry || relativePath.startsWith(`${normalisedEntry}/`)
}

/** Format a sorted list for assertion messages. */
export function formatList(items) {
  return items.length === 0 ? '(none)' : items.map((item) => `\n  - ${item}`).join('')
}

const NUM = '(?:0|[1-9]\\d*)'
const PRE_ID = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)'
const VERSION_RE = new RegExp(
  `^[v=]?(${NUM})\\.(${NUM})\\.(${NUM})(?:-(${PRE_ID}(?:\\.${PRE_ID})*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`,
)
const PARTIAL_RE = /^[v=]?(\d+|[xX*])(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

/** Parse a full SemVer string; throws on anything invalid. */
export function parseVersion(text) {
  const match = VERSION_RE.exec(String(text).trim())
  if (match === null) throw new Error(`${JSON.stringify(text)} is not a valid SemVer version`)
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
  }
}

function compareVersions(left, right) {
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1
  }
  const a = left.prerelease
  const b = right.prerelease
  if (a.length === 0 && b.length === 0) return 0
  if (a.length === 0) return 1
  if (b.length === 0) return -1
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const x = a[index]
    const y = b[index]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNumeric = /^\d+$/u.test(x)
    const yNumeric = /^\d+$/u.test(y)
    if (xNumeric && yNumeric) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1
    } else if (xNumeric) {
      return -1
    } else if (yNumeric) {
      return 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

function release(major, minor, patch) {
  return { major, minor, patch, prerelease: [] }
}

function caretUpper(version) {
  if (version.major > 0) return release(version.major + 1, 0, 0)
  if (version.minor > 0) return release(0, version.minor + 1, 0)
  return release(0, 0, version.patch + 1)
}

function tildeUpper(version) {
  return release(version.major, version.minor + 1, 0)
}

function parsePartial(text) {
  const match = PARTIAL_RE.exec(String(text).trim())
  if (match === null) return undefined
  const toPart = (value) => (value === undefined || /^[xX*]$/u.test(value) ? undefined : Number(value))
  return {
    major: toPart(match[1]),
    minor: toPart(match[2]),
    patch: toPart(match[3]),
    prerelease: match[4] === undefined ? [] : match[4].split('.'),
    full: toPart(match[1]) !== undefined && toPart(match[2]) !== undefined && toPart(match[3]) !== undefined,
  }
}

function partialFloor(partial) {
  return {
    major: partial.major ?? 0,
    minor: partial.minor ?? 0,
    patch: partial.patch ?? 0,
    prerelease: partial.prerelease ?? [],
  }
}

function comparatorPredicates(version, token) {
  const match = /^(>=|<=|>|<|=|\^|~)?(.*)$/u.exec(token)
  const operator = match[1] ?? '='
  const body = match[2].trim()
  if (body === '' || /^[xX*]$/u.test(body)) return [() => true]
  const partial = parsePartial(body)
  if (partial === undefined) throw new Error(`invalid SemVer comparator ${JSON.stringify(token)} in range`)
  if (!partial.full && operator !== '^' && operator !== '~') {
    // x-ranges with comparison operators: `>=0.2` means `>=0.2.0`, `<0.2` means `<0.2.0`, etc.
    const floor = partialFloor(partial)
    if (operator === '>=') return [() => compareVersions(version, floor) >= 0]
    if (operator === '>') {
      const upper = release(partial.major ?? 0, (partial.minor ?? 0) + (partial.patch === undefined ? 1 : 0), 0)
      return [() => compareVersions(version, partial.minor === undefined ? upper : floor) > 0]
    }
    if (operator === '<') return [() => compareVersions(version, floor) < 0]
    if (operator === '<=') {
      const upper = release(partial.major ?? 0, (partial.minor ?? 0) + 1, 0)
      return [() => compareVersions(version, upper) < 0]
    }
    return [() => compareVersions(version, floor) === 0]
  }
  const lower = partialFloor(partial)
  switch (operator) {
    case '^': {
      const upper = caretUpper(partial)
      return [() => compareVersions(version, lower) >= 0, () => compareVersions(version, upper) < 0]
    }
    case '~': {
      const upper = tildeUpper(partial)
      return [() => compareVersions(version, lower) >= 0, () => compareVersions(version, upper) < 0]
    }
    case '>':
      return [() => compareVersions(version, lower) > 0]
    case '>=':
      return [() => compareVersions(version, lower) >= 0]
    case '<':
      return [() => compareVersions(version, lower) < 0]
    case '<=':
      return [() => compareVersions(version, lower) <= 0]
    default:
      return [() => compareVersions(version, lower) === 0]
  }
}

/**
 * Minimal SemVer range check with the same prerelease policy DSH uses when it evaluates
 * `engines.dsh`: `semver.satisfies(runtimeVersion, range, { includePrerelease: true })`
 * (verified in the shipped Harness: `dsh-app-boot`'s `satisfies`). This differs from npm's
 * default range policy, which excludes prereleases unless a comparator names the same
 * major/minor/patch tuple; do not "align" this helper with the npm CLI default.
 */
export function semverSatisfies(versionText, rangeText) {
  const version = parseVersion(versionText)
  const range = String(rangeText).trim()
  if (range === '') return false
  for (const alternative of range.split('||')) {
    const set = alternative.trim()
    if (set === '') continue
    const hyphen = /^(\S+)\s+-\s+(\S+)$/u.exec(set)
    const tokens = hyphen === null ? set.split(/\s+/u).filter(Boolean) : []
    let predicates
    if (hyphen !== null) {
      const low = parsePartial(hyphen[1])
      const high = parsePartial(hyphen[2])
      if (low === undefined || high === undefined) throw new Error(`invalid hyphen range ${JSON.stringify(set)}`)
      const highFloor = partialFloor(high)
      predicates = [
        () => compareVersions(version, partialFloor(low)) >= 0,
        () => (high.full ? compareVersions(version, highFloor) <= 0 : compareVersions(version, highFloor) < 0),
      ]
    } else {
      predicates = tokens.flatMap((token) => comparatorPredicates(version, token))
    }
    if (predicates.every((predicate) => predicate())) return true
  }
  return false
}

/** Last path segment of a package-relative path, used in labels. */
export function basename(absolutePath) {
  return relativeToPackage(absolutePath).split('/').at(-1) ?? dirname(absolutePath)
}
