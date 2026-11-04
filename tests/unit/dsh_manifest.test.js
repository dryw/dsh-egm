/**
 * Manifest checks: the package must be a valid DSH bundle (the bundle manifest
 * contract), ship exactly the right files, and need no build step.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'
import {
  DSH_RUNTIME_VERSION,
  PACKAGE_ROOT,
  filesEntryMatches,
  formatList,
  isFile,
  packagePath,
  parseVersion,
  readJsonFile,
  readPackageJson,
  readTextFile,
  relativeToPackage,
  semverSatisfies,
  walkFiles,
} from './dsh_helpers.js'

/** The 26 vendored paths pinned by upstream.lock.json (the package's content contract). */
const LOCKED_ADAPTED_FILES = readJsonFile(packagePath('upstream.lock.json')).files.map((entry) => entry.adapted)

/**
 * Content the bundle cannot work without, and that `files` must therefore include:
 * every locked upstream path plus the relocated host modules, the active guide and
 * record, and the provenance/legal files.
 */
const REQUIRED_FILES = [
  ...LOCKED_ADAPTED_FILES,
  'adapters/dsh/skills-host.js',
  'adapters/dsh/reviewer-host.js',
  'adapters/dsh/reviewer-tools.js',
  'adapters/dsh/cordis.patch.yml',
  'adapters/dsh/agent-presets.patch.yml',
  'adapters/dsh/icon.svg',
  'adapters/dsh/locale/en.json',
  'adapters/dsh/locale/zh.json',
  'docs/assets/workflow.svg',
  'docs/assets/protocol.svg',
  'README.md',
  'README.zh-CN.md',
  'TESTING.md',
  'docs/dsh.md',
  'upstream.lock.json',
  'LICENSE',
  'NOTICE',
  'CHANGELOG.md',
]

/** Files npm always packs regardless of `files`; not an omission when unlisted. */
const ALWAYS_SHIPPED = new Set(['package.json', 'README.md', 'LICENSE', 'NOTICE', 'CHANGELOG.md'])

/**
 * Repository-only trees: the test suites, history, examples and automation. A `files`
 * entry must never cover these, even when a path is currently empty or already gone.
 */
const FORBIDDEN_TREES = [
  ['tests/**', 'tests/unit/dsh_helpers.js'],
  ['test/**', 'test/README.md'],
  ['examples/**', 'examples/README.md'],
  ['docs/testing/**', 'docs/testing/RESULTS-464DB.md'],
  ['diagrams/**', 'diagrams/workflow.svg'],
  ['scripts/**', 'scripts/README.md'],
  ['.github/**', '.github/workflows/ci.yml'],
  ['.dev/**', '.dev/docs/concepts_brief.md'],
]

/** Specific repository-only host tools and diagram sources that must stay unpacked. */
const FORBIDDEN_FILES = [
  'adapters/dsh/check_upstream.mjs',
  'adapters/dsh/render_diagrams.mjs',
  'docs/assets/README.md',
  'docs/assets/workflow.d2',
  'docs/assets/protocol.d2',
]

/** Diagram maps never ship, and no `*.EGM.md` map may be packed. */
const FORBIDDEN_PATTERN_PROBES = ['docs/assets/workflow.EGM.md', 'implementation.EGM.md', 'EGM.md']

/** Return an exports target for one subpath key, accepting string and conditional forms. */
function exportTarget(exportsField, key) {
  if (typeof exportsField === 'string') return key === '.' ? exportsField : undefined
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) return undefined
  const value = exportsField[key]
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const condition of ['import', 'default', 'node']) {
      if (typeof value[condition] === 'string') return value[condition]
    }
  }
  return undefined
}

