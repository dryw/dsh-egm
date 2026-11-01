/**
 * Host half of the dsh-egm bundle: the DeepSeek Harness integration layer.
 *
 * The seven skills, nine agent personas and the shared standards are vendored
 * VERBATIM from google/elephant-goldfish-model at the commit pinned in
 * upstream.lock.json, so no harness gets a fork of the skill text. This adapter
 * only injects a short `<dsh_integration>` preamble at registration time that maps
 * the upstream instructions to DeepSeek Harness mechanics: path roots, the
 * read-only reviewer tool, the question tool, and which harness-specific sections
 * of the upstream text to ignore.
 *
 * Every skill's resource base is the package root, so `resources/...` and
 * `agents/...` resolve there; the preamble also states each skill's own directory
 * for the skill-local `references/...` paths upstream uses.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-egm'

/** The plugin stays inactive when the Harness composes no skill registry. */
export const inject = ['skills']

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const SKILLS_DIR = join(ROOT, 'skills')
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const BLOCK_SCALAR = /^[>|][+-]?$/u

/**
 * Parse the YAML frontmatter block a vendored SKILL.md starts with.
 *
 * Supports the subset the upstream files use: single-line `key: value` pairs,
 * quoted values, and folded (`>`, `>-`) or literal (`|`, `|-`) block scalars.
 * A block-scalar description is folded into one line because the DSH catalog
 * renders descriptions as a single line.
 * @param {string} source raw SKILL.md text.
 * @returns {{ meta: Record<string, string>, body: string }} parsed metadata and Markdown body.
 */
export function parseSkillDocument(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(source)
  if (match === null) return { meta: {}, body: source.trim() }
  const lines = match[1].split(/\r?\n/u)
  const meta = {}
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const pair = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/u.exec(line)
    if (pair === null) throw new Error(`unsupported frontmatter line: ${JSON.stringify(line)}`)
    const key = pair[1]
    let value = pair[2].trim()
    if (BLOCK_SCALAR.test(value)) {
      const folded = value.startsWith('>')
      const block = []
      while (index + 1 < lines.length && (/^\s+/u.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
        index += 1
        block.push(lines[index])
      }
      const meaningful = block.map((entry) => entry.trim()).filter((entry) => entry !== '')
      value = folded ? meaningful.join(' ') : meaningful.join('\n')
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1)
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1)
    }
    meta[key] = value
  }
  return { meta, body: source.slice(match[0].length).trim() }
}

/** Read a boolean-like frontmatter value the same way the skill providers do. */
function parseBoolean(value) {
  const normalised = String(value).trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalised)) return true
  if (['false', 'no', 'off', '0'].includes(normalised)) return false
  throw new Error(`invalid boolean ${JSON.stringify(value)}`)
}

/**
 * Build the DeepSeek Harness integration preamble for one vendored skill.
 *
 * This is the only place harness mechanics are added. It is prepended to the
 * verbatim upstream body so the upstream text stays byte-identical on disk.
 * @param {string} skillName skill directory name.
 * @param {string} skillDirectory absolute directory containing SKILL.md.
 * @returns {string} preamble inserted before the upstream instructions.
 */
export function integrationPreamble(skillName, skillDirectory) {
  const lines = [
    '<dsh_integration>',
    'This is an upstream Elephant-Goldfish Model skill running on DeepSeek Harness. These harness notes override any incompatible instruction in the upstream text below.',
    `Package root: ${ROOT}`,
    `This skill's directory: ${skillDirectory}`,
    "Resolve the upstream plugin-root placeholder, `agents/...` and `resources/...` against the package root; resolve `references/...` against this skill's directory.",
    "Ignore instructions written for another agent harness and its integration documents (for example files under a docs/ folder that describe a different agent's tools or install steps); they do not apply on DeepSeek Harness.",
    'Some upstream instructions reference files under a docs/ folder that describe another agent harness; those files are intentionally not shipped in this package. Do not try to open them; the referenced instructions do not apply.',
    'Where the upstream text tells you to spawn a Goldfish reviewer, use `egm_reviewer({ description, prompt })`. It starts a fresh, read-only child (read/search tools only; no write, commands, user questions, session reads, or delegation). Never use `subagent` or `subagent_fork` for a reviewer.',
    'Every reviewer prompt must name Mode, ProjectRoot, TargetFile, LineRange or SemanticTarget, TargetStandard when one applies, and GoldfishContext, plus the persona body. Pass the persona body from `agents/<file>.md` without its YAML frontmatter or attribution line; see ADAPTER-NOTES.md.',
    'Interactive gates use `ask_user_question` with label/description option objects; never add a `(Recommended)` prefix.',
    'Write briefs, drafts and review reports to the project working directory, not into this package.',
    '</dsh_integration>',
  ]
  if (skillName === 'egm-bootstrap') {
    lines.splice(7, 0, 'Bootstrap partition workers must write contract files, so start them with the generic `subagent` tool; run the read-only explorer scout in this thread.')
  }
  return lines.join('\n')
}

/**
 * Load one vendored skill directory into a Harness skill registration.
 * @param {string} directoryName name of the directory under `skills/`.
 * @returns {object} arguments for `ctx.skills.register`.
 */
export function loadBundledSkill(directoryName) {
  const directory = join(SKILLS_DIR, directoryName)
  const skillPath = join(directory, 'SKILL.md')
  const { meta, body } = parseSkillDocument(readFileSync(skillPath, 'utf8'))

  const skillName = meta.name
  if (skillName === undefined || !SKILL_NAME.test(skillName)) {
    throw new Error(`${skillPath}: missing or invalid kebab-case "name"`)
  }
  if (skillName !== directoryName) {
    throw new Error(`${skillPath}: name "${skillName}" does not match its directory "${directoryName}"`)
  }
  const description = meta.description
  if (description === undefined || description.trim() === '') {
    throw new Error(`${skillPath}: missing "description"`)
  }
  if (body === '') throw new Error(`${skillPath}: empty skill body`)

  const modelInvocable = meta['disable-model-invocation'] === undefined
    ? true
    : !parseBoolean(meta['disable-model-invocation'])
  const userInvocable = meta['user-invocable'] === undefined
    ? true
    : parseBoolean(meta['user-invocable'])

  const skill = {
    name: skillName,
    description,
    content: `${integrationPreamble(skillName, directory)}\n\n${body}`,
    invocation: { modelInvocable, userInvocable },
    source: 'bundled',
    path: skillPath,
    resourceBase: { kind: 'directory', path: ROOT },
  }
  if (meta.whenToUse !== undefined && meta.whenToUse !== '') skill.whenToUse = meta.whenToUse
  if (meta.license !== undefined && meta.license !== '') {
    skill.metadata = { license: meta.license, upstream: 'google/elephant-goldfish-model' }
  }
  return skill
}

/**
 * Register every vendored EGM skill in the Harness skill registry.
 *
 * A malformed bundled skill throws so the plugin row reports a failed activation;
 * shipped content is tested, so a throw means a packaging regression.
 * @param {import('@deepseek-ai/cordis').Context} ctx owning plugin context.
 */
export function apply(ctx) {
  const directories = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  for (const directoryName of directories) {
    const skill = loadBundledSkill(directoryName)
    ctx.effect(() => ctx.skills.register(skill))
  }
  console.log(`[dsh-egm] registered ${directories.length} upstream Elephant-Goldfish skill(s)`)
}
