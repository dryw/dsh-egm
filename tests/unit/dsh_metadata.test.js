/**
 * Plugin-manager metadata checks: locale dictionaries and the icon are what the
 * DSH plugin manager shows for an installed bundle. DSH reads
 * `adapters/dsh/locale/en.json` through the package `exports` map and validates
 * the icon bytes itself.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  LOCALE_DIR,
  PACKAGE_ROOT,
  formatList,
  isDirectory,
  isFile,
  readJsonFile,
  readPackageJson,
  readTextFile,
} from './dsh_helpers.js'

const REQUIRED_LOCALES = ['en', 'zh']
const LANGUAGE_ID = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u
const ICON_MAX_BYTES = 256 * 1024
const ICON_EXTENSIONS = new Set(['.svg', '.png', '.jpg', '.jpeg', '.webp'])

const iconPath = join(PACKAGE_ROOT, 'adapters', 'dsh', 'icon.svg')

/** Resolve one exports subpath target the way Node does for a string/conditional export. */
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

test('locale dictionaries declare meta.title and meta.description', () => {
  const problems = []
  const languageFiles = isDirectory(LOCALE_DIR) ? readdirSync(LOCALE_DIR).filter((name) => name.endsWith('.json')).sort() : []
  for (const language of REQUIRED_LOCALES) {
    if (!languageFiles.includes(`${language}.json`)) problems.push(`adapters/dsh/locale/${language}.json is missing`)
  }
  for (const file of languageFiles) {
    let dictionary
    try {
      dictionary = readJsonFile(join(LOCALE_DIR, file))
    } catch (error) {
      problems.push(error.message)
      continue
    }
    const meta = dictionary?.meta
    if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
      problems.push(`adapters/dsh/locale/${file}: "meta" must be an object`)
      continue
    }
    for (const field of ['title', 'description']) {
      if (typeof meta[field] !== 'string' || meta[field].trim() === '') {
        problems.push(`adapters/dsh/locale/${file}: meta.${field} must be a non-empty string (DSH shows it in the plugin manager)`)
      }
    }
  }
  assert.equal(problems.length, 0, `locale metadata problems:${formatList(problems)}`)
})

test('locale filenames are valid language ids', () => {
  if (!isDirectory(LOCALE_DIR)) {
    assert.fail('adapters/dsh/locale/ directory is missing; the plugin manager falls back to package.json text with no translation')
  }
  const problems = []
  for (const file of readdirSync(LOCALE_DIR)) {
    if (!file.endsWith('.json')) continue
    const language = file.slice(0, -5)
    if (!LANGUAGE_ID.test(language)) problems.push(`adapters/dsh/locale/${file}: ${JSON.stringify(language)} is not a language id`)
  }
  assert.equal(problems.length, 0, `locale filename problems:${formatList(problems)}`)
})

test('icon.svg is a valid SVG and within the DSH icon limits', () => {
  const problems = []
  if (!isFile(iconPath)) {
    assert.fail('adapters/dsh/icon.svg is missing; the plugin manager cannot render the bundle icon')
  }
  const size = statSync(iconPath).size
  if (size > ICON_MAX_BYTES) problems.push(`adapters/dsh/icon.svg is ${size} bytes; DSH refuses icons over ${ICON_MAX_BYTES} bytes`)
  const text = readTextFile(iconPath).replace(/^\uFEFF/u, '').trim()
  const afterProlog = text
    .replace(/^<\?xml[^?]*\?>\s*/u, '')
    .replace(/^(?:<!--[\s\S]*?-->\s*)+/u, '')
    .replace(/^<!DOCTYPE[^>]*>\s*/u, '')
  if (!/^<svg[\s>]/u.test(afterProlog)) problems.push('icon.svg must have an <svg> root element')
  if (!/<\/svg>\s*$/u.test(text)) problems.push('icon.svg must close with </svg>')
  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/u.test(text)) {
    problems.push('icon.svg must declare xmlns="http://www.w3.org/2000/svg"')
  }
  if (/<script[\s>]/iu.test(text)) problems.push('icon.svg must not embed <script>')
  if (/\b(?:href|src)\s*=\s*["']https?:/iu.test(text)) problems.push('icon.svg must not reference external resources')
  assert.equal(problems.length, 0, `icon problems:${formatList(problems)}`)
})

test('manifest exposes the locale dictionaries and icon to the plugin manager', () => {
  const manifest = readPackageJson()
  const exportsField = manifest.exports
  const problems = []
  if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
    assert.fail('package.json "exports" must be an object; DSH resolves locale/<language>.json and the icon through it')
  }
  const localeKey = Object.keys(exportsField).find((key) => key === './locale/*.json' || key.startsWith('./locale/'))
  if (localeKey === undefined) {
    problems.push('exports "./locale/*.json" is missing; DSH cannot read locale/en.json through the package exports map')
  } else {
    const target = exportTarget(exportsField, localeKey)
    if (target === undefined) {
      problems.push(`exports[${JSON.stringify(localeKey)}] has no string target`)
    } else {
      for (const language of REQUIRED_LOCALES) {
        const resolved = String(target).replace(/^\.\//u, '').replace('*', language)
        if (!isFile(join(PACKAGE_ROOT, resolved))) problems.push(`exports[${JSON.stringify(localeKey)}] does not resolve adapters/dsh/locale/${language}.json`)
      }
    }
  }
  if (exportTarget(exportsField, './package.json') === undefined) {
    problems.push('exports "./package.json" is missing; DSH reads the name/description fallback from the manifest')
  }
  const iconExport = exportTarget(exportsField, './icon')
  const manifestIcon = typeof manifest.icon === 'string' && manifest.icon.trim() !== '' ? manifest.icon : undefined
  if (iconExport === undefined && manifestIcon === undefined) {
    problems.push('neither exports "./icon" nor package.json "icon" identifies the bundle icon')
  }
  if (iconExport !== undefined) {
    const resolved = resolve(PACKAGE_ROOT, String(iconExport).replace(/^\.\//u, ''))
    if (!isFile(resolved)) {
      problems.push(`exports "./icon" target ${JSON.stringify(iconExport)} does not exist`)
    } else {
      const extension = resolved.slice(resolved.lastIndexOf('.')).toLowerCase()
      if (!ICON_EXTENSIONS.has(extension)) problems.push(`icon must be SVG, PNG, JPEG or WebP; found ${JSON.stringify(extension)}`)
      if (statSync(resolved).size > ICON_MAX_BYTES) problems.push('icon export exceeds the DSH 256 KiB limit')
    }
  }
  if (manifestIcon !== undefined) {
    if (/^[A-Za-z]:[\\/]/u.test(manifestIcon) || manifestIcon.startsWith('/') || manifestIcon.startsWith('..')) {
      problems.push('package.json "icon" must be a relative path inside the package directory')
    } else {
      const resolved = resolve(PACKAGE_ROOT, manifestIcon)
      if (!resolved.startsWith(`${PACKAGE_ROOT}${process.platform === 'win32' ? '\\' : '/'}`) && resolved !== PACKAGE_ROOT) {
        problems.push('package.json "icon" must stay inside the package directory')
      } else if (!isFile(resolved)) {
        problems.push(`package.json "icon" points at missing ${JSON.stringify(manifestIcon)}`)
      }
    }
  }
  assert.equal(problems.length, 0, `plugin metadata wiring problems:${formatList(problems)}`)
})