/** Strip the leading `./` Node package exports spelling does not require. */
function normaliseTarget(target) {
  return String(target).replace(/^\.\//u, '')
}

function isCovered(relativePath, entries) {
  return entries.some((entry) => filesEntryMatches(relativePath, entry))
}

test('package.json exists and parses as a JSON object', () => {
  const manifest = readPackageJson()
  assert.equal(typeof manifest, 'object', 'package.json must contain a JSON object')
  assert.notEqual(manifest, null, 'package.json must contain a JSON object')
})

test('manifest identity fields describe the dsh-egm bundle', () => {
  const manifest = readPackageJson()
  const problems = []
  if (manifest.name !== 'dsh-egm') problems.push(`name must be "dsh-egm"; found ${JSON.stringify(manifest.name)}`)
  if (typeof manifest.version !== 'string') {
    problems.push('version must be a SemVer string')
  } else {
    try {
      parseVersion(manifest.version)
    } catch (error) {
      problems.push(error.message)
    }
  }
  if (typeof manifest.description !== 'string' || manifest.description.trim() === '') {
    problems.push('description must be a non-empty string (it is the plugin manager fallback text)')
  }
  if (manifest.type !== 'module') problems.push(`type must be "module" for the ES module entry point; found ${JSON.stringify(manifest.type)}`)
  if (manifest.main !== 'adapters/dsh/skills-host.js') {
    problems.push(`main must be "adapters/dsh/skills-host.js"; found ${JSON.stringify(manifest.main)}`)
  }
  if (typeof manifest.main === 'string' && !isFile(packagePath(manifest.main))) {
    problems.push(`main entry ${JSON.stringify(manifest.main)} does not exist`)
  }
  if (typeof manifest.license !== 'string' || manifest.license.trim() === '') problems.push('license must be declared')
  if (typeof manifest.repository?.url !== 'string' || !manifest.repository.url.includes('github.com/dryw/dsh-egm')) {
    problems.push('repository.url must point at the public repo (https://github.com/dryw/dsh-egm)')
  }
  if (typeof manifest.homepage !== 'string' || manifest.homepage.trim() === '') problems.push('homepage must be set for the public package page')
  assert.equal(problems.length, 0, `manifest identity problems:${formatList(problems)}`)
})

test('manifest exports expose every runtime resource DSH resolves through Node', () => {
  const manifest = readPackageJson()
  const exportsField = manifest.exports
  const problems = []
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    problems.push('exports must be an object mapping package subpaths; DSH resolves locale and icon through it')
  } else {
    const rootTarget = exportTarget(exportsField, '.')
    if (rootTarget === undefined) {
      problems.push('exports["."] is missing; the bundle plugin row resolves the package main through it')
    } else {
      const normalised = normaliseTarget(rootTarget)
      if (normalised !== normaliseTarget(manifest.main ?? 'adapters/dsh/skills-host.js')) {
        problems.push(`exports["."] (${JSON.stringify(rootTarget)}) must resolve to main (${JSON.stringify(manifest.main)})`)
      }
      if (!isFile(packagePath(normalised))) problems.push(`exports["."] target ${JSON.stringify(normalised)} does not exist`)
    }
    if (exportTarget(exportsField, './package.json') === undefined) {
      problems.push('exports["./package.json"] is missing; DSH reads name/description fallback text and the icon field from it')
    }
    const localeKey = Object.keys(exportsField).find((key) => key === './locale/*.json' || key.startsWith('./locale/'))
    if (localeKey === undefined) {
      problems.push('exports["./locale/*.json"] is missing; DSH resolves locale/<language>.json through this pattern')
    } else {
      const localeTarget = exportTarget(exportsField, localeKey)
      if (localeTarget === undefined) {
        problems.push(`exports[${JSON.stringify(localeKey)}] has no string target`)
      } else {
        for (const language of ['en', 'zh']) {
          const resolved = normaliseTarget(localeTarget).replace('*', language)
          if (!isFile(packagePath(resolved))) {
            problems.push(`exports[${JSON.stringify(localeKey)}] does not resolve adapters/dsh/locale/${language}.json (looked for ${JSON.stringify(resolved)})`)
          }
        }
      }
    }
    const iconExport = exportTarget(exportsField, './icon')
    const manifestIcon = typeof manifest.icon === 'string' && manifest.icon.trim() !== '' ? manifest.icon : undefined
    if (iconExport === undefined && manifestIcon === undefined) {
      problems.push('neither exports["./icon"] nor package.json "icon" is set; DSH cannot show the plugin icon')
    }
    if (iconExport !== undefined && !isFile(packagePath(normaliseTarget(iconExport)))) {
      problems.push(`exports["./icon"] target ${JSON.stringify(iconExport)} does not exist`)
    }
    if (manifestIcon !== undefined) {
      const iconPath = resolve(PACKAGE_ROOT, manifestIcon)
      const inside = iconPath === PACKAGE_ROOT || iconPath.startsWith(`${PACKAGE_ROOT}${sep}`)
      if (isAbsolute(manifestIcon) || /^[A-Za-z]:[\\/]/u.test(manifestIcon) || !inside) {
        problems.push('package.json "icon" must be a relative path inside the package directory')
      } else if (!isFile(iconPath)) {
        problems.push(`package.json "icon" points at missing file ${JSON.stringify(manifestIcon)}`)
      }
    }
    // Every public subpath key is preserved; only the targets move under adapters/dsh/.
    const expectedTargets = {
      './skills-host': 'adapters/dsh/skills-host.js',
      './reviewer-host': 'adapters/dsh/reviewer-host.js',
      './reviewer-tools': 'adapters/dsh/reviewer-tools.js',
      './locale/*.json': 'adapters/dsh/locale/*.json',
      './icon': 'adapters/dsh/icon.svg',
      './package.json': 'package.json',
    }
    const expectedKeys = ['.', ...Object.keys(expectedTargets)].sort()
    const actualKeys = Object.keys(exportsField).sort()
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
      problems.push(`exports keys must stay [${expectedKeys.join(', ')}]; found [${actualKeys.join(', ')}]`)
    }
    for (const [key, target] of Object.entries(expectedTargets)) {
      const actual = exportTarget(exportsField, key)
      if (actual === undefined) {
        problems.push(`exports[${JSON.stringify(key)}] is missing; every public subpath key must be preserved`)
      } else if (normaliseTarget(actual) !== target) {
        problems.push(`exports[${JSON.stringify(key)}] must target ${JSON.stringify(target)}; found ${JSON.stringify(actual)}`)
      }
    }
  }
  assert.equal(problems.length, 0, `exports problems:${formatList(problems)}`)
})

