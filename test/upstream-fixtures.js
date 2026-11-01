/**
 * Loaders and helpers for the vendored upstream EGM fixtures.
 *
 * The upstream `test_scenarios.yaml` suites are behavioural evaluation data: they
 * describe user turns and assertions about the model's *response*. We do not run
 * a model here. Instead `test/upstream-parity.test.js` treats each assertion
 * pattern as a content signal: if the upstream skill text satisfies the pattern,
 * the adapted DeepSeek Harness skill text must still satisfy it too.
 *
 * This file needs a tiny YAML reader because the test suite is zero-dependency.
 * It only supports the subset the vendored suites use: indentation-nested maps
 * and lists, double-quoted (YAML-escaped) and single-quoted scalars, and YAML
 * anchors/aliases (the `egm-draft` suite reuses two assertion blocks). It throws
 * on anything outside that subset so a future upstream format change cannot be
 * silently misread.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Decode the body of a YAML double-quoted scalar.
 * @param {string} text raw scalar body (without the surrounding quotes).
 * @returns {string}
 */
export function decodeYamlDoubleQuoted(text) {
  const simple = {
    0: '\0',
    a: '\x07',
    b: '\b',
    t: '\t',
    n: '\n',
    v: '\v',
    f: '\f',
    r: '\r',
    e: '\x1b',
    ' ': ' ',
    '"': '"',
    '/': '/',
    '\\': '\\',
    N: '\u0085',
    _: '\u00a0',
    L: '\u2028',
    P: '\u2029',
  }
  return text.replace(/\\(u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8}|x[0-9a-fA-F]{2}|.)/gsu, (_match, escape) => {
    const kind = escape[0]
    if (kind === 'u' || kind === 'U' || kind === 'x') return String.fromCodePoint(Number.parseInt(escape.slice(1), 16))
    if (Object.hasOwn(simple, escape)) return simple[escape]
    throw new Error(`unsupported YAML escape \\${escape} in ${JSON.stringify(text)}`)
  })
}

/**
 * Decode one YAML scalar into a string (the scenario data the tests need is all text).
 * @param {string} text raw scalar text.
 * @returns {string}
 */
export function parseYamlScalar(text) {
  const value = text.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return decodeYamlDoubleQuoted(value.slice(1, -1))
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'")
  if (value.startsWith('"') || value.startsWith("'")) throw new Error(`unterminated YAML quoted scalar: ${value}`)
  if (value.startsWith('*')) throw new Error(`unresolved YAML alias ${value}`)
  return value
}

/** Split one `key: value` line; throws when the line is not a map entry. */
function splitKeyValue(text, lineNumber) {
  const match = /^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?$/su.exec(text)
  if (match === null) throw new Error(`unsupported YAML line ${lineNumber}: ${JSON.stringify(text)}`)
  return { key: match[1], rest: match[2] ?? '' }
}

/** Deep-copy an anchored YAML value so aliased assertions cannot share mutable state. */
function cloneAnchored(anchors, name, lineNumber) {
  if (!anchors.has(name)) throw new Error(`undefined YAML alias *${name} at line ${lineNumber}`)
  return structuredClone(anchors.get(name))
}

function tokenize(source) {
  const tokens = []
  const lines = source.split(/\r?\n/u)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const indentation = line.slice(0, line.length - line.trimStart().length)
    if (/\t/u.test(indentation)) throw new Error(`tab indentation is not supported (line ${index + 1})`)
    tokens.push({ indent: indentation.length, text: line.trim(), lineNumber: index + 1 })
  }
  return tokens
}

function parseBlock(tokens, start, indent, anchors) {
  const first = tokens[start]
  if (first === undefined) return { value: null, next: start }
  if (first.text.startsWith('- ') || first.text === '-') return parseList(tokens, start, indent, anchors)
  return parseMap(tokens, start, indent, anchors)
}

function parseMap(tokens, start, indent, anchors) {
  const value = {}
  let index = start
  while (index < tokens.length && tokens[index].indent === indent && !tokens[index].text.startsWith('- ')) {
    const token = tokens[index]
    const { key, rest } = splitKeyValue(token.text, token.lineNumber)
    index += 1
    if (rest === '') {
      const next = tokens[index]
      if (next !== undefined && next.indent > indent) {
        const nested = parseBlock(tokens, index, next.indent, anchors)
        value[key] = nested.value
        index = nested.next
      } else {
        value[key] = null
      }
    } else if (/^&[^\s]+$/u.test(rest)) {
      // `key: &anchor` with the anchored block on the following lines.
      const anchorName = rest.slice(1)
      const next = tokens[index]
      if (next === undefined || next.indent <= indent) throw new Error(`YAML anchor &${anchorName} has no value at line ${token.lineNumber}`)
      const nested = parseBlock(tokens, index, next.indent, anchors)
      value[key] = nested.value
      anchors.set(anchorName, nested.value)
      index = nested.next
    } else if (rest.startsWith('*')) {
      value[key] = cloneAnchored(anchors, rest.slice(1).trim(), token.lineNumber)
    } else {
      value[key] = parseYamlScalar(rest)
    }
  }
  return { value, next: index }
}

