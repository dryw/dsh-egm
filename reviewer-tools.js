/**
 * Tool guard for the `egm-reviewer` agent preset.
 *
 * Mounted inside the reviewer preset, so its context is the reviewer's own agent
 * scope. It hides every global tool outside a read-only allowlist and denies any
 * non-allowlisted call as a second layer, which keeps reviewer isolation enforced
 * even if a future composition registers a tool this preset does not know about.
 *
 * Deliberately absent: file writes and edits, shell/terminal/command execution,
 * jobs, scheduling, goals, todo state, user questions, presentation, teammate or
 * subagent delegation, and every session-reading/transcript tool.
 */
export const name = 'dsh-egm-reviewer-tools'

export const inject = ['tools']

/** Global tool names a Goldfish reviewer may use. */
export const ALLOWED_TOOLS = [
  /^read$/u,
  /^read_image$/u,
  /^glob$/u,
  /^grep$/u,
  /^ops_read_files$/u,
  /^ops_read_pdf$/u,
  /^ops_read_docx$/u,
  /^ops_read_table$/u,
  /^ops_glob$/u,
  /^ops_grep$/u,
  /^ops_inspect_local_file$/u,
  /^ops_result$/u,
]

/**
 * Whether one tool name is allowed in a reviewer context.
 * @param {string} name tool name as registered.
 * @returns {boolean} whether reviewer isolation permits the tool.
 */
export function isAllowed(name) {
  return ALLOWED_TOOLS.some((pattern) => pattern.test(name))
}

/**
 * Hide every non-read-only tool this scope can see.
 *
 * A deny list is used rather than an allow list because it works even when a
 * read-only tool is not registered in the current composition: the names it
 * denies are measured from the visible tool set, so they always exist.
 * @param {{ schemas: () => Array<{ name: string }>, restrict: (filter: { deny: string[] }) => () => void }} tools tool registry view of the calling scope.
 */
export function hideNonReviewerTools(tools) {
  const denied = tools.schemas().map((schema) => schema.name).filter((name) => !isAllowed(name))
  return denied.length === 0 ? () => {} : tools.restrict({ deny: denied })
}

/**
 * Restrict and guard the reviewer's tools.
 * @param {import('@deepseek-ai/cordis').Context} ctx the reviewer agent's plugin context.
 */
export function apply(ctx) {
  ctx.effect(() => hideNonReviewerTools(ctx.tools))
  ctx.effect(() => ctx.tools.guard((exec) => (isAllowed(exec.name)
    ? undefined
    : `EGM Goldfish reviewers are read-only: the "${exec.name}" tool is not available in this reviewer context.`)))
}