test('dsh.bundle.patch declares a patch that inserts this package by name', () => {
  const manifest = readPackageJson()
  const bundle = manifest.dsh?.bundle
  const problems = []
  if (bundle === undefined || bundle === null || typeof bundle !== 'object') {
    problems.push('package.json is missing dsh.bundle; dsh plugin would install it only as a plain dependency and activate no layer')
  } else {
    const declared = bundle.patch
    const patchFiles = typeof declared === 'string' ? [declared] : Array.isArray(declared) ? declared : undefined
    if (patchFiles === undefined || patchFiles.length === 0 || patchFiles.some((file) => typeof file !== 'string')) {
      problems.push('dsh.bundle.patch must be a file path or a list of file paths')
    } else {
      const expectedPatch = 'adapters/dsh/cordis.patch.yml'
      if (patchFiles.length !== 1 || normaliseTarget(patchFiles[0]) !== expectedPatch) {
        problems.push(`dsh.bundle.patch must be ${JSON.stringify(`./${expectedPatch}`)}; found ${JSON.stringify(declared)}`)
      }
      for (const declaredPath of patchFiles) {
        const absolute = packagePath(normaliseTarget(declaredPath))
        if (!isFile(absolute)) {
          problems.push(`dsh.bundle.patch file ${JSON.stringify(declaredPath)} does not exist`)
          continue
        }
        const text = readTextFile(absolute)
        if (!/^-\s*insert:/mu.test(text)) problems.push(`${relativeToPackage(absolute)}: expected an "- insert:" row`)
        const names = [...text.matchAll(/^\s*name:\s*['"]?([^'"\s]+)['"]?\s*$/gmu)].map((match) => match[1])
        if (!names.some((name) => name === manifest.name || name.startsWith(`${manifest.name}/`))) {
          problems.push(
            `${relativeToPackage(absolute)}: insert rows reference [${names.join(', ')}]; the patch must insert ` +
              JSON.stringify(manifest.name),
          )
        }
      }
    }
  }
  assert.equal(problems.length, 0, `dsh.bundle problems:${formatList(problems)}`)
})

test(`engines.dsh admits the running DSH ${DSH_RUNTIME_VERSION} and is bounded`, () => {
  const manifest = readPackageJson()
  const engines = manifest.engines
  const problems = []
  if (engines === null || typeof engines !== 'object') {
    problems.push('engines is missing; without engines.dsh DSH falls back to @deepseek-ai/dsh* peer ranges')
  } else {
    const range = engines.dsh
    if (typeof range !== 'string' || range.trim() === '') {
      problems.push('engines.dsh must be a non-empty SemVer range')
    } else {
      if (!semverSatisfies(DSH_RUNTIME_VERSION, range)) {
        problems.push(`engines.dsh ${JSON.stringify(range)} does not admit the running DSH ${DSH_RUNTIME_VERSION} (install and profile startup would refuse the bundle)`)
      }
      if (!/[<^~]/u.test(range)) problems.push('engines.dsh must be bounded; an open range would load this bundle into an untested DSH 0.x')
      if (semverSatisfies('0.3.0', range)) problems.push(`engines.dsh ${JSON.stringify(range)} would also admit DSH 0.3.0, a runtime it was not tested against`)
    }
    if (engines.node !== undefined && (typeof engines.node !== 'string' || !semverSatisfies(process.versions.node, engines.node))) {
      problems.push(`engines.node ${JSON.stringify(engines.node)} does not admit the running Node ${process.versions.node}`)
    }
  }
  assert.equal(problems.length, 0, `engines problems:${formatList(problems)}`)
})