function parseList(tokens, start, indent, anchors) {
  const value = []
  let index = start
  while (index < tokens.length && tokens[index].indent === indent && (tokens[index].text.startsWith('- ') || tokens[index].text === '-')) {
    const token = tokens[index]
    const content = token.text === '-' ? '' : token.text.slice(2).trim()
    if (content === '') {
      index += 1
      const next = tokens[index]
      if (next === undefined || next.indent <= indent) {
        value.push(null)
      } else {
        const nested = parseBlock(tokens, index, next.indent, anchors)
        value.push(nested.value)
        index = nested.next
      }
      continue
    }
    const anchorOnly = /^&([^\s]+)$/u.exec(content)
    if (anchorOnly !== null) {
      // `- &anchor` followed by the anchored block on the following lines.
      index += 1
      const next = tokens[index]
      if (next === undefined || next.indent <= indent) throw new Error(`YAML anchor &${anchorOnly[1]} has no value at line ${token.lineNumber}`)
      const nested = parseBlock(tokens, index, next.indent, anchors)
      anchors.set(anchorOnly[1], nested.value)
      value.push(nested.value)
      index = nested.next
      continue
    }
    const aliasOnly = /^\*([^\s]+)$/u.exec(content)
    if (aliasOnly !== null) {
      value.push(cloneAnchored(anchors, aliasOnly[1], token.lineNumber))
      index += 1
      continue
    }
    if (!/^[A-Za-z0-9_-]+:/u.test(content)) {
      value.push(parseYamlScalar(content))
      index += 1
      continue
    }
    // A list item that starts a map ("- key: value"): the first key rides the dash,
    // following keys are indented deeper than the dash.
    const item = {}
    const first = splitKeyValue(content, token.lineNumber)
    index += 1
    if (first.rest === '') {
      const next = tokens[index]
      if (next !== undefined && next.indent > indent) {
        const nested = parseBlock(tokens, index, next.indent, anchors)
        item[first.key] = nested.value
        index = nested.next
      } else {
        item[first.key] = null
      }
    } else {
      item[first.key] = parseYamlScalar(first.rest)
    }
    while (index < tokens.length && tokens[index].indent > indent) {
      if (tokens[index].text.startsWith('- ')) {
        throw new Error(`unexpected list item at line ${tokens[index].lineNumber} while reading a map item`)
      }
      const nested = parseMap(tokens, index, tokens[index].indent, anchors)
      Object.assign(item, nested.value)
      index = nested.next
    }
    value.push(item)
  }
  return { value, next: index }
}

/**
 * Parse a vendored `test_scenarios.yaml` document.
 * @param {string} source YAML text.
 * @returns {{ skill: string, description: string, scenarios: object[] }}
 */
export function parseScenarioYaml(source) {
  const tokens = tokenize(source)
  if (tokens.length === 0) throw new Error('empty scenario document')
  const anchors = new Map()
  const parsed = parseBlock(tokens, 0, tokens[0].indent, anchors)
  if (parsed.next !== tokens.length) throw new Error(`unparsed YAML content at line ${tokens[parsed.next].lineNumber}`)
  const document = parsed.value
  if (typeof document?.skill !== 'string' || document.skill === '') throw new Error('scenario document has no "skill"')
  if (!Array.isArray(document.scenarios) || document.scenarios.length === 0) throw new Error('scenario document has no "scenarios"')
  return document
}

/**
 * Flatten a scenario document to its assertions.
 * @param {{ skill: string, scenarios: object[] }} document
 * @returns {Array<{ skill: string, scenarioId: string, turnIndex: number, type: string, pattern: string, message: string }>}
 */
export function collectScenarioAssertions(document) {
  const assertions = []
  for (const scenario of document.scenarios) {
    const turns = Array.isArray(scenario.turns) ? scenario.turns : []
    for (const [turnIndex, turn] of turns.entries()) {
      const turnAssertions = Array.isArray(turn.assertions) ? turn.assertions : []
      for (const assertion of turnAssertions) {
        assertions.push({
          skill: document.skill,
          scenarioId: typeof scenario.scenario_id === 'string' ? scenario.scenario_id : `scenario-${assertions.length}`,
          turnIndex,
          type: String(assertion?.type ?? ''),
          pattern: String(assertion?.pattern ?? ''),
          message: String(assertion?.message ?? ''),
        })
      }
    }
  }
  return assertions
}

