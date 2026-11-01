/**
 * Resource checks: every `resources/...` path a skill body or reviewer file
 * mentions must resolve to a real file or directory in the package, against the
 * package root (the skill resource base), never relative to the skill directory.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SHARED_RESOURCE_PATHS,
  formatList,
  isDirectory,
  isFile,
  listContentMarkdownFiles,
  packagePath,
  readTextFile,
  relativeToPackage,
  referencedResourcePaths,
} from './helpers.js'

const LOOKS_LIKE_FILE = /\.[A-Za-z0-9]+$/u

test('every shared resource path in the DESIGN.md contract exists', () => {
  const missing = SHARED_RESOURCE_PATHS.filter((reference) => !isFile(packagePath(reference)))
  assert.equal(
    missing.length,
    0,
    `shared resources the skill contract promises are missing (owners: phase-skills, review-skills, bootstrap-skills):${formatList(missing)}`,
  )
})

test('every resources/... reference in skill and reviewer Markdown resolves', () => {
  const problems = []
  for (const file of listContentMarkdownFiles()) {
    const label = relativeToPackage(file)
    for (const reference of referencedResourcePaths(readTextFile(file))) {
      const target = packagePath(reference.replace(/\/+$/u, ''))
      const expectsDirectory = reference.endsWith('/') || !LOOKS_LIKE_FILE.test(reference)
      if (expectsDirectory) {
        if (!isDirectory(target)) problems.push(`${label} -> ${JSON.stringify(reference)} (no such directory)`)
      } else if (!isFile(target)) {
        problems.push(`${label} -> ${JSON.stringify(reference)} (no such file)`)
      }
    }
  }
  assert.equal(problems.length, 0, `broken resources/... references (paths resolve against the package root):${formatList(problems)}`)
})

test('resource paths are package-root relative, not skill-relative or harness-specific', () => {
  const checks = [
    [/(?:^|[^\w])\.\.\/(?:\.\.\/)*resources\//gmu, 'skill-relative path (../resources/...): paths resolve against the package root'],
    [/resources\\[A-Za-z0-9_\\/-]/gu, 'Windows path separator in a resource reference; use forward slashes'],
    [/\$\{[A-Z0-9_]+\}\/[A-Za-z0-9_.\/-]*resources\//gu, 'harness placeholder in a resource path'],
    [/(?:^|[^A-Za-z0-9_.\/-])\/(?:[A-Za-z0-9_.-]+\/)*resources\//gmu, 'absolute resource path; paths must be package-relative'],
  ]
  const problems = []
  for (const file of listContentMarkdownFiles()) {
    const text = readTextFile(file)
    const lines = text.split(/\r?\n/u)
    for (const [pattern, reason] of checks) {
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index]
        pattern.lastIndex = 0
        if (!pattern.test(line)) continue
        problems.push(`${relativeToPackage(file)}:${index + 1}: ${reason} -> ${line.trim().slice(0, 140)}`)
      }
    }
  }
  assert.equal(problems.length, 0, `resource path form problems:${formatList(problems)}`)
})

test('all agent persona files from the vendored contract are Markdown documents', () => {
  const reviewerPaths = SHARED_RESOURCE_PATHS.filter((reference) => reference.startsWith('agents/'))
  const problems = []
  for (const reference of reviewerPaths) {
    const target = packagePath(reference)
    if (!isFile(target)) {
      problems.push(`${reference}: missing`)
      continue
    }
    const text = readTextFile(target)
    if (text.trim() === '') problems.push(`${reference}: empty reviewer persona`)
    if (!/^#\s+\S/mu.test(text)) problems.push(`${reference}: expected a Markdown heading describing the persona`)
  }
  assert.equal(problems.length, 0, `reviewer persona problems:${formatList(problems)}`)
})