test('files lists the shipped content and every entry exists', () => {
  const manifest = readPackageJson()
  const files = manifest.files
  const problems = []
  if (!Array.isArray(files) || files.length === 0) {
    problems.push('files must be a non-empty array; without it npm packs the whole repo (tests included)')
  } else {
    const seen = new Set()
    for (const entry of files) {
      if (typeof entry !== 'string' || entry.trim() === '') {
        problems.push(`files entries must be non-empty strings; found ${JSON.stringify(entry)}`)
        continue
      }
      const normalised = normaliseTarget(entry)
      if (seen.has(normalised)) problems.push(`duplicate files entry ${JSON.stringify(entry)}`)
      seen.add(normalised)
      if (/[*?]/u.test(normalised)) continue
      if (!existsSync(packagePath(normalised))) problems.push(`files entry ${JSON.stringify(entry)} does not exist`)
    }
  }
  assert.equal(problems.length, 0, `files problems:${formatList(problems)}`)
})

test('files packs every required runtime, guide and provenance file', () => {
  const manifest = readPackageJson()
  const files = Array.isArray(manifest.files) ? manifest.files : []
  assert.equal(
    LOCKED_ADAPTED_FILES.length,
    26,
    `upstream.lock.json must pin the 26 adapted files; found ${LOCKED_ADAPTED_FILES.length}`,
  )
  const uncovered = REQUIRED_FILES.filter((required) => !isCovered(required, files))
  assert.equal(
    uncovered.length,
    0,
    `required files missing from "files" (npm pack would omit them; add a files entry or restore the file):${formatList(uncovered)}`,
  )
})

test('files never packs repository-only development, history or internal files', () => {
  const manifest = readPackageJson()
  const files = Array.isArray(manifest.files) ? manifest.files : []
  const problems = []
  for (const [tree, probe] of FORBIDDEN_TREES) {
    if (isCovered(probe, files)) problems.push(`${tree} must never be packed; a files entry covers ${JSON.stringify(probe)}`)
  }
  for (const repositoryOnly of [...FORBIDDEN_FILES, ...FORBIDDEN_PATTERN_PROBES]) {
    if (isCovered(repositoryOnly, files)) problems.push(`${JSON.stringify(repositoryOnly)} is repository-only; a files entry covers it`)
  }
  // Inversion: every repository file that is neither required nor always shipped must stay unpacked.
  const required = new Set(REQUIRED_FILES)
  const packed = []
  for (const absolute of walkFiles(PACKAGE_ROOT)) {
    const relativePath = relativeToPackage(absolute)
    if (required.has(relativePath) || ALWAYS_SHIPPED.has(relativePath)) continue
    if (isCovered(relativePath, files)) packed.push(relativePath)
  }
  if (packed.length > 0) {
    problems.push(`repository-only files covered by "files" (remove the entry):${formatList(packed.sort())}`)
  }
  assert.equal(problems.length, 0, `packed-file problems:${formatList(problems)}`)
})

test('plain JavaScript ships directly and needs no install-time build', () => {
  const manifest = readPackageJson()
  const scripts = manifest.scripts
  const problems = []
  if (typeof scripts?.prepare === 'string') {
    problems.push(
      'scripts.prepare is set, but this bundle ships plain ES modules: the publish guide asks for prepare only when a git ' +
        'install must build entry points, and a prepare script would force users to allowlist install-time code',
    )
  }
  if (typeof manifest.main === 'string' && !manifest.main.endsWith('.js')) {
    problems.push(`main must be a shipped JavaScript file; found ${JSON.stringify(manifest.main)}`)
  }
  if (typeof manifest.main === 'string' && isFile(packagePath(manifest.main))) {
    const source = readTextFile(packagePath(manifest.main))
    const externalImports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/gu)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.startsWith('node:') && !specifier.startsWith('.'))
    const sideEffectImports = [...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.startsWith('node:') && !specifier.startsWith('.'))
    for (const specifier of [...externalImports, ...sideEffectImports]) {
      problems.push(`main imports ${JSON.stringify(specifier)}; a git install has no node_modules, so only node: builtins are safe without declaring dependencies`)
    }
  }
  assert.equal(problems.length, 0, `build/dependency problems:${formatList(problems)}`)
})
