#!/usr/bin/env node
/**
 * Render the D2 diagram sources in `diagrams/` to the SVGs the README embeds,
 * and add accessibility metadata D2 does not emit: an explicit pixel size,
 * role="img", aria-label, and a <title>.
 *
 * The diagrams are authored in D2 (https://d2lang.com) and committed as D2
 * source, so edit the `.d2` files and re-run:
 *
 *   node diagrams/render.mjs
 *
 * A D2 CLI is required. It is not an npm dependency of this package: install it
 * from https://d2lang.com/tour/install, or point at a downloaded binary:
 *
 *   D2=/path/to/d2 node diagrams/render.mjs
 *
 * Themes:
 * - Both sources declare `vars.d2-config` with `theme-id: 0`,
 *   `dark-theme-id: 200` and their own padding, so D2 embeds both themes in the
 *   SVG (a `prefers-color-scheme: dark` block). Theme fills and text adapt to
 *   the reader's page while the explicit role accents (blue/orange/violet) stay
 *   fixed. Both are rendered with D2's defaults so that config applies.
 *
 * Background:
 * - D2 renders a transparent canvas. This script paints an adaptive full-canvas
 *   background (`#FFFFFF` light, `#1E1E2E` dark, matching D2's dark base) so a
 *   standalone SVG page is readable in both color schemes, not just the README.
 *
 * Only Node >= 22 builtins are used.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const D2 = process.env.D2 ?? 'd2'

/** One render target: D2 source, SVG output, D2 flags, and accessibility metadata. */
const TARGETS = [
  {
    source: join(ROOT, 'diagrams', 'workflow.d2'),
    output: join(ROOT, 'diagrams', 'workflow.svg'),
    // No flags: the source's vars.d2-config sets theme-id 0 + dark-theme-id 200.
    d2Args: [],
    title: 'Elephant Goldfish — Simplified Workflow',
    ariaLabel:
      'Simplified Elephant-Goldfish workflow. You describe your idea; the Elephant explores and ' +
      'drafts a design; the design document is the shared source of truth; fresh-context, ' +
      'read-only Goldfish reviewers surface findings, gaps and risks; you decide whether to ' +
      'approve implementation or send the work back for revision.',
  },
  {
    source: join(ROOT, 'diagrams', 'protocol.d2'),
    output: join(ROOT, 'diagrams', 'protocol.svg'),
    // No flags: the source's vars.d2-config sets theme-id 0, dark-theme-id 200 and pad 55.
    d2Args: [],
    title: 'Elephant-Goldfish — Detailed Development Protocol',
    ariaLabel:
      'Detailed Elephant-Goldfish development protocol sequence with five participants: you the ' +
      'engineer, the Elephant (deep context), the design document (source of truth), fresh-context ' +
      'Goldfish reviewers, and the repository of code and tests. An optional bootstrap maps the ' +
      'codebase. Phase 1 explores the idea and spawns six independent reviewers across six lenses. ' +
      'Phase 2 writes the specification with an iterate loop over design sections. Phase 3 challenges ' +
      'the design through five review stages: Initial Zoom Out, Comprehension, Design Critique, ' +
      'Intermediate Zoom Out and Implementation Readiness. Phase 4 resolves findings and approves the ' +
      'final specification, with an optional independent re-review. Phase 5 builds and verifies ' +
      'against the approved specification.',
  },
]

/** Escape the five XML text characters for attribute and element text. */
function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** Canvas colors for the adaptive background; #1E1E2E is D2's dark-theme base. */
const CANVAS_LIGHT = '#FFFFFF'
const CANVAS_DARK = '#1E1E2E'

/**
 * Paint a full-canvas background behind D2's transparent drawing, so the SVG is
 * readable when opened on its own page as well as embedded in the README.
 */
function addAdaptiveCanvas(svg) {
  if (svg.includes('egm-canvas')) return svg
  const openingTag = /<svg\b[^>]*>/u.exec(svg)
  if (openingTag === null) throw new Error('rendered SVG has no <svg> element')
  const viewBox = /viewBox="([0-9.\- ]+)"/u.exec(openingTag[0])
  if (viewBox === null) throw new Error('rendered SVG has no viewBox')
  const [minX, minY, width, height] = viewBox[1].trim().split(/[ ]+/u).map(Number)
  if (![minX, minY, width, height].every(Number.isFinite)) {
    throw new Error(`unreadable viewBox ${JSON.stringify(viewBox[1])}`)
  }
  const canvasStyle =
    `<style>.egm-canvas{fill:${CANVAS_LIGHT}}` +
    `@media (prefers-color-scheme:dark){.egm-canvas{fill:${CANVAS_DARK}}}</style>`
  const canvasRect =
    `<rect class="egm-canvas" x="${minX}" y="${minY}" ` +
    `width="${width}" height="${height}" stroke-width="0" />`
  return svg.replace('</title>', `</title>${canvasStyle}${canvasRect}`)
}

/** Add width/height, role, aria-label and a <title> to D2's outer SVG element. */
function addAccessibilityMetadata(svg, { title, ariaLabel }) {
  const openingTag = /<svg\b[^>]*>/u.exec(svg)
  if (openingTag === null) throw new Error('rendered SVG has no <svg> element')
  const tag = openingTag[0]
  const viewBox = /viewBox="([0-9.\- ]+)"/u.exec(tag)
  if (viewBox === null) throw new Error('rendered SVG has no viewBox')
  const [, , width, height] = viewBox[1].trim().split(/[ ]+/u).map(Number)
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`unreadable viewBox ${JSON.stringify(viewBox[1])}`)
  let newTag = tag
  if (!/\bwidth=/u.test(newTag)) newTag = newTag.replace(/^<svg/u, `<svg width="${width}" height="${height}"`)
  if (!/\brole=/u.test(newTag)) newTag = newTag.replace(/^<svg/u, '<svg role="img"')
  if (!/\baria-label=/u.test(newTag)) newTag = newTag.replace(/^<svg/u, `<svg aria-label="${escapeXml(ariaLabel)}"`)
  return svg.replace(tag, `${newTag}<title>${escapeXml(title)}</title>`)
}

let failed = false
for (const target of TARGETS) {
  const result = spawnSync(D2, [...target.d2Args, target.source, target.output], { encoding: 'utf8' })
  if (result.error !== undefined) {
    console.error(`cannot run D2 (${D2}): ${result.error.message}`)
    console.error('Install D2 from https://d2lang.com/tour/install or set D2=/path/to/d2')
    failed = true
    continue
  }
  if (result.status !== 0) {
    console.error(`d2 failed for ${target.source}:\n${result.stderr ?? result.stdout}`)
    failed = true
    continue
  }
  const original = readFileSync(target.output, 'utf8')
  const accessible = addAccessibilityMetadata(original, target)
  writeFileSync(target.output, addAdaptiveCanvas(accessible))
  const { length } = readFileSync(target.output)
  console.log(`rendered ${target.output} (${length} bytes)`)
}
if (failed) process.exitCode = 1