/**
 * Compile an upstream assertion pattern into a JavaScript RegExp.
 *
 * Some upstream patterns use Python-style inline flags (`(?i)`), which JavaScript
 * cannot express inside a pattern; those are translated by hoisting the flag to a
 * JS flag when it is at the start. Anything else that is not valid JavaScript is
 * returned as `undefined` so the caller can count and skip it.
 * @param {string} pattern
 * @returns {{ regex: RegExp, translatedFlags: string } | undefined}
 */
export function compileScenarioPattern(pattern) {
  try {
    return { regex: new RegExp(pattern), translatedFlags: '' }
  } catch {
    // fall through to the inline-flag translation
  }
  const inline = /^\(\?([ims]+)\)/u.exec(pattern)
  if (inline === null) return undefined
  const flags = inline[1].replace(/[ms]/gu, '') // only i changes which text matches for these patterns
  try {
    return { regex: new RegExp(pattern.slice(inline[0].length), flags), translatedFlags: 'inline-flag' }
  } catch {
    return undefined
  }
}

/** Read every `test/fixtures/upstream-scenarios/<skill>.yaml` fixture. */
export function loadScenarioFixtures(fixturesDirectory) {
  const documents = []
  for (const file of readdirSync(fixturesDirectory).filter((name) => name.endsWith('.yaml')).sort()) {
    const source = readFileSync(join(fixturesDirectory, file), 'utf8')
    documents.push({ file, source, document: parseScenarioYaml(source) })
  }
  return documents
}

/** Assertion types that require a pattern to be present in skill text. */
export const REQUIRED_TYPES = new Set(['required_pattern', 'contains'])
/** Assertion types that require a pattern to be absent from skill text. */
export const FORBIDDEN_TYPES = new Set(['forbidden_pattern', 'not_contains'])

/**
 * Evaluate one upstream skill text against its adapted DeepSeek Harness skill text.
 *
 * This is the whole content-parity rule, kept separate so the test can be trusted:
 * a required/contains pattern only becomes an invariant when the upstream skill text
 * satisfies it, and a forbidden/not_contains pattern only becomes an invariant when
 * the upstream skill text avoids it. Every other assertion is reported as skipped
 * (with its reason) instead of being silently ignored.
 *
 * @param {object} input
 * @param {string} input.upstreamText upstream skill file content.
 * @param {string} input.adaptedText adapted skill file content.
 * @param {Array<object>} input.assertions flattened scenario assertions.
 * @param {string} [input.skill] adapted skill name, for failure records.
 * @param {string} [input.adaptedFile] adapted file path, for failure records.
 * @returns {{
 *   failures: Array<object>,
 *   checked: number,
 *   totalAssertions: number,
 *   skippedInvalidPatterns: Array<object>,
 *   skippedUpstreamUnsatisfied: Array<object>,
 *   translatedPatterns: Array<object>,
 * }}
 */
export function evaluateContentParity({ upstreamText, adaptedText, assertions, skill, adaptedFile }) {
  const outcome = {
    failures: [],
    checked: 0,
    totalAssertions: assertions.length,
    skippedInvalidPatterns: [],
    skippedUpstreamUnsatisfied: [],
    translatedPatterns: [],
  }
  for (const assertion of assertions) {
    const compiled = compileScenarioPattern(assertion.pattern)
    if (compiled === undefined) {
      outcome.skippedInvalidPatterns.push(assertion)
      continue
    }
    if (compiled.translatedFlags !== '') outcome.translatedPatterns.push(assertion)
    const upstreamMatches = compiled.regex.test(upstreamText)
    const adaptedMatches = compiled.regex.test(adaptedText)
    const record = { ...assertion, skill, adaptedFile }
    if (REQUIRED_TYPES.has(assertion.type)) {
      if (!upstreamMatches) {
        outcome.skippedUpstreamUnsatisfied.push({
          ...assertion,
          reason: 'required/contains pattern is absent from the upstream skill text',
        })
        continue
      }
      outcome.checked += 1
      if (!adaptedMatches) {
        outcome.failures.push({
          ...record,
          reason: 'upstream skill text satisfies this pattern; the adapted skill text does not',
        })
      }
    } else if (FORBIDDEN_TYPES.has(assertion.type)) {
      if (upstreamMatches) {
        outcome.skippedUpstreamUnsatisfied.push({
          ...assertion,
          reason: 'forbidden/not_contains pattern is present in the upstream skill text itself',
        })
        continue
      }
      outcome.checked += 1
      if (adaptedMatches) {
        outcome.failures.push({
          ...record,
          reason: 'upstream skill text avoids this pattern; the adapted skill text contains it',
        })
      }
    } else {
      outcome.failures.push({
        ...record,
        reason: `unsupported assertion type ${JSON.stringify(assertion.type)}; update the parity rules`,
      })
    }
  }
  return outcome
}
